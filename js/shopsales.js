// ====================================
// Sales Import - Uses Tesseract OCR
// ====================================
let worker = null;

async function ensureWorker() {
    if (worker) return worker;

    document.getElementById('parsedSalesResult').innerHTML = `
    <h3 style="color:var(--accent)">Loading OCR Engine... (first time ~8–15s)</h3>
    <p style="text-align:center;margin:40px;">Please wait — this only happens once per session</p>
  `;

    worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
            if (m.status === 'recognizing text') {
                document.getElementById('parsedSalesResult').innerHTML = `
          <h3 style="color:var(--accent)">Reading screenshot... ${Math.round(m.progress * 100)}%</h3>
          <div style="margin:40px auto;width:80px;height:80px;border:12px solid #333;border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>
          <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
        `;
            }
        }
    });

    document.getElementById('parsedSalesResult').innerHTML = `<p style="color:var(--green);text-align:center;">OCR Ready!</p>`;
    return worker;
}

document.getElementById('salesImageUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const worker = await ensureWorker();

    // Only update the result area — editor stays untouched!
    const resultDiv = document.getElementById('parsedSalesResult');
    resultDiv.innerHTML = `<h3 style="color:var(--accent)">Processing image...</h3><div style="text-align:center;margin:60px;"><div class="spinner"></div></div>`;

    const img = new Image();
    img.onload = async () => {
        // === 1. Load & binarize (your proven threshold) ===
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const val = gray > 100 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = val;
        }
        ctx.putImageData(imageData, 0, 0);

        // === 2. Upscale 4× (critical) ===
        const big = document.createElement('canvas');
        big.width = canvas.width * 4;
        big.height = canvas.height * 4;
        const bctx = big.getContext('2d');
        bctx.imageSmoothingEnabled = false;
        bctx.drawImage(canvas, 0, 0, big.width, big.height);

        // === 3. OCR ===
        const result = await worker.recognize(big, {
            tessedit_pageseg_mode: '4',
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz $.,-:()',
            preserve_interword_spaces: '1',
            user_defined_dpi: '300',
        });

        // === 4. THE FINAL CLEANER THAT FIXES EVERYTHING ===
        const perfectLines = result.data.text.split('\n')
            .map(l => l.trim())
            .filter(Boolean)
            .map(line => applyCorrections(line));  // ← THIS LINE WAS MISSING OR WEAK


        const perfectText = perfectLines.join('\n');

        // === 5. Show beautiful clean result ===
        resultDiv.innerHTML = `
      <h3 style="color:#0f8; margin-bottom:15px;">Ready — ${perfectLines.length} lines cleaned</h3>
      <textarea id="extractedTextArea" style="width:100%; height:620px; background:#000; color:#0f0; font-family:monospace; font-size:20px; padding:18px; border:4px solid #0f8; border-radius:12px; resize:vertical;">${perfectText}</textarea>
      <div style="margin-top:20px; text-align:center;">
        <button onclick="navigator.clipboard.writeText(document.getElementById('extractedTextArea').value)" 
                style="padding:14px 40px; margin:10px; font-size:20px; background:#333; color:#fff; border:none; border-radius:10px; cursor:pointer;">
          Copy Clean Text
        </button>
        <button onclick="importFromTextarea()" 
                style="padding:18px 80px; margin:10px; font-size:26px; background:#0f8; color:#000; border:none; border-radius:12px; cursor:pointer; font-weight:bold;">
          IMPORT SALES NOW
        </button>
      </div>
    `;
        showReapplyButton();
    };
    img.src = URL.createObjectURL(file);
});

