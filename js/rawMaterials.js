// =================================
// Raw Materials Manager / Editor
// =================================
const RawMaterials = {
    addPurchaseLine() {
        const container = document.getElementById("purchaseLines");

        const line = document.createElement("div");
        line.className = "purchase-line";
        line.style = "display:grid; grid-template-columns:3.5fr 1fr 1.5fr 1.5fr 1.2fr 1fr; gap:14px; align-items:center; margin-bottom:14px; padding:8px 0;";

        line.innerHTML = `
            <!-- ITEM SEARCH -->
            <div style="position:relative;">
                    <input type="text" class="item-search" placeholder="Search item..."
                        style="width:92%; padding:14px 16px; font-size:16px; background:#001122; border:1px solid #0af; border-radius:8px; color:white;">
                    <div class="search-results"
                        style="display:none; position:absolute; top:100%; left:0; right:0; background:#000; border:1px solid #0af; border-top:none; max-height:200px; overflow-y:auto; z-index:10; border-radius:0 0 8px 8px;">
                    </div>
                </div>
                <input type="number" class="qty-input" placeholder="Qty" min="1" value="1"
                    style="width:70%; padding:14px; font-size:16px; background:#001122; border:1px solid #0af; border-radius:8px; text-align:center;">
                <input type="number" step="0.01" class="price-input active-input" placeholder="Price/unit (0.00 = free)"
                    style="width:70%; padding:14px; font-size:16px; background:#002200; border:1px solid #0f8; border-radius:8px; color:#0f8; font-weight:bold;">
                <input type="number" step="0.01" class="total-input" placeholder="Total" readonly
                    style="width:60%; padding:14px; font-size:16px; background:#001122; border:1px solid #444; border-radius:8px; color:#0af; font-weight:bold;">
                <div style="width:50%;text-align:right; font-weight:bold; color:#0f8; font-size:20px;"
                    class="line-total">$0.00
                </div>
                <button type="button" class="danger small"
                    onclick="this.closest('.purchase-line').remove(); RawMaterials.updateMultiTotal()"
                    style="padding:14px 18px; font-size:20px; font-weight:bold; border-radius:8px;">Remove</button>
            </div>
        `;

        container.appendChild(line);

        // Focus the new item field
        line.querySelector(".item-search").focus();

        // Re-attach all listeners
        this.setupSearchListeners();
        this.setupFieldSwitching();
        this.updateMultiTotal();
    },

    // Update total whenever anything changes
    updateMultiTotal() {
        let grandTotal = 0;

        document.querySelectorAll(".purchase-line").forEach(line => {
            const qty = parseFloat(line.querySelector(".qty-input").value) || 0;
            const priceInput = line.querySelector(".price-input");
            const totalInput = line.querySelector(".total-input");
            const lineTotalEl = line.querySelector(".line-total");

            let pricePer = parseFloat(priceInput.value) || 0;
            let totalPrice = parseFloat(totalInput.value) || 0;

            let lineTotal = 0;

            if (priceInput.classList.contains("active-input") && qty > 0) {
                // Price per unit is being edited
                lineTotal = pricePer * qty;
                totalInput.value = lineTotal > 0 ? lineTotal.toFixed(2) : "";
            } else if (totalInput.classList.contains("active-input") && qty > 0) {
                // Total price is being edited
                lineTotal = totalPrice;
                pricePer = qty > 0 ? (totalPrice / qty) : 0;
                priceInput.value = pricePer > 0 ? pricePer.toFixed(4) : "";
            } else if (pricePer > 0 && qty > 0) {
                lineTotal = pricePer * qty;
                totalInput.value = lineTotal.toFixed(2);
            } else if (totalPrice > 0 && qty > 0) {
                lineTotal = totalPrice;
                pricePer = totalPrice / qty;
                priceInput.value = pricePer.toFixed(4);
            }

            lineTotalEl.textContent = "$" + lineTotal.toFixed(2);
            grandTotal += lineTotal;
        });

        document.getElementById("multiTotalDisplay").textContent = "$" + grandTotal.toFixed(2);
    },

    // Make clicking the field switch which one is editable
    setupFieldSwitching() {
        document.querySelectorAll(".purchase-line").forEach(line => {
            const priceInput = line.querySelector(".price-input");
            const totalInput = line.querySelector(".total-input");

            priceInput.onclick = () => {
                priceInput.classList.add("active-input");
                priceInput.removeAttribute("readonly");
                priceInput.style.background = "#002200";

                totalInput.classList.remove("active-input");
                totalInput.setAttribute("readonly", true);
                totalInput.style.background = "#001122";
            };

            totalInput.onclick = () => {
                totalInput.classList.add("active-input");
                totalInput.removeAttribute("readonly");
                totalInput.style.background = "#002200";

                priceInput.classList.remove("active-input");
                priceInput.setAttribute("readonly", true);
                priceInput.style.background = "#001122";
            };

            // Default: price per unit is active
            priceInput.classList.add("active-input");
            totalInput.setAttribute("readonly", true);
        });
    },

    // MAIN MULTI PURCHASE
    async multiPurchase() {
        const lines = document.querySelectorAll(".purchase-line");
        if (lines.length === 0) return showToast("fail", "Add at least one item");

        const supplier = document.getElementById("multiSupplier").value.trim() || "Unknown";
        const employee = App.state.currentEmployee || "Manager";

        let totalCost = 0;
        const purchases = [];

        for (const line of lines) {
            const searchInput = line.querySelector(".item-search");
            const name = searchInput.value.trim();
            const qty = parseInt(line.querySelector(".qty-input").value) || 0;
            const pricePer = parseFloat(line.querySelector(".price-input").value) || 0;

            if (!name) {
                return showToast("fail", "All lines must have a valid item selected");
            }
            if (qty <= 0) {
                return showToast("fail", "Quantity must be greater than 0");
            }
            // Allow pricePer = 0 (free), but optionally warn if >0 lines exist with 0 price
            if (pricePer < 0) {
                return showToast("fail", "Price per unit cannot be negative");
            }

            if (!App.state.rawPrice[name] && !App.state.recipes[name]) {
                return showToast("fail", `"${name}" not found in Raw Materials or Recipes`);
            }

            const cost = qty * pricePer;
            totalCost += cost;

            purchases.push({ name, qty, pricePer, cost });

            // Add to warehouse
            App.state.warehouseStock[name] = (App.state.warehouseStock[name] || 0) + qty;

        }

        const ok = await showConfirm(`
            CONFIRM MULTI-PURCHASE
            
            ${purchases.map(p => {
            const freeTag = p.pricePer === 0 ? " (FREE)" : "";
            return `• ${p.qty}× ${p.name} @ $${p.pricePer.toFixed(2)}${freeTag} = $${p.cost.toFixed(2)}`;
        }).join('\n')}
            
            TOTAL: $${totalCost.toFixed(2)}
            Supplier: ${supplier}
            
            ${totalCost === 0 ? "⚠️ This is a completely free purchase." : ""}
        `);

        if (!ok) return;

        // Save all stock
        await App.save("warehouseStock");

        // Single ledger entry
        const record = {
            id: "RAW-" + Date.now().toString().slice(-8),
            date: new Date().toISOString().slice(0, 10),
            timestamp: new Date().toISOString(),
            type: "raw_purchase",
            employee,
            supplier,
            description: `Multi-purchase from ${supplier}: ${purchases.map(p => `${p.qty}×${p.name}`).join(", ")}`,
            totalCost,
            amount: -totalCost,
            items: purchases.map(p => `${p.qty}× ${p.name} @ $${p.pricePer.toFixed(2)}`).join(" | ")
        };

        App.state.ledger.push(record);
        await App.save("ledger");

        showToast("success", `Purchased ${purchases.length} items for $${totalCost.toFixed(2)}`);

        // Reset form
        document.getElementById("sharedMultiPurchaseForm").style.display = "none";
        document.getElementById("showMultiPurchaseBtn").style.display = "block";
        document.getElementById("multiSupplier").value = "";

        // Clear all lines except first
        document.getElementById("purchaseLines").innerHTML = `
            <div class="purchase-line" style="display:grid; grid-template-columns:3fr 1fr 2fr 1fr auto; gap:12px; align-items:end; margin-bottom:12px;">
                <div>
                    <input type="text" class="item-search" placeholder="Search item..." style="width:100%; padding:12px; font-size:16px;">
                    <div class="search-results" style="display:none; position:absolute; background:#000; border:1px solid #0af; max-height:200px; overflow-y:auto; z-index:10;"></div>
                </div>
                <input type="number" class="qty-input" placeholder="Qty" min="1" value="1" style="padding:12px; font-size:16px;">
                <input type="number" step="0.01" class="price-input" placeholder="Price per unit" style="padding:12px; font-size:16px;">
                <div style="text-align:right; font-weight:bold; color:#0f8;" class="line-total">$0.00</div>
                <button type="button" class="danger small" onclick="this.closest('.purchase-line').remove(); RawMaterials.updateMultiTotal()">×</button>
            </div>
        `;

        this.setupSearchListeners();
        this.updateMultiTotal();

        Inventory.render();
        Ledger.render();
        debouncedCalcRun();
    },

    showMultiForm() {
        const form = document.getElementById("sharedMultiPurchaseForm");
        form.style.display = "block";
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        form.querySelector(".item-search").focus();
    },

    hideMultiForm() {
        document.getElementById("sharedMultiPurchaseForm").style.display = "none";
    },

    setupSearchListeners() {
        document.querySelectorAll(".item-search").forEach(input => {
            input.oninput = (e) => {
                const val = e.target.value.toLowerCase();
                const results = input.parentElement.querySelector(".search-results"); // ← define here
                results.innerHTML = "";

                if (!val) {
                    results.style.display = "none";
                    return;
                }

                const allItems = [
                    ...Object.keys(App.state.rawPrice || {}),
                    ...Object.keys(App.state.recipes || {})
                ].filter(n => n.toLowerCase().includes(val)).slice(0, 15);

                allItems.forEach(name => {
                    const div = document.createElement("div");
                    div.textContent = name;
                    div.style.padding = "10px 16px";
                    div.style.cursor = "pointer";
                    div.style.borderBottom = "1px solid #333";
                    div.onclick = () => {
                        input.value = name;
                        results.style.display = "none";
                        input.closest(".purchase-line").querySelector(".qty-input").focus();
                        RawMaterials.updateMultiTotal();
                    };
                    results.appendChild(div);
                });

                results.style.display = allItems.length ? "block" : "none";
            };

            // Fixed blur handler — define results here too
            input.onblur = () => {
                const results = input.parentElement.querySelector(".search-results");
                setTimeout(() => {
                    if (results) results.style.display = "none";
                }, 200);
            };
        });

        // Live recalc on input change
        document.querySelectorAll(".qty-input, .price-input, .total-input").forEach(el => {
            el.oninput = () => RawMaterials.updateMultiTotal();
        });
    },

    init() {
        this.setupSearchListeners();
        this.setupFieldSwitching();
        this.updateMultiTotal();
        this.hideMultiForm();

        // Button to show the form (from any page)
        document.querySelectorAll(".show-purchase-btn").forEach(btn => {
            btn.onclick = () => this.showMultiForm();
        });

        // Add line button — use event delegation because lines are added dynamically
        document.getElementById("sharedMultiPurchaseForm").addEventListener("click", (e) => {
            if (e.target && e.target.classList.contains("add-line-btn")) {
                this.addPurchaseLine();
            }
        });
    },

    // ADD NEW RAW MATERIAL — BULLETPROOF
    add() {
        const name = sanitizeItemName(document.getElementById("newRawName").value.trim());
        const priceRaw = document.getElementById("newRawPrice").value.trim();
        const weightRaw = document.getElementById("newRawWeight").value.trim();

        if (!name) return showToast("fail", "Enter a name for the raw material!");
        if (App.state.rawPrice[name]) return showToast("fail", `"${name}" already exists!`);

        const price = parseFloat(priceRaw) || 0;
        const weight = parseFloat(weightRaw) || 0;

        App.state.rawPrice[name] = { price, weight };
        App.save("rawPrice");

        showToast("success", `"${name}" added!\nPrice: $${price.toFixed(2)}/unit\nWeight: ${weight.toFixed(2)} kg/unit`);

        document.getElementById("newRawName").value = "";
        document.getElementById("newRawPrice").value = "1.00";
        document.getElementById("newRawWeight").value = "0.00";

        this.renderPrices();
        //safeRender();
        debouncedCalcRun();
    },

    // RENDER RAW PRICES — NOW 100% RELIABLE
    renderPrices(filter = "") {
        const tbody = document.querySelector("#rawTable tbody");
        if (!tbody) return;

        const rawPrice = App.state.rawPrice || {};
        let items = Object.keys(rawPrice);

        // Apply filter
        if (filter) {
            const lower = filter.toLowerCase().trim();
            items = items.filter(name => name.toLowerCase().includes(lower));
        }

        items.sort((a, b) => a.localeCompare(b));

        tbody.innerHTML = "";

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:#888;font-size:16px;">
                ${filter ? `No raw materials match "${filter}"` : "No raw materials defined yet."}<br>
                <strong>Add your first one below!</strong>
            </td></tr>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        for (const m of items) {
            const data = rawPrice[m];
            const price = (data?.price !== undefined) ? data.price : 0;
            const weight = (data?.weight !== undefined) ? data.weight : 0;

            const tr = document.createElement("tr");
            if (!hasPermission("canEditRawPrices")) {
                tr.style.opacity = "0.6";
                tr.title = "Edit permission required";
            }
            tr.innerHTML = `
                <td style="font-weight:bold;color:var(--accent);padding:10px;">${m}</td>
                <td style="padding:8px;">
                  <input type="number" step="0.01" value="${price.toFixed(2)}" 
                         class="priceInput auto-save-input"
                         data-item="${m}"
                         ${!hasPermission("canEditRawPrices") ? 'disabled' : ''}
                         style="width:110px;background:#111;color:white;border:1px solid #444;padding:8px;border-radius:4px;font-size:14px;">
                  <small style="color:#888;margin-left:6px;">$/unit</small>
                </td>
                <td style="padding:8px;">
                  <input type="number" step="0.01" value="${weight.toFixed(2)}" 
                         class="weightInput auto-save-input"
                         data-item="${m}"
                         ${!hasPermission("canEditRawPrices") ? 'disabled' : ''}
                         style="width:100px;background:#001122;color:#0af;border:2px solid #00aaff;padding:8px;border-radius:4px;font-weight:bold;font-size:14px;">
                  <strong style="color:#0af;margin-left:8px;">kg/unit</strong>
                </td>
                <td style="text-align:center;padding:8px;">
                  <button class="danger small" onclick="RawMaterials.remove('${m}')"
                          style="padding:8px 12px;font-size:13px;border-radius:6px;${!hasPermission("canRemoveRawMaterials") ? 'display:none;' : ''}">Remove</button>
                </td>
            `;

            // Highlight items with weight
            if (weight > 0) {
                tr.style.background = "rgba(0, 170, 255, 0.08)";
                tr.style.borderLeft = "4px solid #0af";
            }
            // Visual badge if craftable
            if (App.state.recipes[m]) {
                tr.style.background = "rgba(0, 170, 255, 0.15)";
                tr.style.borderLeft = "4px solid #0cf";
                const nameCell = tr.querySelector("td:first-child");
                if (nameCell) {
                    nameCell.innerHTML += ` <small style="color:#0cf; font-weight:bold; font-size:0.8em;">[CRAFTABLE]</small>`;
                }
            }

            fragment.appendChild(tr);
        }

        tbody.appendChild(fragment);
    },

    // SAVE PRICE + WEIGHT — BULLETPROOF
    savePrice(item, button) {
        const row = button.closest("tr");
        const priceInput = row.querySelector(".priceInput");
        const price = parseFloat(priceInput.value) || 0;

        // Update state
        if (!App.state.rawPrice[item]) App.state.rawPrice[item] = {};
        App.state.rawPrice[item].price = price;

        // Save to Firebase
        App.save("rawPrice");

        // Visual feedback
        button.style.background = "#2a2";
        setTimeout(() => button.style.background = "", 300);

        debouncedCalcRun();
    },
    saveWeight(item, button) {
        const row = button.closest("tr");
        const weightInput = row.querySelector(".weightInput");
        const weight = parseFloat(weightInput.value) || 0;

        // Update state
        if (!App.state.rawPrice[item]) App.state.rawPrice[item] = {};
        App.state.rawPrice[item].weight = weight;

        // Save to Firebase
        App.save("rawPrice");

        // Visual feedback
        button.style.background = "#2a2";
        setTimeout(() => button.style.background = "", 300);

        // Update weight highlight instantly
        if (weight > 0) {
            row.style.background = "rgba(0, 170, 255, 0.08)";
            row.style.borderLeft = "4px solid #0af";
        } else {
            row.style.background = "";
            row.style.borderLeft = "none";
        }

        debouncedCalcRun();
    },

    // REMOVE RAW MATERIAL
    async remove(name) {
        if (!hasPermission("canRemoveRawMaterials")) {
            showToast("fail", "You do not have permission to remove raw materials");
            return;
        }

        const ok = await showConfirm(`Permanently delete "${name}" from raw materials?\nThis removes price & weight data.`);
        if (!ok) return;

        // === DELETE FROM FIRESTORE ===
        try {
            await firebase.firestore().collection('business').doc('main').update({
                [`rawPrice.${name}`]: firebase.firestore.FieldValue.delete()
            });
            console.log(`Deleted rawPrice.${name} from Firebase`);
        } catch (err) {
            console.error("Failed to delete from Firebase:", err);
            showToast("fail", "Failed to delete from server — check console");
            return;
        }

        // === UPDATE LOCAL STATE ===
        delete App.state.rawPrice[name];  // Immediately remove from local state

        // === SAVE & RE-RENDER ===
        await App.save("rawPrice");
        this.renderPrices("");  // Full refresh from updated state
        debouncedCalcRun();
        Inventory.render();

        showToast("success", `"${name}" removed permanently.`);
    },

    renderEmployeeList() {
        const select = document.getElementById("purchaseEmployee");
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Current User</option>';
        Object.keys(App.state.employees || {}).sort().forEach(emp => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = emp;
            select.appendChild(opt);
        });
        select.value = current || App.state.currentEmployee || "";
    }
};

