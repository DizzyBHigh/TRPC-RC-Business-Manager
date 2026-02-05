// ========================
// Calculator App — NOW WITH LIVE WEIGHT TRACKING
// ========================
let craftingSourceMode = "craft";  // "craft" or "warehouse" — live only
const Calculator = {
    liveToggle: {},
    weights: {},

    // FIXED: Now correctly reads weight from BOTH recipes AND rawPrice
    weight(item) {
        if (this.weights[item] !== undefined) return this.weights[item];

        let w = 0;

        const recipe = App.state.recipes[item];
        const recipeWeight = recipe?.weight;

        // PRIORITY 1: Recipe has explicit weight → use it
        if (recipeWeight !== undefined && recipeWeight !== null) {
            w = recipeWeight;
        }
        // PRIORITY 2: Raw material weight (even if recipe exists!)
        else if (App.state.rawPrice[item]?.weight !== undefined) {
            w = App.state.rawPrice[item].weight;
        }

        this.weights[item] = w;
        return w;
    },

    cost(item) {
        // Fast cache check
        if (App.cache.cost?.[item] !== undefined) return App.cache.cost[item];

        // 1. Direct price on raw material
        const raw = App.state.rawPrice[item];
        if (raw !== undefined) {
            const price = typeof raw === 'object' ? raw.price : raw;
            return App.cache.cost[item] = Number(price) || 0;
        }

        // 2. Direct price on recipe (override)
        const recipe = App.state.recipes[item];
        if (recipe?.price !== undefined) {
            return App.cache.cost[item] = Number(recipe.price) || 0;
        }

        // 3. Calculate from ingredients
        if (!recipe?.i || Object.keys(recipe.i).length === 0) {
            return App.cache.cost[item] = 0;
        }

        let total = 0;
        for (const [ing, qty] of Object.entries(recipe.i)) {
            const ingCost = this.cost(ing); // RECURSIVE CALL
            total += (Number(ingCost) || 0) * qty;
        }

        const yieldAmount = Number(recipe.y) || 1;
        const finalCost = total / yieldAmount;

        return App.cache.cost[item] = finalCost;
    },
    // Detect if a raw material has a recipe → can be crafted
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
        const needed = qty;
        const canUseStock = !isRaw && stock >= needed;
        const userChoice = Calculator.liveToggle[key] ?? "craft";

        // === CROP DETECTION ===
        const isCrop = App.state.seeds && Object.values(App.state.seeds).some(s => s.finalProduct === item);
        const cropKey = `crop→${key}`;
        const cropChoice = Calculator.liveToggle[cropKey] ?? (canUseStock ? "warehouse" : "grow");  // default unchanged

        let itemWeight = this.weight(item);
        if (isCrop) {
            const seedData = Object.values(App.state.seeds || {}).find(s => s.finalProduct === item);
            if (seedData?.finalWeight) {
                itemWeight = seedData.finalWeight;
            }
        }
        const totalWeight = (qty * itemWeight).toFixed(3);

        let html = `<div class="tree-item" style="margin-left:${depth * 24}px;display:flex;align-items:center;gap:8px;position:relative;">`;

        // Remove button (only on order root items)
        if (depth === 0 && orderIndex !== null) {
            html += `<button onclick="removeOrderItemDirectly(${orderIndex})" style="background:#c00;color:white;border:none;padding:2px 8px;border-radius:4px;font-weight:bold;cursor:pointer;font-size:11px;" title="Remove from order">×</button>`;
        }

        // === CROP: Dropdown with new "Warehouse (raw)" option ===
        if (isCrop) {
            html += `
                <select style="font-size:12px;padding:2px;border-radius:4px;background:#000;color:white;border:1px solid #444;"
                        onchange="Calculator.liveToggle['${cropKey}']=this.value; debouncedCalcRun();">
                    <option value="grow" ${cropChoice === "grow" ? "selected" : ""}>Grow (Harvest)</option>
                    <option value="warehouse" ${cropChoice === "warehouse" ? "selected" : ""}>Use Warehouse (avg) (${stock})</option>
                    <option value="warehouse-raw" ${cropChoice === "warehouse-raw" ? "selected" : ""}>Warehouse (raw) (${stock})</option>
                </select>`;
        }
        // Normal crafting dropdown
        else if (!isRaw) {
            const label = depth === 0 ? `Use Warehouse (${stock} in stock)` : `Use Warehouse (${stock})`;
            html += `
                <select style="font-size:12px;padding:2px;border-radius:4px;background:#000;color:white;border:1px solid #444;"
                        onchange="Calculator.liveToggle['${key}']=this.value; debouncedCalcRun();">
                    <option value="craft"${userChoice !== "warehouse" ? " selected" : ""}>Craft</option>
                    ${canUseStock ? `<option value="warehouse"${userChoice === "warehouse" ? " selected" : ""}>${label}</option>` : ""}
                </select>`;
        }

        // === MAIN ITEM LINE WITH CORRECT PRICE ===
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
            topLevelCost = this.cost(item) * qty;
        }

        // Only show cost on main line for:
        // - Raw items
        // - Warehouse used items
        // - Crafted items when actually crafting (depth 0 or expanding)
        let showCostLine = false;
        if (depth === 0) {
            showCostLine = true; // always show for top-level items
        } else if (isRaw) {
            showCostLine = true; // show for raw children
        } else if (userChoice === "warehouse" && canUseStock) {
            showCostLine = true; // show for warehouse items
        }

        const costDisplay = showCostLine && topLevelCost > 0
            ? `<strong style="color:#0f8; margin-left:12px; font-size:16px;">$${topLevelCost.toFixed(2)}</strong>`
            : (showCostLine ? '<span style="color:#666; margin-left:12px;">—</span>' : '');

        html += `<strong style="color:var(--accent);">${qty} × ${item}</strong>`;
        html += ` <small style="color:#0af;font-weight:bold;">(${totalWeight}kg)</small>`;
        if (showCostLine) html += costDisplay;

        if (!isRaw) {
            const batches = Math.ceil(qty / (r?.y || 1));
            html += ` <small style="color:#888;">(${batches} batch${batches > 1 ? "es" : ""})</small>`;
        }

        html += `</div>`;

        // === GROW (HARVEST) DETAILED BOX ===
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
                        $${exactCost.toFixed(2)}
                        <span style="font-size:14px; color:#0af; margin-left:8px;">
                            ($${(exactCost / qty).toFixed(4)}/unit)
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
                    Total Harvest Cost: $${exactCost.toFixed(2)}
                </div>
            </div>`;

            return html;
        }

        // === WAREHOUSE STOCK MESSAGE (covers both warehouse options) ===
        if ((isCrop && (cropChoice === "warehouse" || cropChoice === "warehouse-raw")) || (!isCrop && userChoice === "warehouse")) {
            if (canUseStock) {
                // Calculate the unit cost being used
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
                    // Non-crop (crafted item) from warehouse → uses raw price via cost()
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

                return html += `
                    <div style="margin-left:${(depth + 1) * 24}px; color:#0f8; font-style:italic; padding:8px 12px; background:#001122; border-radius:6px; margin-top:8px; font-size:14px;">
                        <strong>Using ${needed} × ${item} from warehouse</strong><br>
                        <span style="color:#0cf;">Cost: ${unitDisplay} → $${totalCost} ${note ? `(${note})` : ""}</span>
                        <span style="margin-left:12px; color:#0af;">(${totalWeight}kg)</span>
                    </div>`;
            }
        }


        if (isRaw) {
            const rawData = App.state.rawPrice[item];
            const marketPrice = typeof rawData === 'object' ? rawData.price : rawData || 0;
            const marketCost = marketPrice * qty;

            const isCraftable = this.isCraftableRaw(item);

            let rawHTML = `<div style="margin-left:${(depth + 1) * 24}px; padding:6px 0;">`;

            if (isCraftable) {
                // Unique key for live toggle
                const toggleKey = `rawcost→${path.concat(item).join("→")}`;
                const userChoice = Calculator.liveToggle[toggleKey] || "market"; // default market

                // Calculate crafted cost using existing cost() function (recursive!)
                const craftedUnitCost = this.cost(item);
                const craftedTotal = craftedUnitCost * qty;

                // Unique radio group name to avoid conflicts
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
                                Market Price: $${marketPrice.toFixed(4)} → $${marketCost.toFixed(2)}
                            </label>
                            <label style="display:block; margin:4px 0; color:${userChoice === 'crafted' ? '#0f8' : '#aaa'};">
                                <input type="radio" name="${groupName}" value="crafted" 
                                       ${userChoice === 'crafted' ? 'checked' : ''}
                                       onchange="Calculator.liveToggle['${toggleKey}']='crafted'; debouncedCalcRun();">
                                Crafted Cost: $${craftedUnitCost.toFixed(4)} → $${craftedTotal.toFixed(2)}
                            </label>
                        </div>
                    </div>`;
            } else {
                //rawHTML += `<span style="color:#0f8; font-weight:bold;">$${marketCost.toFixed(2)}</span>`;
            }

            rawHTML += `</div>`;
            return html + rawHTML;
        }



        // Normal crafting tree — only runs when crafting (not using warehouse)
        const batches = Math.ceil(qty / (r?.y || 1));
        html += `<div class="tree">`;
        for (const [ing, q] of Object.entries(r.i || {})) {
            html += this.buildTree(ing, q * batches, depth + 1, path.concat(item));
        }
        return html + `</div>`;
    },

    run() {
        console.log("Calculator.run() STARTED");

        // 1. Clear caches once per run
        this.weights = {};
        App.cache.cost = {};
        Calculator.liveToggle = Calculator.liveToggle || {};

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
            updateIfChanged("invoiceSummaryContainer", ""); // Clear invoice summary
            return;
        }

        // ──────── EXPAND TO RAW (respects liveToggle + records effective unit cost) ────────
        const expandToRaw = (item, qty, path = []) => {
            const key = path.concat(item).join("→");
            const choice = Calculator.liveToggle[key] ?? "craft";
            const cropKey = `crop→${key}`;
            const cropChoice = Calculator.liveToggle[cropKey];
            const recipe = App.state.recipes[item];
            const stock = App.state.warehouseStock[item] || 0;
            const needed = qty;
            const isCrop = App.state.seeds && Object.values(App.state.seeds).some(s => s.finalProduct === item);

            // Handle crops
            if (isCrop) {
                const cropChoice = Calculator.liveToggle[cropKey] || (stock >= needed ? "warehouse" : "grow");

                // CASE 1: Grow (Harvest) → expand to seeds + ingredients ONLY
                if (cropChoice === "grow") {
                    const estimate = Crops.getHarvestEstimate(item, needed);

                    // Add seeds
                    if (estimate.seedsNeeded) {
                        for (const [s, q] of Object.entries(estimate.seedsNeeded)) {
                            const entry = totalRaw[s] || { qty: 0 };
                            entry.qty += q;
                            entry.unitCost = this.cost(s);  // usually raw price
                            totalRaw[s] = entry;
                        }
                    }

                    // Add ingredients
                    if (estimate.ingredientsNeeded) {
                        for (const [i, q] of Object.entries(estimate.ingredientsNeeded)) {
                            const entry = totalRaw[i] || { qty: 0 };
                            entry.qty += q;
                            entry.unitCost = this.cost(i);
                            totalRaw[i] = entry;
                        }
                    }

                    // DO NOT add the crop itself to totalRaw
                    return;
                }

                // CASE 2 & 3: Warehouse (avg) or Warehouse (raw) → add crop itself with correct unit cost
                const entry = totalRaw[item] || { qty: 0 };
                entry.qty += needed;

                if (cropChoice === "warehouse-raw") {
                    const rawPrice = (typeof App.state.rawPrice[item] === 'object' ? App.state.rawPrice[item].price : App.state.rawPrice[item]) || 0;
                    entry.unitCost = Number(rawPrice);
                } else {
                    // warehouse (average)
                    entry.unitCost = Crops.getAverageCostPerUnit(item) || 0;
                }

                totalRaw[item] = entry;
                return;  // Do not expand further
            }

            // Handle non-crop warehouse use
            if (!isCrop && choice === "warehouse" && stock >= needed) {
                const entry = totalRaw[item] || { qty: 0 };
                entry.qty += needed;
                // For non-crops pulled from warehouse, use crafted cost (or 0 if raw)
                entry.unitCost = this.cost(item);
                totalRaw[item] = entry;
                return;
            }

            // Default: break down to ingredients
            if (!recipe?.i || Object.keys(recipe.i).length === 0) {
                const entry = totalRaw[item] || { qty: 0 };
                entry.qty += needed;

                const rawData = App.state.rawPrice[item];
                const marketPrice = typeof rawData === 'object' ? rawData.price : rawData || 0;

                // Check if user chose crafted cost for this raw
                const toggleKey = `rawcost→${path.concat(item).join("→")}`;
                const useCrafted = Calculator.liveToggle[toggleKey] === "crafted";

                if (useCrafted && this.isCraftableRaw(item)) {
                    entry.unitCost = this.cost(item); // uses recipe ingredients recursively
                } else {
                    entry.unitCost = marketPrice;
                }

                totalRaw[item] = entry;
                return;
            }

            const batches = Math.ceil(qty / (recipe.y || 1));
            for (const [ing, q] of Object.entries(recipe.i)) {
                expandToRaw(ing, q * batches, path.concat(item));
            }
        };

        // ──────── BUILD TREE + INVOICE ────────
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

            // === UNIT COST FOR INVOICE (updated for new option) ===
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
                    // warehouse (average)
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
                <td class="profit-only">$${unitCost.toFixed(4)}</td>
                <td>$${sellPrice.toFixed(2)}</td>
                <td>$${(sellPrice * o.qty).toFixed(2)}</td>
            </tr>`;
        });

        // ──────── COMPUTE GRAND COST (updated for new option) ────────
        grandCost = 0;
        for (const [item, data] of Object.entries(totalRaw)) {
            const qty = data.qty;
            const unitCost = data.unitCost !== undefined ? data.unitCost : this.cost(item);
            grandCost += unitCost * qty;
        }

        const rawTableHTML = this.generateRawTableHTML(totalRaw, finalProductWeight, grandSell);

        // === DISCOUNT LOGIC ===
        // === DISCOUNT LOGIC (LIVE FROM YOUR INPUT FIELDS) ===
        const discountInput = document.getElementById("discountAmount");
        const reasonInput = document.getElementById("discountReason");
        const discountAmount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
        const discountReason = reasonInput ? (reasonInput.value.trim() || "Discount") : "Discount";

        // Prevent discount larger than subtotal
        const safeDiscount = discountAmount > grandSell ? grandSell : discountAmount;

        const profitBeforeDiscount = grandSell - grandCost;
        const finalTotal = grandSell - safeDiscount;
        const profit = profitBeforeDiscount - safeDiscount;
        const profitPct = grandSell > 0 ? ((profitBeforeDiscount / grandSell) * 100).toFixed(1) : 0;

        // === INVOICE SUMMARY HTML (CUSTOMER: SUBTOTAL → DISCOUNT → TOTAL DUE) ===
        let invoiceSummaryHTML = `
            <div style="margin-top:40px; text-align:center;">
                <!-- CUSTOMER VIEW: Subtotal / Discount / Total Due -->
                <div id="customerSummary">
                    <div style="font-size:28px; font-weight:bold; color:#0f8; margin-bottom:15px;">
                        Subtotal: $<span id="orderSubtotal">${grandSell.toFixed(2)}</span>
                    </div>
    
                    ${discountAmount > 0 ? `
                        <div style="color:#f66; font-weight:bold; font-size:20px; margin:15px 0;">
                            Discount (${discountReason}): -$${discountAmount.toFixed(2)}
                        </div>
                    ` : ''}
    
                    <div style="font-size:36px; font-weight:bold; color:#0ff; margin:20px 0;">
                        TOTAL DUE: $<span id="orderGrandTotal">${finalTotal.toFixed(2)}</span>
                    </div>
                </div>
    
                <!-- STAFF-ONLY: Cost to Produce (replaces Subtotal in staff view) -->
                <div id="staffCostLine" style="display:none; font-size:28px; font-weight:bold; color:#0cf; margin-bottom:15px;">
                    Cost to Produce: $<span id="orderTotalCost">${grandCost.toFixed(2)}</span>
                </div>
    
                <!-- PROFIT LINE - HIDDEN IN CUSTOMER VIEW -->
                <div id="orderProfitRow" style="margin:30px 0; font-size:20px; display:none;">
                    <span style="color:#0f8; font-weight:bold;">
                        PROFIT: +$<span id="orderProfitAmount">${profit.toFixed(2)}</span> (${profitPct}%)
                    </span>
                </div>
    
                <!-- TOTAL WEIGHT - ALWAYS VISIBLE -->
                <div style="color:#0af; font-size:18px; margin-top:30px;">
                    Total Weight: <strong>${finalProductWeight.toFixed(1)}kg</strong>
                </div>
    
                <div style="color:#0af; font-size:16px; margin-top:10px;">
                    Thank you for your business! All items handcrafted with love.
                </div>
            </div>
        `;

        // === ORDER PAGE SUMMARY (MAIN ORDER TAB - ALWAYS SHOWS FULL DETAILS) ===
        let orderPageSummaryHTML = "";

        if (App.state.order.length > 0) {
            orderPageSummaryHTML = `
            <div style="background:#001122; padding:20px; border-radius:12px; border:2px solid #0af; text-align:center; margin:20px 0;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:30px; margin-bottom:20px; font-size:18px;">
                    <div>
                        <div style="color:#aaa; margin-bottom:8px;">Cost to Produce</div>
                        <div style="font-size:28px; font-weight:bold; color:#0cf;">
                            $<span id="mainTotalCost">${grandCost.toFixed(2)}</span>
                        </div>
                    </div>
                    <div>
                        <div style="color:#aaa; margin-bottom:8px;">Subtotal</div>
                        <div style="font-size:28px; font-weight:bold; color:#0f8;">
                            $<span id="mainSubtotal">${grandSell.toFixed(2)}</span>
                        </div>
                    </div>
                    <div>
                        <div style="color:#aaa; margin-bottom:8px;">TOTAL</div>
                        <div style="font-size:36px; font-weight:bold; color:#0ff;">
                            $<span id="mainGrandTotal">${finalTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                ${safeDiscount > 0 ? `
                    <div style="color:#fa5; font-weight:bold; font-size:22px; margin:15px 0; padding:10px; background:#220011; border-radius:8px; border:1px solid #fa5;">
                        Discount (${discountReason}): −$${safeDiscount.toFixed(2)}
                    </div>
                ` : ''}
    
                <div style="margin:20px 0; font-size:20px;">
                    <span style="color:#0f8; font-weight:bold;">
                        PROFIT: +$<span id="mainProfitAmount">${profit.toFixed(2)}</span> (${profitPct}%)
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

        // Update the main order page summary
        updateIfChanged("orderPageSummary", orderPageSummaryHTML);

        // Update UI
        updateIfChanged("craftingTree", treeHTML);
        updateIfChanged("rawSummary", rawTableHTML);
        updateIfChanged("invoiceItems", invoiceHTML);
        updateIfChanged("invoiceSummaryContainer", invoiceSummaryHTML); // NEW: Populate invoice summary

        // Update Calculator tab summary (old IDs)
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

    generateRawTableHTML(totalRaw, finalProductWeight, grandSell) {
        let html = `<table style="width:100%;border-collapse:collapse;"><thead><tr>
            <th>Item</th><th>Needed</th><th>Cost/Unit</th><th>Total Cost</th>
        </tr></thead><tbody>`;
        let tableTotalCost = 0;

        for (const [item, data] of Object.entries(totalRaw)) {
            const qty = data.qty;
            // Use recorded unitCost if available, otherwise fall back to this.cost(item)
            const unitCost = data.unitCost !== undefined ? data.unitCost : this.cost(item);
            const cost = unitCost * qty;
            tableTotalCost += cost;

            html += `<tr>
                <td>${item}</td>
                <td>${qty}</td>
                <td>$${unitCost.toFixed(4)}</td>
                <td>$${cost.toFixed(2)}</td>
            </tr>`;
        }

        html += `<tr style="font-weight:bold;background:#111;">
            <td colspan="往下3">Total Raw Cost</td>
            <td>$${tableTotalCost.toFixed(2)}</td>
        </tr></tbody></table>`;

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

// Update Crafting tree material table on dropdown change
function updateMaterialsTableNow() {
    debouncedCalcRun();
    // Force second pass to ensure warehouse usage is reflected
    requestAnimationFrame(() => Calculator.run());
}

// Save discount when changed
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