async function importFromTextarea() {
    const text = document.getElementById('extractedTextArea')?.value || '';
    if (!text.trim()) return showToast("fail", 'No data!');

    const sales = [];
    const re = /^(.+?)\s+([0-9]+)\s+\$([0-9.,]+)\s+\$([0-9.,]+)\s+/;
    text.split('\n').forEach(line => {
        const m = line.match(re);
        if (!m) return;
        const item = m[1].trim();
        if (!item) return;
        sales.push({
            item,
            qty: parseInt(m[2], 10),
            total: parseFloat(m[4].replace(/,/g, ''))
        });
    });

    if (sales.length === 0) return showToast("fail", 'No valid sales found');

    // Combine same items
    const map = {};
    sales.forEach(s => {
        if (!map[s.item]) map[s.item] = { qty: 0, total: 0 };
        map[s.item].qty += s.qty;
        map[s.item].total += s.total;
    });

    let finalItems = Object.keys(map).map(item => {
        const qty = map[item].qty;
        const total = map[item].total;
        const unitPrice = total / qty;

        const costPerUnit = Calculator.cost(item) || 0;
        const totalCost = costPerUnit * qty;
        const profit = total - totalCost;

        return {
            original: item,
            item,
            qty,
            total,
            unitPrice: unitPrice.toFixed(2),
            costPerUnit: costPerUnit.toFixed(2),
            totalCost: totalCost.toFixed(2),
            profit: profit.toFixed(2)
        };
    });

    // Fuzzy matching setup
    // === FUZZY MATCHING SETUP ===
    const allKnownItems = [
        ...Object.keys(App.state.recipes || {}),
        ...Object.keys(App.state.rawPrice || {})
    ];

    function levenshtein(a, b) {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }
        return matrix[b.length][a.length];
    }

    function similarity(a, b) {
        if (a === b) return 1.0;
        let longer = a.length > b.length ? a : b;
        let shorter = a.length > b.length ? b : a;
        if (longer.length === 0) return 1.0;
        return (longer.length - editDistance(longer, shorter)) / longer.length;
    }

    function editDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    function findBestMatch(name) {
        let best = null;
        let bestScore = 0;
        allKnownItems.forEach(known => {
            const score = similarity(name, known);
            if (score > bestScore && score >= 0.75) {
                best = known;
                bestScore = score;
            }
        });
        return bestScore >= 0.75 ? { match: best, score: bestScore } : null;
    }
    // === END FUZZY SETUP ===

    // Detect unknown items and find suggestions
    const unknownItems = finalItems.filter(s => !(App.state.recipes[s.item] || App.state.rawPrice[s.item]));
    let suggestions = [];
    let correctedCount = 0;

    if (unknownItems.length > 0) {
        unknownItems.forEach(u => {
            const suggestion = findBestMatch(u.original);
            if (suggestion) {
                suggestions.push({
                    from: u.original,
                    to: suggestion.match,
                    score: suggestion.score
                });
            }
        });

        let message = `<strong style="color:#ff0; font-size:18px;">⚠️ ${unknownItems.length} UNKNOWN ITEM(S) DETECTED ⚠️</strong><br><br>`;
        message += `These items do not exactly match any recipe or raw material.<br>`;
        message += `Shop stock will <strong>not</strong> be deducted unless corrected.<br><br>`;

        if (suggestions.length > 0) {
            message += `<strong style="color:#0f8;">Suggested auto-corrections (≥75% match):</strong><br><br>`;
            suggestions.forEach(sug => {
                const itemData = finalItems.find(f => f.original === sug.from);
                message += `<strong>"${sug.from}"</strong> → <strong style="color:#0af;">"${sug.to}"</strong> (${(sug.score * 100).toFixed(0)}% match)<br>`;
                message += `<small>${itemData.qty}× sold — $${itemData.total.toFixed(2)}</small><br><br>`;
            });
            message += `<strong style="color:#0f8;">Apply these ${suggestions.length} correction(s)?</strong><br><br>`;
            correctedCount = suggestions.length;
        }

        message += `<strong>Full list:</strong><br><br>`;
        unknownItems.forEach(u => {
            const sug = suggestions.find(s => s.from === u.original);
            message += `• ${u.qty}× <strong>${u.item}</strong> — $${u.total.toFixed(2)}`;
            if (sug) message += ` <span style="color:#0f8;">(will be corrected)</span>`;
            else message += ` <span style="color:#fa0;">(no suggestion)</span>`;
            message += `<br>`;
        });

        message += `<br><br><strong>Continue with import?</strong>`;

        const confirmed = await showConfirm(message);
        if (!confirmed) {
            showToast("info", "Import cancelled — you can fix OCR text or add correction rules");
            return;
        }

        // User confirmed — now apply corrections and proceed
        if (suggestions.length > 0) {
            suggestions.forEach(sug => {
                const index = finalItems.findIndex(f => f.original === sug.from);
                if (index !== -1) {
                    finalItems[index].item = sug.to;
                }
            });
            showToast("success", `Auto-corrected ${suggestions.length} item name(s)! Stock will update correctly.`);
        } else if (unknownItems.length > 0) {
            showToast("warn", `${unknownItems.length} item(s) remain unknown — stock unchanged for them`);
        }

        // NOW proceed with import
        console.log("User confirmed — proceeding with import");
        proceedWithImport(finalItems);
        return;
    }

    // No unknowns — proceed immediately
    proceedWithImport(finalItems);
}