// SEARCHABLE RAW MATERIAL SELECT FOR PURCHASES — NOW INCLUDES CRAFTED ITEMS
document.getElementById('purchaseItemSearch')?.addEventListener('input', function (e) {
    const val = e.target.value.toLowerCase().trim();
    const opts = document.getElementById('purchaseItemOptions');
    opts.innerHTML = '';
    opts.style.display = val ? 'block' : 'none';
    if (!val) return;

    // COMBINE RAW MATERIALS + CRAFTED ITEMS
    const allItems = [
        ...Object.keys(App.state.rawPrice || {}),
        ...Object.keys(App.state.recipes || {})
    ].filter(name => name.toLowerCase().includes(val))
        .sort();

    allItems.slice(0, 20).forEach(name => {
        const isCrafted = App.state.recipes[name];
        const price = isCrafted
            ? Calculator.cost(name) || 0
            : (App.state.rawPrice[name]?.price || 0);

        const div = document.createElement('div');
        div.className = 'category-item';
        div.style.paddingLeft = "20px";
        div.style.position = "relative";

        // Add icon for crafted items
        if (isCrafted) {
            div.style.paddingLeft = "28px";
            div.style.color = "#0af";
            div.innerHTML = `✦ ${name} (Crafted) ($${price.toFixed(2)} ea)`;
        } else {
            div.textContent = `${name} ($${price.toFixed(2)} ea)`;
        }

        div.onclick = () => {
            document.getElementById('purchaseItemSearch').value = name;
            opts.style.display = 'none';
            document.getElementById('purchaseQty')?.focus();
        };
        opts.appendChild(div);
    });
});

