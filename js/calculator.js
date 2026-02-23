// ========================
// Calculator App — NOW WITH LIVE WEIGHT TRACKING
// ========================
let craftingSourceMode = "craft";  // "craft" or "warehouse" — live only

// Recycling rates: how many Recyclable Boxes needed to get 1 unit of each material
const RECYCLING_BOX_RATES = {
    "Rubber": 2,
    "Iron": 2,
    "Aluminium": 1,
    "Electronic Parts": 4,
    "Copper": 3,
    "Metal Scrap": 2,
    "Glass": 2,
    "Plastic": 1
    // Add more materials here in the future if needed
};

const Calculator = {
    liveToggle: {},
    weights: {},
    showAllBoxesBreakdown: false,

    // FIXED: Now correctly reads weight from BOTH recipes AND rawPrice
    weight(item) {
        if (this.weights[item] !== undefined) return this.weights[item];

        let w = 0;

        const recipe = App.state.recipes[item];
        if (recipe?.weight !== undefined && recipe.weight !== null) {
            w = Number(recipe.weight);
        } else if (App.state.rawPrice[item]?.weight !== undefined) {
            w = Number(App.state.rawPrice[item].weight);
        }

        // Fallback: tools usually have small weight
        if (isNaN(w) || w === 0) {
            if (/hammer|knife|tool|screwdriver|solder/i.test(item)) {
                w = 0.5;
            }
        }

        this.weights[item] = w;
        return w;
    },

    cost(item) {
        if (App.cache.cost?.[item] !== undefined) return App.cache.cost[item];

        const raw = App.state.rawPrice[item];
        if (raw !== undefined) {
            const price = typeof raw === 'object' ? raw.price : raw;
            return App.cache.cost[item] = Number(price) || 0;
        }

        const recipe = App.state.recipes[item];
        if (recipe?.price !== undefined) {
            return App.cache.cost[item] = Number(recipe.price) || 0;
        }

        if (!recipe?.i || Object.keys(recipe.i).length === 0) {
            return App.cache.cost[item] = 0;
        }

        let total = 0;

        for (const [ing, spec] of Object.entries(recipe.i)) {
            const ingCost = this.cost(ing);

            let contribution = 0;

            if (typeof spec === 'number') {
                contribution = ingCost * spec;
            } else if (spec?.percent !== undefined) {
                const fraction = Number(spec.percent) / 100;
                const safeFraction = Math.max(0, Math.min(1, fraction));
                contribution = ingCost * safeFraction;
            } else {
                console.warn(`Invalid ingredient spec in ${item} → ${ing}:`, spec);
                contribution = 0;
            }

            total += Number(contribution) || 0;
        }

        const yieldAmount = Number(recipe.y) || 1;
        const finalCost = total / yieldAmount;

        return App.cache.cost[item] = finalCost;
    },

    isCraftableRaw(item) {
        const rawData = App.state.rawPrice[item];
        if (!rawData) return false;
        const recipe = App.state.recipes[item];
        return !!recipe && recipe.i && Object.keys(recipe.i).length > 0;
    },

    resolve(item, need) {
        const r = App.state.recipes[item];
        if (!r) return { [item]: need };
        const batches = Math.ceil(need / (r.y || 1));
        let mats = {};
        for (const [ing, q] of Object.entries(r.i)) {
            const sub = this.resolve(ing, q * batches);
            for (const [m, a] of Object.entries(sub)) mats[m] = (mats[m] || 0) + a;
        }
        return mats;
    },

    buildTree(item, qty = 1, depth = 0, path = [], orderIndex = null) {
        const key = path.concat(item).join("→");
        const r = App.state.recipes[item];
        const isRaw = !r || !r.i || Object.keys(r.i).length === 0;
        const stock = App.state.warehouseStock[item] || 0;

        let needed = Number(qty);
        if (isNaN(needed) || needed <= 0) {
            console.debug(`Skipping invalid qty for ${item} in path ${path.join("→")}:`, qty);
            return '';
        }

        const canUseStock = !isRaw && stock >= needed;
        const userChoice = Calculator.liveToggle[key] ?? "craft";

        const isCrop = App.state.seeds && Object.values(App.state.seeds).some(s => s.finalProduct === item);
        const cropKey = `crop→${key}`;
        const cropChoice = Calculator.liveToggle[cropKey] ?? (canUseStock ? "warehouse" : "grow");

        let itemWeight = this.weight(item);
        if (isCrop) {
            const seedData = Object.values(App.state.seeds || {}).find(s => s.finalProduct === item);
            if (seedData?.finalWeight) itemWeight = seedData.finalWeight;
        }
        const totalWeight = (needed * itemWeight).toFixed(3);

        let html = `<div class="tree-item" style="margin-left:${depth * 24}px; display:flex; align-items:center; gap:8px; position:relative;">`;

        if (depth === 0 && orderIndex !== null) {
            html += `<button onclick="removeOrderItemDirectly(${orderIndex})" style="background:#c00;color:white;border:none;padding:2px 8px;border-radius:4px;font-weight:bold;cursor:pointer;font-size:11px;" title="Remove from order">×</button>`;
        }

        if (isCrop) {
            html += `
                <select style="font-size:12px;padding:2px;border-radius:4px;background:#000;color:white;border:1px solid #444;"
                        onchange="Calculator.liveToggle['${cropKey}']=this.value; debouncedCalcRun();">
                    <option value="grow" ${cropChoice === "grow" ? "selected" : ""}>Grow (Harvest)</option>
                    <option value="warehouse" ${cropChoice === "warehouse" ? "selected" : ""}>Use Warehouse (avg) (${stock})</option>
                    <option value="warehouse-raw" ${cropChoice === "warehouse-raw" ? "selected" : ""}>Warehouse (raw) (${stock})</option>
                </select>`;
        } else if (!isRaw) {
            const label = depth === 0 ? `Use Warehouse (${stock} in stock)` : `Use Warehouse (${stock})`;
            html += `
                <select style="font-size:12px;padding:2px;border-radius:4px;background:#000;color:white;border:1px solid #444;"
                        onchange="Calculator.liveToggle['${key}']=this.value; debouncedCalcRun();">
                    <option value="craft"${userChoice !== "warehouse" ? " selected" : ""}>Craft</option>
                    ${canUseStock ? `<option value="warehouse"${userChoice === "warehouse" ? " selected" : ""}>${label}</option>` : ""}
                </select>`;
        }

        let topLevelCost = 0;

        if (isCrop) {
            if (cropChoice === "grow") {
                topLevelCost = Crops.calculateHarvestCostFromEstimate(item, qty);
            } else if (cropChoice === "warehouse") {
                topLevelCost = Crops.getAverageCostPerUnit(item) * qty;
            } else if (cropChoice === "warehouse-raw") {
                const rawPrice = (typeof App.state.rawPrice[item] === 'object' ? App.state.rawPrice[item].price : App.state.rawPrice[item]) || 0;
                topLevelCost = Number(rawPrice) * qty;
            }
        } else if (userChoice !== "warehouse") {
            topLevelCost = this.cost(item) * needed;
        }

        const displayQty = Number(qty).toFixed(2).replace(/\.?0+$/, '') || '0';
        let qtyDisplay = `${displayQty} × ${item}`;
        if (qty < 1 && qty > 0) {
            qtyDisplay = `<span style="color:#ff9800; font-style:italic;">${qtyDisplay} (partial)</span>`;
        }

        html += `<strong style="color:var(--accent);">${qtyDisplay}</strong>`;
        html += ` <small style="color:#0af;font-weight:bold;">(${totalWeight}kg)</small>`;

        if (!isRaw) {
            const batches = Math.ceil(qty / (r?.y || 1));
            html += ` <small style="color:#888;">(${batches} batch${batches > 1 ? "es" : ""})</small>`;
        }

        if (topLevelCost > 0) {
            html += `<strong style="color:#0f8; margin-left:12px; font-size:16px;">$${formatCurrency(topLevelCost)}</strong>`;
        }

        html += `</div>`;

        if (isCrop && cropChoice === "grow" && qty > 0) {
            const estimate = Crops.getHarvestEstimate(item, qty);
            const exactCost = Crops.calculateHarvestCostFromEstimate(item, qty);

            html += `
            <div style="margin:${depth > 0 ? '12px 0 16px' : '16px 0 20px'} ${depth * 28}px; padding:14px 18px; background:#001a0f; border-left:5px solid #00ff88; border-radius:8px; font-size:14px; line-height:1.5;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="color:#00ff88; font-size:16px;">Grow (Harvest)</strong>
                    <strong style="color:#0ff; font-size:18px;">${qty}× ${item}</strong>
                </div>
                <div style="background:rgba(0,255,136,0.15); padding:10px 14px; border-radius:6px; margin:10px 0; border:1px solid rgba(0,255,136,0.3);">
                    <div style="color:#0ff; font-size:13px; margin-bottom:4px;">Exact Cost Today</div>
                    <div style="color:#00ff88; font-weight:bold; font-size:24px;">
                        $${formatCurrency(exactCost)}
                        <span style="font-size:14px; color:#0af; margin-left:8px;">
                            ($${formatCurrency(exactCost / qty)}/unit)
                        </span>
                    </div>
                </div>
                <div style="color:#ccc; font-size:13px;">
                    ${Object.keys(estimate.seedsNeeded || {}).length ?
                    `<strong style="color:#ffeb3b">Seeds:</strong> ${Object.entries(estimate.seedsNeeded).map(([s, q]) => `${q}×${s}`).join(', ')}` : ''}
                    ${Object.keys(estimate.seedsNeeded || {}).length && Object.keys(estimate.ingredientsNeeded || {}).length ? '<br>' : ''}
                    ${Object.keys(estimate.ingredientsNeeded || {}).length ?
                    `<strong style="color:#ff9800">Ingredients:</strong> ${Object.entries(estimate.ingredientsNeeded).map(([i, q]) => `${q}×${i}`).join(', ')}` : ''}
                </div>
                <div style="margin-top:12px; text-align:center; font-size:15px; color:#0f8; font-weight:bold;">
                    Total Harvest Cost: $${formatCurrency(exactCost)}
                </div>
            </div>`;

            return html;
        }

        if ((isCrop && (cropChoice === "warehouse" || cropChoice === "warehouse-raw")) || (!isCrop && userChoice === "warehouse")) {
            if (canUseStock) {
                let unitCost = 0;
                let note = "";

                if (isCrop) {
                    if (cropChoice === "warehouse-raw") {
                        const rawPrice = (typeof App.state.rawPrice[item] === 'object' ? App.state.rawPrice[item].price : App.state.rawPrice[item]) || 0;
                        unitCost = rawPrice;
                        note = "raw pricing";
                    } else {
                        unitCost = Crops.getAverageCostPerUnit(item) || 0;
                        note = "avg pricing";
                    }
                } else {
                    unitCost = Calculator.cost(item);
                    if (unitCost > 0) {
                        const rawData = App.state.rawPrice[item];
                        note = rawData ? "market price" : "recorded cost";
                    } else {
                        note = "no recorded cost";
                    }
                }

                const totalCost = (unitCost * needed).toFixed(2);
                const unitDisplay = unitCost > 0 ? `$${unitCost.toFixed(2)}/unit` : "free";

                html += `
                    <div style="margin-left:${(depth + 1) * 24}px; color:#0f8; font-style:italic; padding:8px 12px; background:#001122; border-radius:6px; margin-top:8px; font-size:14px;">
                        <strong>Using ${needed.toFixed(0)} × ${item} from warehouse</strong><br>
                        <span style="color:#0cf;">Cost: ${unitDisplay} → $${totalCost} ${note ? `(${note})` : ""}</span>
                        <span style="margin-left:12px; color:#0af;">(${totalWeight}kg)</span>
                    </div>`;
            }
        }

        if (isRaw) {
            const rawData = App.state.rawPrice[item];
            const marketPrice = typeof rawData === 'object' ? rawData.price : rawData || 0;
            const marketCost = marketPrice * qty;

            let rawHTML = `<div style="margin-left:${(depth + 1) * 24}px; padding:6px 0;">`;

            rawHTML += `
                <div style="color:#ff9800; font-weight:bold;">
                    ${qty.toFixed(2).replace(/\.?0+$/, '')} × ${item} ${qty < 1 ? '(durability / partial use)' : ''}
                </div>`;

            const isCraftable = this.isCraftableRaw(item);
            if (isCraftable) {
                const toggleKey = `rawcost→${path.concat(item).join("→")}`;
                const userChoice = Calculator.liveToggle[toggleKey] || "market";

                const craftedUnitCost = this.cost(item);
                const craftedTotal = craftedUnitCost * qty;

                const groupName = `rawcost_${item.replace(/\s+/g, '_')}_${depth}_${Date.now()}`;

                rawHTML += `
                    <div style="background:#001a2a; padding:12px; border-radius:8px; border-left:4px solid #0af; margin:8px 0;">
                        <div style="font-weight:bold; color:#0cf; margin-bottom:8px;">
                            ${qty} × ${item}
                        </div>
                        <div style="font-size:0.95em;">
                            <label style="display:block; margin:4px 0; color:${userChoice === 'market' ? '#0f8' : '#aaa'};">
                                <input type="radio" name="${groupName}" value="market" 
                                       ${userChoice === 'market' ? 'checked' : ''}
                                       onchange="Calculator.liveToggle['${toggleKey}']='market'; debouncedCalcRun();">
                                Market Price: $${formatCurrency(marketPrice)} → $${formatCurrency(marketCost)}
                            </label>
                            <label style="display:block; margin:4px 0; color:${userChoice === 'crafted' ? '#0f8' : '#aaa'};">
                                <input type="radio" name="${groupName}" value="crafted" 
                                       ${userChoice === 'crafted' ? 'checked' : ''}
                                       onchange="Calculator.liveToggle['${toggleKey}']='crafted'; debouncedCalcRun();">
                                Crafted Cost: $${formatCurrency(craftedUnitCost)} → $${formatCurrency(craftedTotal)}
                            </label>
                        </div>
                    </div>`;
            }

            rawHTML += `</div>`;
            html += rawHTML;
        }

        if (!isRaw) {
            const batches = Math.ceil(qty / (r?.y || 1));
            html += `<div class="tree">`;

            for (const [ing, spec] of Object.entries(r.i || {})) {
                let childQty = 0;
                let isPercentage = false;

                if (typeof spec === 'number') {
                    childQty = spec * batches;
                } else if (spec && spec.percent !== undefined) {
                    const fractionPerCraft = Number(spec.percent) / 100;
                    childQty = fractionPerCraft * batches;
                    isPercentage = true;
                } else {
                    console.warn(`Invalid spec for ${ing} in recipe ${item}:`, spec);
                    continue;
                }

                if (childQty <= 0) continue;

                let childHtml = this.buildTree(ing, childQty, depth + 1, path.concat(item));

                if (isPercentage && childHtml) {
                    childHtml = childHtml.replace(
                        /<strong style="color:var\(--accent\);">/,
                        `<strong style="color:var(--accent);"><span style="color:#ff9800; font-size:0.9em;">(durability) </span>`
                    );
                }

                html += childHtml;
            }

            html += `</div>`;
        }

        return html;
    },

    run() {
        console.log("Calculator.run() STARTED");
        Calculator.showAllBoxesBreakdown = App.state?.showAllBoxesBreakdown ?? false;
        console.log("Checkbox state at start of run:", Calculator.showAllBoxesBreakdown);
        this.weights = {};
        App.cache.cost = {};
        Calculator.liveToggle = Calculator.liveToggle || {};
        Calculator.showAllBoxesBreakdown = App.state.showAllBoxesBreakdown ?? false;

        let boxBreakdown = {};

        let totalRaw = {};
        let grandCost = 0, grandSell = 0;
        let finalProductWeight = 0;
        let treeHTML = "", invoiceHTML = "";

        if (App.state.order.length === 0) {
            const empty = "<p style='text-align:center;color:#888;margin:40px;'>Add items to your order</p>";
            updateIfChanged("craftingTree", empty);
            updateIfChanged("rawSummary", "");
            updateIfChanged("invoiceItems", "<tr><td colspan='7' style='text-align:center;color:#888;padding:40px;'>No items in order</td></tr>");
            ["subtotal", "totalCost", "grandTotal", "profitAmount"].forEach(id =>
                safeSetText(id, "$0.00")
            );
            safeSetText("profitPercent", "0%");
            updateIfChanged("invoiceSummaryContainer", "");
            return;
        }

        const expandToRaw = (item, qty, path = []) => {
            const needed = Number(qty);
            if (isNaN(needed) || needed <= 0) return;

            const key = path.concat(item).join("→");
            const choice = Calculator.liveToggle[key] ?? "craft";

            const cropKey = `crop→${key}`;
            const cropChoice = Calculator.liveToggle[cropKey]
                ?? (App.state.warehouseStock[item] >= needed ? "warehouse" : "grow");

            const recipe = App.state.recipes[item];
            const stock = App.state.warehouseStock[item] || 0;
            const isCrop = App.state.seeds && Object.values(App.state.seeds || {}).some(s => s.finalProduct === item);
            const isRawMaterial = !recipe || !recipe.i || Object.keys(recipe.i).length === 0;

            // 1. CROP HANDLING
            if (isCrop) {
                if (cropChoice === "grow") {
                    const estimate = Crops.getHarvestEstimate(item, needed);

                    Object.entries(estimate.seedsNeeded || {}).forEach(([seed, q]) => {
                        const entry = totalRaw[seed] = totalRaw[seed] || { qty: 0 };
                        entry.qty += Number(q);
                        entry.unitCost = entry.unitCost ?? Calculator.cost(seed);
                    });

                    Object.entries(estimate.ingredientsNeeded || {}).forEach(([ing, q]) => {
                        const entry = totalRaw[ing] = totalRaw[ing] || { qty: 0 };
                        entry.qty += Number(q);
                        entry.unitCost = entry.unitCost ?? Calculator.cost(ing);
                    });

                    return;
                }

                // Warehouse crop
                const entry = totalRaw[item] = totalRaw[item] || { qty: 0 };
                entry.qty += needed;

                if (cropChoice === "warehouse-raw") {
                    const rawPrice = App.state.rawPrice?.[item]?.price ?? App.state.rawPrice?.[item] ?? 0;
                    entry.unitCost = Number(rawPrice);
                } else {
                    entry.unitCost = Crops.getAverageCostPerUnit(item) || 0;
                }

                // Add boxes for crop warehouse (actual or potential)
                const isPotential = !cropChoice.startsWith("warehouse");
                const reason = `${item} (${needed.toFixed(0)} from warehouse)${isPotential ? " [potential]" : ""}`;

                boxBreakdown[reason] = boxBreakdown[reason] || {
                    boxes: 0,
                    linkedQty: 0,
                    linkedItem: item,
                    reason: reason,
                    isPotential: isPotential
                };

                boxBreakdown[reason].linkedQty += needed;
                const boxesPerUnit = RECYCLING_BOX_RATES[item] || 2;
                boxBreakdown[reason].boxes += Math.ceil(needed) * boxesPerUnit;

                return;
            }

            // 2. ACTUAL WAREHOUSE USE
            if (choice === "warehouse" && stock >= needed) {
                const entry = totalRaw[item] = totalRaw[item] || { qty: 0 };
                entry.qty += needed;
                entry.unitCost = entry.unitCost ?? Calculator.cost(item);

                const reason = `${item} (${needed.toFixed(0)} from warehouse)`;
                boxBreakdown[reason] = boxBreakdown[reason] || {
                    boxes: 0,
                    linkedQty: 0,
                    linkedItem: item,
                    reason: reason,
                    isPotential: false
                };
                boxBreakdown[reason].linkedQty += needed;

                const boxesPerUnit = RECYCLING_BOX_RATES[item] || 2;
                boxBreakdown[reason].boxes += Math.ceil(needed) * boxesPerUnit;

                return;
            }

            // 3. POTENTIAL / CRAFT MODE BOXES — always add for non-raw items
            if (!isRawMaterial) {
                const isPotential = choice !== "warehouse";
                const reason = `${item} (${needed.toFixed(0)} × ${item})${isPotential ? " [potential if warehoused]" : ""}`;

                boxBreakdown[reason] = boxBreakdown[reason] || {
                    boxes: 0,
                    linkedQty: 0,
                    linkedItem: item,
                    reason: reason,
                    isPotential: isPotential
                };

                boxBreakdown[reason].linkedQty += needed;

                const boxesPerUnit = RECYCLING_BOX_RATES[item] || 2;
                boxBreakdown[reason].boxes += Math.ceil(needed) * boxesPerUnit;
            }

            // 4. RECIPE EXPANSION
            if (!isRawMaterial) {
                const yield = Number(recipe.y) || 1;
                const batches = Math.ceil(needed / yield);

                for (const [ingredient, spec] of Object.entries(recipe.i || {})) {
                    let subQty = 0;

                    if (typeof spec === 'number') {
                        subQty = spec * batches;
                    } else if (spec?.percent !== undefined) {
                        continue;
                    } else {
                        console.warn(`Invalid spec for ${ingredient} in ${item}:`, spec);
                        continue;
                    }

                    if (subQty > 0) {
                        expandToRaw(ingredient, subQty, path.concat(item));
                    }
                }
            }

            // Fallback: if this is a leaf raw item in craft mode, add it to totalRaw
            if (isRawMaterial && choice !== "warehouse") {
                const entry = totalRaw[item] = totalRaw[item] || { qty: 0 };
                entry.qty += needed;
                entry.unitCost = entry.unitCost ?? Number(App.state.rawPrice?.[item]?.price ?? App.state.rawPrice?.[item] ?? 0);
            }
        };

        App.state.order.forEach((o, idx) => {
            if (idx > 0) treeHTML += "<hr style='border:1px dashed #333;margin:30px 0'>";
            treeHTML += `<h3 style="margin:15px 0 8px;color:#0cf">${o.qty} × ${o.item}</h3>`;
            treeHTML += this.buildTree(o.item, o.qty, 0, [], idx);

            expandToRaw(o.item, o.qty);

            let finalItemWeight = this.weight(o.item);
            if (App.state.seeds) {
                const seedData = Object.values(App.state.seeds).find(s => s.finalProduct === o.item);
                if (seedData?.finalWeight) {
                    finalItemWeight = seedData.finalWeight;
                }
            }
            finalProductWeight += o.qty * finalItemWeight;

            const sellPrice = o.customPrice ?? (App.state.customPrices[o.item]?.[o.tier] ||
                this.cost(o.item) * (o.tier === "bulk" ? 1.10 : 1.25));
            grandSell += sellPrice * o.qty;

            let invoiceWeight = (o.qty * finalItemWeight).toFixed(3);
            let unitCost = 0;

            const isCropProduct = App.state.seeds && Object.values(App.state.seeds).some(s => s.finalProduct === o.item);

            if (isCropProduct) {
                const cropKey = `crop→${o.item}`;
                const cropChoice = Calculator.liveToggle[cropKey] ?? (App.state.warehouseStock[o.item] >= o.qty ? "warehouse" : "grow");

                if (cropChoice === "grow") {
                    unitCost = Crops.calculateHarvestCostFromEstimate(o.item, 1);
                } else if (cropChoice === "warehouse-raw") {
                    const rawPrice = (typeof App.state.rawPrice[o.item] === 'object' ? App.state.rawPrice[o.item].price : App.state.rawPrice[o.item]) || 0;
                    unitCost = Number(rawPrice);
                } else {
                    unitCost = Crops.getAverageCostPerUnit(o.item) || 0;
                }
            } else {
                unitCost = this.cost(o.item);
            }

            invoiceHTML += `<tr>
                <td>${o.qty}</td>
                <td>${o.item}</td>
                <td>${o.tier === "bulk" ? "Bulk" : "Shop"}</td>
                <td>${invoiceWeight}kg</td>
                <td class="profit-only">${formatCurrency(unitCost)}</td>
                <td>${formatCurrency(sellPrice)}</td>
                <td>${formatCurrency(sellPrice * o.qty)}</td>
            </tr>`;
        });

        const toolUsage = {};

        App.state.order.forEach(o => {
            const recipe = App.state.recipes[o.item];
            if (!recipe?.i) return;

            const effectiveCrafts = o.qty / (recipe.y || 1);

            for (const [ing, spec] of Object.entries(recipe.i)) {
                if (spec?.percent !== undefined) {
                    const fraction = Number(spec.percent) / 100;
                    const usage = fraction * effectiveCrafts;
                    toolUsage[ing] = (toolUsage[ing] || 0) + usage;
                }
            }
        });

        grandCost = 0;
        for (const [item, data] of Object.entries(totalRaw)) {
            const qty = data.qty;
            const unitCost = data.unitCost !== undefined ? data.unitCost : this.cost(item);
            grandCost += unitCost * qty;
        }

        console.log("boxBreakdown before passing:", Object.keys(boxBreakdown).length, boxBreakdown);
        const rawTableHTML = this.generateRawTableHTML(totalRaw, finalProductWeight, grandSell, boxBreakdown);

        const discountInput = document.getElementById("discountAmount");
        const reasonInput = document.getElementById("discountReason");
        const discountAmount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
        const discountReason = reasonInput ? (reasonInput.value.trim() || "Discount") : "Discount";

        const safeDiscount = discountAmount > grandSell ? grandSell : discountAmount;

        const profitBeforeDiscount = grandSell - grandCost;
        const finalTotal = grandSell - safeDiscount;
        const profit = profitBeforeDiscount - safeDiscount;
        const profitPct = grandSell > 0 ? ((profitBeforeDiscount / grandSell) * 100).toFixed(1) : 0;

        let invoiceSummaryHTML = `
            <div style="margin-top:40px; text-align:center;">
                <div id="customerSummary">
                    <div style="font-size:28px; font-weight:bold; color:#0f8; margin-bottom:15px;">
                        Subtotal: $<span id="orderSubtotal">${formatCurrency(grandSell)}</span>
                    </div>
    
                    ${discountAmount > 0 ? `
                        <div style="color:#f66; font-weight:bold; font-size:20px; margin:15px 0;">
                            Discount (${discountReason}): - ${formatCurrency(discountAmount)}
                        </div>
                    ` : ''}
    
                    <div style="font-size:36px; font-weight:bold; color:#0ff; margin:20px 0;">
                        TOTAL DUE: $<span id="orderGrandTotal">${formatCurrency(finalTotal)}</span>
                    </div>
                </div>
    
                <div id="staffCostLine" style="display:none; font-size:28px; font-weight:bold; color:#0cf; margin-bottom:15px;">
                    Cost to Produce: $<span id="orderTotalCost">${formatCurrency(grandCost)}</span>
                </div>
    
                <div id="orderProfitRow" style="margin:30px 0; font-size:20px; display:none;">
                    <span style="color:#0f8; font-weight:bold;">
                        PROFIT: +$<span id="orderProfitAmount">${formatCurrency(profit)}</span> (${profitPct}%)
                    </span>
                </div>
    
                <div style="color:#0af; font-size:18px; margin-top:30px;">
                    Total Weight: <strong>${finalProductWeight.toFixed(1)}kg</strong>
                </div>
    
                <div style="color:#0af; font-size:16px; margin-top:10px;">
                    Thank you for your business! All items handcrafted with love.
                </div>
            </div>
        `;

        let orderPageSummaryHTML = "";

        if (App.state.order.length > 0) {
            orderPageSummaryHTML = `
            <div style="background:#001122; padding:20px; border-radius:12px; border:2px solid #0af; text-align:center; margin:20px 0;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:30px; margin-bottom:20px; font-size:18px;">
                    <div>
                        <div style="color:#aaa; margin-bottom:8px;">Cost to Produce</div>
                        <div style="font-size:28px; font-weight:bold; color:#0cf;">
                            $<span id="mainTotalCost">${formatCurrency(grandCost)}</span>
                        </div>
                    </div>
                    <div>
                        <div style="color:#aaa; margin-bottom:8px;">Subtotal</div>
                        <div style="font-size:28px; font-weight:bold; color:#0f8;">
                            $<span id="mainSubtotal">${formatCurrency(grandSell)}</span>
                        </div>
                    </div>
                    <div>
                        <div style="color:#aaa; margin-bottom:8px;">TOTAL</div>
                        <div style="font-size:36px; font-weight:bold; color:#0ff;">
                            $<span id="mainGrandTotal">${formatCurrency(finalTotal)}</span>
                        </div>
                    </div>
                </div>

                ${safeDiscount > 0 ? `
                    <div style="color:#fa5; font-weight:bold; font-size:22px; margin:15px 0; padding:10px; background:#220011; border-radius:8px; border:1px solid #fa5;">
                        Discount (${discountReason}): − ${formatCurrency(safeDiscount)}
                    </div>
                ` : ''}
    
                <div style="margin:20px 0; font-size:20px;">
                    <span style="color:#0f8; font-weight:bold;">
                        PROFIT: +$<span id="mainProfitAmount">${formatCurrency(profit)}</span> (${profitPct}%)
                    </span>
                    <span style="margin-left:60px; color:#0af;">
                        Total Weight: ${finalProductWeight.toFixed(1)}kg
                    </span>
                </div>
            </div>
        `;
        } else {
            orderPageSummaryHTML = "";
        }

        updateIfChanged("orderPageSummary", orderPageSummaryHTML);

        updateIfChanged("craftingTree", treeHTML);
        updateIfChanged("rawSummary", rawTableHTML);
        updateIfChanged("invoiceItems", invoiceHTML);
        updateIfChanged("invoiceSummaryContainer", invoiceSummaryHTML);

        safeSetText("subtotal", "$" + grandSell.toFixed(2));
        safeSetText("totalCost", "$" + grandCost.toFixed(2));
        safeSetText("grandTotal", "$" + finalTotal.toFixed(2));
        safeSetText("profitAmount", profit >= 0 ? "$" + profit.toFixed(2) : "−$" + Math.abs(profit).toFixed(2));
        safeSetText("profitPercent", profitPct + "%");

        const profitEl = document.getElementById("profitAmount");
        if (profitEl) {
            profitEl.style.color = profit >= 0 ? "var(--profit-green)" : "var(--loss-red)";
        }
    },

    generateRawTableHTML(totalRaw, finalProductWeight, grandSell, boxBreakdown = {}) {
        let html = `
        <div style="margin: 15px 0; padding: 10px; background: #001122; border-radius: 8px; text-align: center; border: 1px solid #0af;">
            <label style="color: #0af; font-size: 15px; cursor: pointer; user-select: none;">
                <input type="checkbox" id="showAllBoxesToggle"
                       style="margin-right: 8px; transform: scale(1.3);"
                       ${Calculator.showAllBoxesBreakdown ? 'checked' : ''}>
                Show recyclable boxes breakdown for <strong>all paths</strong> (even when crafting)
            </label>
            <small style="display: block; color: #888; margin-top: 6px;">
                (includes potential boxes if you switched to warehouse)
            </small>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px;">
            <thead>
                <tr style="background:#222; color:#fff; text-align:left;">
                    <th style="padding:10px 12px;">Item</th>
                    <th style="padding:10px 12px; text-align:right;">Needed</th>
                    <th style="padding:10px 12px; text-align:right;">Cost/Unit</th>
                    <th style="padding:10px 12px; text-align:right;">Total Cost</th>
                    <th style="padding:10px 12px; text-align:right;">Recyclable Boxes Needed</th>
                </tr>
            </thead>
            <tbody>`;

        let rawTotalCost = 0;
        let totalBoxes = 0;
        let totalBoxesCost = 0;

        // Normal raw materials (Fabric, Steel, etc.)
        for (const [item, data] of Object.entries(totalRaw)) {
            const qty = Number(data.qty) || 0;
            if (qty <= 0) continue;

            const unitCost = Number(data.unitCost ?? this.cost(item)) || 0;
            const cost = unitCost * qty;
            rawTotalCost += cost;

            const boxesPerUnit = RECYCLING_BOX_RATES[item] || 0;
            const boxesForThis = qty * boxesPerUnit;
            totalBoxes += boxesForThis;

            const boxesDisplay = boxesPerUnit > 0
                ? `${boxesForThis.toLocaleString()} <small>(${boxesPerUnit}/unit)</small>`
                : "—";

            html += `<tr style="border-bottom:1px solid #333;">
        <td style="padding:8px 12px;">${item}</td>
        <td style="padding:8px 12px; text-align:right;">${qty.toLocaleString()}</td>
        <td style="padding:8px 12px; text-align:right;">$${formatCurrency(unitCost)}</td>
        <td style="padding:8px 12px; text-align:right;">$${formatCurrency(cost)}</td>
        <td style="padding:8px 12px; text-align:right; ${boxesPerUnit > 0 ? 'color:#ff9800; font-weight:bold;' : 'color:#666;'}">
            ${boxesDisplay}
        </td>
    </tr>`;
        }

        

        // ─── 3. Recyclable Boxes Section ───
        const BOX_UNIT_PRICE = 2;

        let boxesFromBreakdown = 0;
        if (Object.keys(boxBreakdown).length > 0) {
            Object.values(boxBreakdown).forEach(bd => {
                boxesFromBreakdown += Number(bd.boxes) || 0;
            });
        }
        totalBoxes += boxesFromBreakdown;
        totalBoxesCost = boxesFromBreakdown * BOX_UNIT_PRICE;

        if (Object.keys(boxBreakdown).length > 0) {
            html += `<tr style="background:#112233; font-weight:bold; color:#fff;">
        <td colspan="5" style="padding:12px 12px; text-align:center; border-bottom:2px solid #0af;">
            Recyclable Boxes Breakdown (${Calculator.showAllBoxesBreakdown ? 'all paths incl. potential' : 'warehouse only'})
        </td>
    </tr>`;

            for (const [reasonKey, bd] of Object.entries(boxBreakdown)) {
                const boxes = Number(bd.boxes) || 0;
                const isPotential = bd.isPotential === true;

                html += `<tr style="background:#001122; color:#ddd; ${isPotential ? 'opacity:0.75; font-style:italic;' : ''}">
            <td style="padding:8px 12px 8px 36px;">└─ ${reasonKey}</td>
            <td style="padding:8px 12px; text-align:right;">${Number(bd.linkedQty || 0).toLocaleString()} × ${bd.linkedItem || '?'}</td>
            <td style="padding:8px 12px; text-align:right;">—</td>
            <td style="padding:8px 12px; text-align:right;">—</td>
            <td style="padding:8px 12px; text-align:right; color:#ff9800; font-weight:bold;">
                ${boxes.toLocaleString()} ${isPotential ? '<small>(potential)</small>' : ''}
            </td>
        </tr>`;
            }

            html += `<tr style="background:#0d1a2b; font-weight:bold; color:#0ff; border-top:2px solid #0af;">
        <td colspan="3" style="padding:10px 12px;">Recyclable Boxes Subtotal</td>
        <td style="padding:10px 12px; text-align:right;">$${formatCurrency(totalBoxesCost)}</td>
        <td style="padding:10px 12px; text-align:right; color:#ff9800;">${boxesFromBreakdown.toLocaleString()}</td>
    </tr>`;
        } else if (totalBoxes > 0) {
            totalBoxesCost = totalBoxes * BOX_UNIT_PRICE;
            html += `<tr style="background:#112233; font-weight:bold;">
        <td>Recyclable Boxes</td>
        <td style="text-align:right;">—</td>
        <td style="text-align:right;">$${formatCurrency(BOX_UNIT_PRICE)}</td>
        <td style="text-align:right;">$${formatCurrency(totalBoxesCost)}</td>
        <td style="text-align:right; color:#ff9800;">${totalBoxes.toLocaleString()}</td>
    </tr>`;
        }

        const grandRawCost = rawTotalCost + totalBoxesCost;

        html += `<tr style="font-weight:bold; background:#111; color:#fff; border-top:2px solid #444;">
            <td colspan="3" style="padding:12px;">Total Raw Materials Cost</td>
            <td style="padding:12px; text-align:right;">$${formatCurrency(grandRawCost)}</td>
            <td style="padding:12px; text-align:right; color:#ff9800;">
                ${totalBoxes > 0 ? totalBoxes.toLocaleString() : "—"}
            </td>
        </tr></tbody></table>`;

        let toolsTotalCost = 0;
        const toolUsage = {};

        App.state.order.forEach(o => {
            const recipe = App.state.recipes[o.item];
            if (!recipe?.i) return;

            const effectiveCrafts = o.qty / (recipe.y || 1);

            for (const [ing, spec] of Object.entries(recipe.i)) {
                if (spec?.percent !== undefined) {
                    const fraction = Number(spec.percent) / 100;
                    const usage = fraction * effectiveCrafts;
                    toolUsage[ing] = (toolUsage[ing] || 0) + usage;
                }
            }
        });

        if (Object.keys(toolUsage).length > 0) {
            html += `<h3 style="color:#ff9800; margin:32px 0 16px; font-size:18px;">Tools & Equipment (Durability Usage)</h3>
                <table style="width:100%; border-collapse:collapse; font-size:14px;">
                    <thead>
                        <tr style="background:#331a00; color:#fff; text-align:left;">
                            <th style="padding:10px 12px;">Tool</th>
                            <th style="padding:10px 12px; text-align:right;">Durability Used</th>
                            <th style="padding:10px 12px; text-align:right;">Approx. Tools Needed</th>
                            <th style="padding:10px 12px; text-align:right;">Cost Contribution</th>
                        </tr>
                    </thead>
                    <tbody>`;

            for (const [tool, totalUsage] of Object.entries(toolUsage)) {
                const displayUsage = Number(totalUsage.toFixed(3)).toString().replace(/\.?0+$/, '');
                const displayText = totalUsage >= 1
                    ? `${displayUsage} full uses`
                    : `${displayUsage} partial`;

                const toolUnitCost = this.cost(tool) || 0;
                const toolCostContribution = toolUnitCost * totalUsage;
                toolsTotalCost += toolCostContribution;

                html += `<tr style="border-bottom:1px solid #444;">
                    <td style="padding:8px 12px;">${tool}</td>
                    <td style="padding:8px 12px; text-align:right;">${displayUsage}% total</td>
                    <td style="padding:8px 12px; text-align:right; font-weight:bold;">${displayText}</td>
                    <td style="padding:8px 12px; text-align:right; color:#ff9800;">$${formatCurrency(toolCostContribution)}</td>
                </tr>`;
            }

            html += `<tr style="font-weight:bold; background:#220d00; color:#fff;">
                <td colspan="3" style="padding:12px;">Total Tools Cost Contribution</td>
                <td style="padding:12px; text-align:right;">$${formatCurrency(toolsTotalCost)}</td>
            </tr></tbody></table>

            <p style="font-size:13px; color:#aaa; margin-top:12px; font-style:italic;">
                These are amortized costs — actual tool replacement depends on current durability.
            </p>`;
        }

        const grandTotalCost = grandRawCost + toolsTotalCost;

        html += `<div style="margin-top:28px; font-size:18px; font-weight:bold; text-align:right; color:#0ff; padding:12px; background:#001122; border-radius:8px; border:1px solid #0af;">
            Grand Total Production Cost: $${formatCurrency(grandTotalCost)}
        </div>`;

        return html;
    }
};