function proceedWithImport(items) {
    console.log("Proceeding to import sales");
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const timeStr = today.toTimeString().slice(0, 8).replace(/:/g, '');

    const batchId = `SHOP-${dateStr.replace(/-/g, '').slice(2)}-${timeStr}`;

    const grandTotal = items.reduce((a, b) => a + b.total, 0);
    const taxRate = App.state.shopTaxRate || 0.08;

    // Ledger entries
    items.forEach((s, index) => {
        const itemTax = s.total * taxRate;
        const itemNet = s.total - itemTax;

        const record = {
            id: `${batchId}-${String(index + 1).padStart(3, '0')}`,
            batchId: batchId,
            date: dateStr,
            time: today.toTimeString().slice(0, 8),
            type: "shop_sale_item",
            item: s.item,
            qty: s.qty,
            unitPrice: parseFloat(s.unitPrice),
            total: s.total,
            amount: itemNet,
            taxAmount: itemTax,
            taxRate: taxRate,
            profit: parseFloat(s.profit),
            employee: "Auto-Import",
            description: `${s.item} × ${s.qty} sold — Profit: $${s.profit} | Tax: $${itemTax.toFixed(2)}`
        };
        App.state.ledger.push(record);
    });

    // Deduct stock for known items
    items.forEach(s => {
        if (App.state.recipes[s.item] || App.state.rawPrice[s.item]) {
            App.state.shopStock[s.item] = Math.max(0, (App.state.shopStock[s.item] || 0) - s.qty);
        }
    });

    App.save("shopStock");
    App.save("ledger");

    showToast("success", `Imported ${items.length} item types — $${grandTotal.toFixed(2)} total!`);
    Inventory.render();
    Ledger.render();
    showTodaySales({
        items: items,
        totalSale: grandTotal,
        totalProfit: grandTotal - items.reduce((a, b) => a + (parseFloat(b.costPerUnit) * b.qty), 0),
        date: dateStr,
        batchId
    });
    ShopSales.render();
}



// Initialise Corrections
let CORRECTIONS = {};

async function loadCorrections() {
    const saved = await ls.get('ocrCorrections');
    if (saved) {
        try { CORRECTIONS = JSON.parse(saved); }
        catch (e) { CORRECTIONS = getDefaultCorrections(); }
    } else {
        CORRECTIONS = getDefaultCorrections();
    }
}

function getDefaultCorrections() {
    return {
        "De1uxe": "Deluxe",
        "81ue": "Blue",
        "R0pe": "Rope",
        "L0g[s:]*": "Logs",
        "W00den": "Wooden",
        "P01e": "Pole",
        "Rif1e": "Rifle",
        ":t0ck": "Stock",
        ":1uice 80x": "Sluice Box",
        "Tasso": "Lasso",
        "CampF1re": "Camp Fire",
        "Fermentation Barrell": "Fermentation Barrel",
        "Drug Mixing Pot": "Drug Mixing Pot"
    };
}

async function saveCorrections() {
    await ls.set('ocrCorrections', JSON.stringify(CORRECTIONS));
    App.state.ocrCorrections = CORRECTIONS;
    App.save("ocrCorrections"); // save to firbase
}

function renderRulesList() {
    const list = document.getElementById('rulesList');
    list.innerHTML = Object.entries(CORRECTIONS)
        .map(([wrong, right]) => `
      <div style="padding:8px; background:#222; margin:5px 0; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
        <code style="color:#ff0;">${wrong}</code> → <strong style="color:#0f0;">${right}</strong>
        <button onclick="deleteRule('${wrong}')" style="margin-left:20px; background:#800; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Delete</button>
      </div>
    `).join('');
}