//trigger dropdown update when raw material page opens
document.querySelector('[data-tab="rawpurchase"]')?.addEventListener("click", () => {
    setTimeout(EmployeeSelect.refreshAll(), 100);
});
document.getElementById("newRawName")?.addEventListener("input", function (e) {
    const filter = e.target.value;
    RawMaterials.renderPrices(filter);
});

// AUTO-SAVE PRICE & WEIGHT ON BLUR
// AUTO-SAVE PRICE & WEIGHT ON BLUR — GREEN FLASH ON INPUT ONLY
document.addEventListener("focusout", function (e) {
    const input = e.target;
    if (!input || !input.classList.contains("auto-save-input") || input.disabled) return;

    const item = input.dataset.item;
    if (!item) return;

    let value = parseFloat(input.value) || 0;

    // Ensure object exists
    if (!App.state.rawPrice[item]) App.state.rawPrice[item] = {};

    if (input.classList.contains("priceInput")) {
        App.state.rawPrice[item].price = value;
    } else if (input.classList.contains("weightInput")) {
        App.state.rawPrice[item].weight = value;

        // Update row highlight
        const row = input.closest("tr");
        if (row) {
            if (value > 0) {
                row.style.background = "rgba(0, 170, 255, 0.08)";
                row.style.borderLeft = "4px solid #0af";
            } else {
                row.style.background = "";
                row.style.borderLeft = "none";
            }
        }
    }

    App.save("rawPrice");
    debouncedCalcRun();

    // Optional: keep flags fresh (harmless even if no recipe changes)
    //updateRawMaterialCraftableFlags();
    // Green flash
    input.style.background = "#004400";
    input.style.transition = "background 0.4s ease";
    setTimeout(() => input.style.background = "", 400);
});
document.addEventListener("DOMContentLoaded", () => {

    RawMaterials.init();
});