// ──────────────────────── VIRTUAL DOM FOR CRAFTING TREE ───────────────────────
let lastTreeHTML = "";
let lastRawHTML = "";

function updateIfChanged(elementId, newHTML) {
    if (newHTML === document.getElementById(elementId)?.innerHTML) return;
    if (elementId === "craftingTree" && newHTML === lastTreeHTML) return;
    if (elementId === "rawSummary" && newHTML === lastRawHTML) return;

    document.getElementById(elementId).innerHTML = newHTML;
    if (elementId === "craftingTree") lastTreeHTML = newHTML;
    if (elementId === "rawSummary") lastRawHTML = newHTML;
}

function updateMaterialsTableNow() {
    debouncedCalcRun();
    requestAnimationFrame(() => Calculator.run());
}

document.getElementById("discountAmount")?.addEventListener("input", async (e) => {
    const amount = parseFloat(e.target.value) || 0;
    App.state.orderDiscount.amount = amount;
    await App.save("orderDiscount");
    debouncedCalcRun();
});

document.getElementById("discountReason")?.addEventListener("input", async (e) => {
    App.state.orderDiscount.reason = e.target.value.trim();
    await App.save("orderDiscount");
    debouncedCalcRun();
});

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('showAllBoxesToggle');
    if (toggle) {
        toggle.checked = Calculator.showAllBoxesBreakdown;
        toggle.addEventListener('change', async (e) => {
            Calculator.showAllBoxesBreakdown = e.target.checked;
            if (App.state) {
                App.state.showAllBoxesBreakdown = e.target.checked;
                await App.save('showAllBoxesBreakdown');
            }
            debouncedCalcRun();
        });
    }
});