function deleteRule(wrong) {
    delete CORRECTIONS[wrong];
    saveCorrections();
    renderRulesList();
}

// Event listeners for corrections
document.getElementById('editCorrectionsBtn').onclick = () => {
    document.getElementById('correctionsEditor').style.display = 'block';
    renderRulesList();
};

document.getElementById('closeEditorBtn').onclick = () => {
    document.getElementById('correctionsEditor').style.display = 'none';
};

document.getElementById('addRuleBtn').onclick = () => {
    const wrong = document.getElementById('newWrong').value.trim();
    const right = document.getElementById('newRight').value.trim();
    if (wrong && right) {
        CORRECTIONS[wrong] = right;
        saveCorrections();
        renderRulesList();
        document.getElementById('newWrong').value = '';
        document.getElementById('newRight').value = '';
    }
};

document.getElementById('exportBtn').onclick = () => {
    const data = JSON.stringify(CORRECTIONS, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr-corrections.json';
    a.click();
};

document.getElementById('importBtn').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                CORRECTIONS = JSON.parse(ev.target.result);
                saveCorrections();
                renderRulesList();
                showToast("success", 'Rules imported successfully!');
            } catch (err) {
                showToast("fail", 'Invalid JSON file');
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

document.getElementById('resetBtn').onclick = () => {
    if (showConfirm('Reset all rules to default?')) {
        CORRECTIONS = getDefaultCorrections();
        saveCorrections();
        renderRulesList();
    }
};

// ====== 4. Use the live corrections in OCR 
function applyCorrections(text) {
    let s = text.trim();

    // === STEP 1: APPLY USER RULES FIRST (BEFORE ANY DESTRUCTIVE CLEANUP) ===
    for (const [wrong, right] of Object.entries(CORRECTIONS)) {
        try {
            const regex = new RegExp(wrong, 'gi');
            s = s.replace(regex, right);
        } catch (e) {
            // ignore invalid regex from user
        }
    }

    // === STEP 2: Smart O/0, l/1, I/1 fixes (context-aware) ===
    // Only replace O → 0 when it's clearly money or number
    s = s.replace(/O(?=\$|\d)/g, '0');
    s = s.replace(/0(?=[A-Za-z]{3,})/g, 'O'); // O in words

    s = s.replace(/[Il](?=\$|\d)/g, '1');
    s = s.replace(/1(?=[A-Za-z]{3,})/g, 'l');

    // Fix common known garbage
    s = s.replace(/ba1/g, 'Bag');
    s = s.replace(/Whee1/g, 'Wheel');
    s = s.replace(/1eather/g, 'Leather');
    s = s.replace(/Tasso/g, 'Lasso');
    s = s.replace(/1TEM/g, 'ITEM');
    s = s.replace(/PR1CE/g, 'PRICE');
    s = s.replace(/T1ME/g, 'TIME');

    // Fix broken times
    s = s.replace(/(\d{2})(\d{2})$/, '$1:$2');
    s = s.replace(/O(\d)/g, '0$1');  // Ok13 → 00:13
    s = s.replace(/OO:/g, '00:');

    // Fix year
    s = s.replace(/1899-11-O(\d)/g, '1899-11-0$1');

    return s.trim();
}

// Re-apply all current rules to the text in the textarea
function reapplyAllFixes() {
    const textarea = document.getElementById('extractedTextArea');
    if (!textarea) return showToast("fail", "No OCR result to fix!");

    const lines = textarea.value.split('\n');
    const fixedLines = lines.map(line => {
        // Keep header line untouched
        if (line.includes('ITEM') || line.includes('AMOUNT') || line.includes('PRICE')) {
            return applyCorrections(line);
        }

        // For data lines: if it has $ signs, it's a valid sale line
        if (line.includes('$')) {
            return applyCorrections(line);
        }

        // If line starts with number but has no item name → try to recover from previous line?
        // Skip empty or garbage lines
        return line.trim() === '' ? '' : applyCorrections(line);
    });

    textarea.value = fixedLines.filter(Boolean).join('\n');
    showToast("success", 'All OCR fixes successfully re-applied! Names are back!');
}

// Show the re-apply button once OCR finishes
function showReapplyButton() {
    document.getElementById('reapplyButton').style.display = 'block';
}
// Load on start
loadCorrections();

// ========================
// Shop Sales
// ========================
const ShopSales = {
    render() {
        const tbody = document.getElementById('shopSalesTable');
        if (!tbody) return;

        // Safety first — wait for App to be ready
        if (typeof App === 'undefined' || !App.state || !App.state.ledger) {
            // Try again in 200ms
            setTimeout(() => ShopSales.render?.(), 200);
            return;
        }
        const sales = (App.state.ledger)
            .filter(r => r.type === "shop_sale_item")
            .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(b.time));


        // Default fallback
        // Default fallback
        const defaultRate = 0.08;
        const savedRate = App.state.shopTaxRate ?? defaultRate;
        const percent = (savedRate * 100).toFixed(2);

        const input = document.getElementById('shopTaxRateInput');
        const display = document.getElementById('currentTaxDisplay');

        if (input) {
            input.value = percent;  // ← THIS WAS MISSING OR NOT WORKING
        }
        if (display) {
            display.textContent = percent + '%';
        }

        console.log("Tax rate initialized:", savedRate, "→", percent + "%");

        let html = '';
        let currentBatch = null;
        let batchGross = 0;
        let batchTax = 0;
        let batchNet = 0;
        let batchProfit = 0;
        let batchCost = 0;

        sales.forEach(r => {
            const costPerUnit = parseFloat(r.costPerUnit) || Calculator.cost(r.item) || 0;
            const profit = parseFloat(r.profit) || (r.total - (costPerUnit * r.qty));
            const taxRate = r.taxRate || App.state.shopTaxRate || 0.08;
            const taxAmount = r.taxAmount || (r.total * taxRate);
            const netAmount = r.amount || (r.total - taxAmount);
            const netProfitAfterTax = profit - taxAmount;
            // Batch grouping
            if (currentBatch !== r.batchId) {
                if (currentBatch !== null) {
                    // Batch summary row
                    html += `
                    <tr style="background:#222; font-weight:bold;">
                        <td colspan="5" style="text-align:right; color:#aaa;">Batch Total:</td>
                        <td style="text-align:right; color:var(--green);">${batchGross.toFixed(2)}</td>
                        <td style="text-align:right; color:#888;">${batchCost.toFixed(2)}</td>
                        <td style="text-align:right; color:${batchProfit >= 0 ? '#0f8' : '#f66'};">
                            $${batchProfit.toFixed(2)}
                        </td>
                        <td style="text-align:right; color:#ff9800;">$${batchTax.toFixed(2)}</td>
                        <td style="text-align:right; color:#0af;">$${batchNet.toFixed(2)}</td>
                        <td></td>
                    </tr>
                    </tbody></table>
                `;
                }

                currentBatch = r.batchId;
                batchGross = batchTax = batchNet = batchProfit = batchCost = 0;

                html += `
                <div style="margin:20px 0 10px; padding:8px; background:var(--accent); color:white; border-radius:6px; font-weight:bold;">
                    Batch: ${r.batchId} — ${r.date} ${r.time}
                </div>
                <table style="width:100%; border-collapse:collapse;">
                <tbody>
            `;
            }

            batchGross += r.total;
            batchTax += taxAmount;
            batchNet += netAmount;
            batchProfit += profit;
            batchCost += costPerUnit * r.qty;

            html += `
            <tr style="border-bottom:1px solid #333;">
                <td style="font-size:13px; color:#888;">${r.date}<br>${r.time}</td>
                <td style="font-family:monospace; font-size:12px;">${r.id}</td>
                <td><strong>${r.item}</strong></td>
                <td style="text-align:center;">${r.qty}</td>
                <td style="text-align:right;">$${parseFloat(r.unitPrice || 0).toFixed(2)}</td>
                <td style="text-align:right; color:var(--green); font-weight:bold;">
                    $${r.total.toFixed(2)}
                </td>
                <td style="text-align:right; color:#888;">
                    $${costPerUnit.toFixed(2)}
                </td>
                <td style="text-align:right; color:${profit >= 0 ? '#0f8' : '#f66'}; font-weight:bold;">
                    $${profit.toFixed(2)}
                </td>
                <td style="text-align:right; color:#ff9800;">
                    $${taxAmount.toFixed(2)}
                </td>
                <td style="text-align:right; color:#0af; font-weight:bold;">
                    $${netProfitAfterTax.toFixed(2)}
                </td>
                <td style="text-align:center; color:#0af;">Shop Sale</td>
            </tr>
        `;
        });

        // Final batch summary
        if (currentBatch !== null) {
            html += `
            <tr style="background:#222; font-weight:bold;">
                <td colspan="5" style="text-align:right; color:#aaa;">Batch Total:</td>
                <td style="text-align:right; color:var(--green);">${batchGross.toFixed(2)}</td>
                <td style="text-align:right; color:#888;">${batchCost.toFixed(2)}</td>
                <td style="text-align:right; color:${batchProfit >= 0 ? '#0f8' : '#f66'};">
                    $${batchProfit.toFixed(2)}
                </td>
                <td style="text-align:right; color:#ff9800;">$${batchTax.toFixed(2)}</td>
                <td style="text-align:right; color:#0af;">$${(batchProfit - batchTax).toFixed(2)}</td>
                <td></td>
            </tr>
            </tbody></table>
        `;
        }

        tbody.innerHTML = html || '<tr><td colspan="11" style="text-align:center; color:#888; padding:50px;">No sales recorded yet</td></tr>';
    },

    viewDetail(id) {
        const sale = App.state.ledger.find(e => e.id === id);
        if (!sale) return showToast("fail", "Not found");
        showToast("success", `SALE DETAILS
                ID: ${sale.id}
                Batch: ${sale.batchId}
                Date: ${sale.date} ${sale.time}
                Item: ${sale.item}
                Quantity: ${sale.qty}
                Unit Price: $${parseFloat(sale.unitPrice).toFixed(2)}
                Total: $${sale.amount.toFixed(2)}
                Auto-imported`);
    },
    initTax() {
        const rate = (App.state.shopTaxRate || 0.08) * 100;
        const input = document.getElementById('shopTaxRateInput');
        const display = document.getElementById('currentTaxDisplay');
        if (input) input.value = rate.toFixed(2);
        if (display) display.textContent = rate.toFixed(2) + '%';
    },

    async saveTaxRate() {
        const input = document.getElementById('shopTaxRateInput');
        if (!input) return;

        let rate = parseFloat(input.value) || 0;
        if (rate < 0) rate = 0;
        if (rate > 100) rate = 100;

        const decimalRate = rate / 100;
        App.state.shopTaxRate = decimalRate;

        try {
            await App.save("shopTaxRate");  // ← NOW AWAIT IT
            document.getElementById('currentTaxDisplay').textContent = rate.toFixed(2) + '%';
            showToast("success", `Tax rate saved: ${rate.toFixed(2)}%`);
            ShopSales.initTax?.();  // refresh display just in case
        } catch (err) {
            showToast("fail", "Tax rate NOT saved — check internet");
            // Optional: revert input
            input.value = (App.state.shopTaxRate * 100).toFixed(2);
        }
    }
};

function showTodaySales(importRecord) {
    const container = document.getElementById('todaySalesDisplay');
    const table = document.getElementById('todaySalesTable');
    const totalEl = document.getElementById('todayTotal');
    const itemsEl = document.getElementById('todayItems');
    const summary = document.getElementById('todaySalesSummary');

    const now = new Date();
    const dateTime = now.toLocaleString();

    let html = '';
    let grandTotal = 0;
    let grandProfit = 0;
    let grandCost = 0;

    importRecord.items.forEach((s, index) => {
        const costPerUnit = parseFloat(s.costPerUnit) || 0;
        const profit = parseFloat(s.profit) || 0;
        const unitPrice = parseFloat(s.unitPrice);

        // Use batchId + index as visible ID (matches ledger)
        const displayId = importRecord.batchId + '-' + String(index + 1).padStart(3, '0');

        html += `<tr>
                    <td style="font-size:13px; color:#888;">${dateTime}</td>
                    <td style="font-family:monospace; font-size:12px;">${displayId}</td>
                    <td><strong>${s.item}</strong></td>
                    <td style="text-align:center;">${s.qty}</td>
                    <td style="text-align:right;">$${unitPrice.toFixed(2)}</td>
                    <td style="text-align:right; color:var(--green); font-weight:bold;">$${s.total.toFixed(2)}</td>
                    <td style="text-align:right; color:#888;">$${costPerUnit.toFixed(2)}</td>
                    <td style="text-align:right; color:${profit >= 0 ? '#0f8' : '#f66'}; font-weight:bold;">
                        $${profit.toFixed(2)}
                    </td>
                    <td style="text-align:center; color:#0af;">Auto-Import</td>
                </tr>`;

        grandTotal += s.total;
        grandProfit += profit;
        grandCost += costPerUnit * s.qty;
    });

    table.innerHTML = html;
    totalEl.textContent = '$' + grandTotal.toFixed(2);
    itemsEl.textContent = importRecord.items.length;

    summary.innerHTML = `
        Gross: <span style="color:var(--green)">$${grandTotal.toFixed(2)}</span> | 
        Tax (${(taxRate * 100).toFixed(1)}%): <span style="color:#ff9800;">$${grandTax.toFixed(2)}</span> | 
        <strong style="color:#0af;">Net Cash: $${grandNet.toFixed(2)}</strong> | 
        Profit: <span style="color:${grandProfit >= 0 ? '#0f8' : '#f66'}">$${grandProfit.toFixed(2)}</span>
        across ${importRecord.items.length} items
    `;

    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
}

// =============================================
// TOTAL REVENUE SUMMARY — FINAL & GUARANTEED TO WORK
// =============================================
function updateShopRevenueSummary() {
    const div = document.getElementById('shopTotalRevenue');
    if (!div) return;

    const sales = (App.state.ledger || [])
        .filter(r => r.type === "shop_sale_item");

    if (sales.length === 0) {
        div.innerHTML = `<div style="text-align:center; padding:40px; color:#888; font-size:18px;">No sales recorded yet</div>`;
        return;
    }

    let totalGross = 0;
    let totalTax = 0;
    let totalProfitBeforeTax = 0;

    sales.forEach(r => {
        const gross = r.total || 0;
        const tax = r.taxAmount || (gross * (r.taxRate || App.state.shopTaxRate || 0.08));
        const profitBeforeTax = parseFloat(r.profit) || 0;

        totalGross += gross;
        totalTax += tax;
        totalProfitBeforeTax += profitBeforeTax;
    });

    const netProfitAfterTax = totalProfitBeforeTax - totalTax;

    div.innerHTML = `
        <div style="background:var(--card); padding:5px; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 5px 0; color:var(--accent); font-size:22px; text-align:center;">Total Shop Revenue</h3>
            <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
                <div style="background:#111; padding:16px; border-radius:10px; border:2px solid; border-color:var(--green);text-align:center; min-width:140px; flex:1;">
                    <div style="color:#888; font-size:13px;">Gross Sales</div>
                    <div style="font-size:24px; font-weight:bold; color:var(--green); margin-top:4px;">
                        $${totalGross.toFixed(2)}
                    </div>
                </div>
                <div style="background:#111; padding:16px; border-radius:10px; text-align:center; min-width:140px; flex:1; border:2px solid #0f8;">
                    <div style="color:#888; font-size:13px;">Total Profit (Before Tax)</div>
                    <div style="font-size:24px; font-weight:bold; color:#0f8; margin-top:4px;">
                        $${totalProfitBeforeTax.toFixed(2)}
                    </div>
                </div>
                <div style="background:#111; padding:16px; border-radius:10px; border:2px solid; border-color:#ff9800; text-align:center; min-width:140px; flex:1;">
                    <div style="color:#888; font-size:13px;">Tax Paid</div>
                    <div style="font-size:24px; font-weight:bold; color:#ff9800; margin-top:4px;">
                        $${totalTax.toFixed(2)}
                    </div>
                </div>
                <div style="background:#111; padding:16px; border-radius:10px; text-align:center; min-width:140px; flex:1; border:2px solid #0af;">
                    <div style="color:#888; font-size:13px;">Net Profit (After Tax)</div>
                    <div style="font-size:24px; font-weight:bold; color:#0af; margin-top:4px;">
                        $${netProfitAfterTax.toFixed(2)}
                    </div>
                </div>
            </div>
            <div style="margin-top:16px; color:#888; font-size:14px; text-align:center;">
                Based on <strong>${sales.length}</strong> sale${sales.length === 1 ? '' : 's'} across all time
            </div>
        </div>
    `;
}

/* // =============================================
// TOTAL REVENUE SUMMARY — FINAL, BULLETPROOF, ALWAYS WORKS
// =============================================
function updateShopRevenueSummary() {
    const div = document.getElementById('shopTotalRevenue');
    if (!div) {
        console.warn("shopTotalRevenue div not found");
        return;
    }

    // Safety first — wait for App.state
    if (typeof App === 'undefined' || !App.state || !App.state.ledger) {
        div.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">Loading revenue data...</div>`;
        setTimeout(updateShopRevenueSummary, 500);
        return;
    }

    const sales = App.state.ledger.filter(r => r.type === "shop_sale_item");
    if (sales.length === 0) {
        div.innerHTML = `<div style="text-align:center; padding:40px; color:#888; font-size:18px;">No sales recorded yet</div>`;
        return;
    }

    let totalGross = 0;
    let totalTax = 0;
    let totalProfitBeforeTax = 0;

    sales.forEach(r => {
        const gross = r.total || 0;
        const tax = r.taxAmount || (gross * (r.taxRate || App.state.shopTaxRate || 0.08));
        const profitBeforeTax = parseFloat(r.profit) || 0;

        totalGross += gross;
        totalTax += tax;
        totalProfitBeforeTax += profitBeforeTax;
    });

    const netProfitAfterTax = totalProfitBeforeTax - totalTax;

    div.innerHTML = `
        <div style="background:var(--card); padding:20px; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 16px 0; color:var(--accent); font-size:22px; text-align:center;">Total Shop Revenue</h3>
            <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
                <div style="background:#111; padding:16px; border-radius:10px; text-align:center; min-width:140px; flex:1;">
                    <div style="color:#888; font-size:13px;">Gross Sales</div>
                    <div style="font-size:24px; font-weight:bold; color:var(--green); margin-top:4px;">
                        $${totalGross.toFixed(2)}
                    </div>
                </div>
                <div style="background:#111; padding:16px; border-radius:10px; text-align:center; min-width:140px; flex:1;">
                    <div style="color:#888; font-size:13px;">Tax Collected</div>
                    <div style="font-size:24px; font-weight:bold; color:#ff9800; margin-top:4px;">
                        $${totalTax.toFixed(2)}
                    </div>
                </div>
                <div style="background:#111; padding:16px; border-radius:10px; text-align:center; min-width:140px; flex:1; border:2px solid #0f8;">
                    <div style="color:#888; font-size:13px;">Total Profit (Before Tax)</div>
                    <div style="font-size:24px; font-weight:bold; color:#0f8; margin-top:4px;">
                        $${totalProfitBeforeTax.toFixed(2)}
                    </div>
                </div>
                <div style="background:#111; padding:16px; border-radius:10px; text-align:center; min-width:140px; flex:1; border:2px solid #0af;">
                    <div style="color:#888; font-size:13px;">Net Profit (After Tax)</div>
                    <div style="font-size:24px; font-weight:bold; color:#0af; margin-top:4px;">
                        $${netProfitAfterTax.toFixed(2)}
                    </div>
                </div>
            </div>
            <div style="margin-top:16px; color:#888; font-size:14px; text-align:center;">
                Based on <strong>${sales.length}</strong> sale${sales.length === 1 ? '' : 's'} across all time
            </div>
        </div>
    `;
} */

// =============================================
// FINAL AUTO-LOAD — WORKS 100% ON FIRST LOAD — NO REFRESH NEEDED
// =============================================


function loadData() {
    ShopSales.render()
    updateShopRevenueSummary()
}
function autoLoadShopSales() {
    // Primary method: use App.onReady if available (cleanest)
    if (typeof App !== 'undefined' && typeof App.onReady === 'function') {
        App.onReady(() => loadData());
        return;
    }

    // Fallback: poll until App.state is ready
    const maxWait = 10000; // 10 seconds max
    const start = Date.now();

    const checker = setInterval(() => {
        if (typeof App !== 'undefined' && App.state && App.state.ledger !== undefined) {
            clearInterval(checker);
            loadData();
        }
        else if (Date.now() - start > maxWait) {
            clearInterval(checker);
            console.warn("ShopSales: App.state never became ready");
        }
    }, 100);
}

// Run it
autoLoadShopSales();