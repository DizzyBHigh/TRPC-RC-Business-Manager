// ========================
// Inventory Management — FINAL, BULLETPROOF VERSION
// ========================
const Inventory = {
    render() {
        const search = (document.getElementById("inventorySearch")?.value || "").toLowerCase().trim();
        const onlyLow = this._filterLowOnly || false;
        const tbody = document.getElementById("inventoryTable");
        if (!tbody) return;

        const minStock = App.state.minStock || {};
        const shopStock = App.state.shopStock || {};
        const warehouseStock = App.state.warehouseStock || {};
        const rawPrice = App.state.rawPrice || {};
        const recipes = App.state.recipes || {};
        const customPrices = App.state.customPrices || {};

        let lowCount = 0;
        let totalWeightShop = 0, totalWeightWarehouse = 0;

        const fragment = document.createDocumentFragment();

        // === 1. CRAFTED ITEMS ===
        Object.keys(recipes).sort().forEach(item => {
            if (search && !item.toLowerCase().includes(search)) return;

            const shop = shopStock[item] || 0;
            const warehouse = warehouseStock[item] || 0;
            const min = minStock[item] ?? 0;
            const low = shop < min;
            if (low) lowCount++;

            if (onlyLow && !low) return;

            const weightPerUnit = Calculator.weight(item);
            const shopWeight = (shop * weightPerUnit).toFixed(2);
            const warehouseWeight = (warehouse * weightPerUnit).toFixed(2);
            totalWeightShop += shop * weightPerUnit;
            totalWeightWarehouse += warehouse * weightPerUnit;

            const needed = Math.max(0, min - shop);

            let costPrice = 0;
            try {
                costPrice = Calculator.cost(item) || 0;
            } catch (err) {
                console.warn(`Failed to calculate cost for ${item}:`, err);
                costPrice = 0;
            }

            const shopPrice = Number(customPrices[item]?.shop) || costPrice * 1.25;
            const bulkPrice = Number(customPrices[item]?.bulk) || shopPrice;

            const profit = shopPrice - costPrice;
            const bulkProfit = bulkPrice - costPrice;
            const sMargin = shop !== null && costPrice ? ((profit / costPrice) * 100) : 0;
            const bMargin = bulkProfit !== null && costPrice ? ((bulkProfit / costPrice) * 100) : 0;
            const taxRate = App.state.shopTaxRate || 0.08; // default 8% if not set
            const profitAfterTax = profit * (1 - taxRate);
            const sMarginAfterTax = costPrice > 0 ? ((profitAfterTax / costPrice) * 100) : 0;

            const addBtn = needed > 0 ? `
                <button class="success small" style="margin-bottom:4px;" onclick="Inventory.addToOrder('${item}', ${needed})">
                    +${needed} to Order
                </button><br>` : '';

            const moveBtn = (needed > 0 && warehouse > 0) ? `
                <button class="primary small" onclick="Inventory.moveToShop('${item}')">
                    Move ${Math.min(needed, warehouse)} to Display
                </button>` : '';

            const row = document.createElement("tr");
            row.style.background = low ? 'rgba(255,100,100,0.12)' : '';
            row.innerHTML = `
                <td><strong>${item}</strong></td>
                <td>Crafted Item</td>
                
                
                <td style="text-align:center; font-size:14px; font-weight: bold;">
                <span style="color:#ee940e;">Raw Cost: </span>
                <span style=" font-weight: bold; color:${costPrice >= 0 ? 'rgba(21, 255, 0, 1)' : '#f66'};">$${costPrice.toFixed(2)}</span><br>
                    <input type="number" 
                        style="width: 82px; text-align: center; cursor: text; font-weight: 900; color:${profitAfterTax > 0 ? '#0f8' : '#f66'};" 
                        class="shop-price-input" data-item="${item}" data-tier="shop"
                        value="${shopPrice.toFixed(2)}" style="text-align:center; font-weight:bold;"
                        placeholder="${(costPrice * 1.25).toFixed(2)}" 
                        ${!hasPermission("canEditRawPrices") ? 'disabled' : ''}
                    >
                <span style=" font-weight: bold; color:${profit >= 0 ? '#0f8' : '#f66'};">
                    <br>
                    <span style="font-weight: bold;color:#0e95d4;">Profit (shop):</span> 
                    <span style=" font-weight: bold; color:${profit >= 0 ? '#0f8' : '#f66'};">$${profit.toFixed(2)}</span>
                    <br>
                    <span style="font-weight: bold;color:#0e95d4;">Profit After Tax:</span>
                    <span style="font-weight: bold; color:${profitAfterTax >= 0 ? '#0ff' : '#f66'};">$${profitAfterTax.toFixed(2)}</span>
                    <br>
                    <span style="font-weight: bold;color:#0e95d4;">margin:</span>
                    <span style="font-weight:bold;color:${sMargin >= 0 ? '#0f8' : '#f66'};">${sMargin.toFixed(2)}%</span>   
                    <br>
                    <span style="font-weight: bold;color:#0e95d4;">Margin after tax:</span>
                    <span style="font-weight:bold;color:${sMarginAfterTax >= 0 ? '#0ff' : '#f66'};">${sMarginAfterTax.toFixed(1)}%</span>
                </td>
                <td style="text-align:center; font-size:14px;">
                <span style="font-weight:bold;color:#ee940e;">Raw Cost: </span>
                <span style=" font-weight: bold; color:${costPrice >= 0 ? '#0f8' : '#f66'};">$${costPrice.toFixed(2)}</span><br>
                    <input type="number" class="bulk-price-input" data-item="${item}" data-tier="bulk"
                        value="${(customPrices[item]?.bulk ?? costPrice * 1.10).toFixed(2)}" 
                        style="width:82px; text-align:center; font-weight: 900; color:${bulkProfit > 0 ? '#0f8' : '#f66'};"
                        placeholder="${(costPrice * 1.10).toFixed(2)}" ${!hasPermission("canEditRawPrices") ? 'disabled' : ''}>
                        <br>
                        <span style="font-weight: bold;color:#f0ec0f;">Profit (bulk):</span>
                        <span style="font-weight:bold;color:${profit >= 0 ? '#0f8' : '#f66'};">
                         $${bulkProfit.toFixed(2)}
                    </span><br>
                    <span style="font-weight: bold;color:#f0ec0f;">margin:</span>
                    <span style="font-weight:bold;color:${bMargin >= 0 ? '#0f8' : '#f66'};">${bMargin.toFixed(2)}%</span>
                    <br>&nbsp;
                    <br>&nbsp;
                    </td>
                <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                <span style="color:#888;">Warehouse Stock</span><br>
                <input type="number" min="0"
                        class=" warehouse-stock-input"
                        data-item="${item}"
                        value="${warehouse}" ${!hasPermission("canEditwarehouseStock") ? 'disabled' : ''}>
                    <br><span style="color:#0af;">${warehouseWeight}kg</span>
                </td>
                <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                <span style="color:#888;">For Sale In Shop</span><br>
                    <input type="number" min="0"
                        class="shop-stock-input"
                        data-item="${item}"
                        value="${shop}" ${!hasPermission("canEditShopStock") ? 'disabled' : ''}>
                    
                    <br><span style="color:#0af;">${shopWeight}kg</span>
                </td>
                <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                    <span style="color:#888;">Min Shop Stock</span><br>
                    <input type="number" min="0"
                        class="min-stock-input"
                        data-item="${item}"
                        value="${min}"
                        title="0 = Not on display" ${!hasPermission("canEditShopStock") ? 'disabled' : ''}><br>&nbsp;
                </td>
                <td style="color:${low ? 'var(--red)' : 'var(--green)'};font-weight:bold;">
                    ${low ? 'LOW (-' + needed + ')' : 'OK'}
                </td>
                <td style="text-align:center;">
                    ${hasPermission("canTransferStock") ? `
                        ${addBtn}
                        ${moveBtn}
                        <button class="info small" onclick="Inventory.removeFromShop('${item}')" style="margin:4px;">
                            Return to Warehouse
                        </button>
                    ` : `
                        <span style="color:#888; font-style:italic; font-size:14px;">(Transfer restricted)</span>
                    `}
                </td>
            `;
            fragment.appendChild(row);
        });

        // === 2. RAW MATERIALS ON DISPLAY ===
        if (Object.keys(minStock).some(k => minStock[k] >= 0 && !recipes[k] && App.state.rawPrice?.[k] !== undefined)) {
            const rawHeader = document.createElement("tr");
            rawHeader.innerHTML = `
                <td colspan="10" style="background:#222; color:#d4850e; padding:14px; text-align:center; font-weight:bold; font-size:16px;">
                    RAW MATERIALS ON DISPLAY
                </td>
            `;
            fragment.appendChild(rawHeader);
        }
        Object.keys(minStock)
            .filter(k => minStock[k] >= 0 && !recipes[k] && App.state.rawPrice?.[k] !== undefined)
            .sort()
            .forEach(raw => {
                if (search && !raw.toLowerCase().includes(search)) return;

                const shop = shopStock[raw] || 0;
                const warehouse = warehouseStock[raw] || 0;
                const min = minStock[raw];
                const low = shop < min;
                if (low) lowCount++;

                if (onlyLow && !low) return;

                const weightPerUnit = Calculator.weight(raw);
                const shopWeight = (shop * weightPerUnit).toFixed(2);
                const warehouseWeight = (warehouse * weightPerUnit).toFixed(2);
                totalWeightShop += shop * weightPerUnit;
                totalWeightWarehouse += warehouse * weightPerUnit;

                const needed = Math.max(0, min - shop);

                // === SMART COST: Use average harvest cost for seed products ===
                let costPrice = 0;
                const rawItem = App.state.rawPrice?.[raw];

                // 1. If it's a seed's final product (Corn, Wheat, etc.) → use average harvest cost
                if (App.state.seeds) {
                    const isFinalProduct = Object.values(App.state.seeds).some(s =>
                        s.finalProduct === raw
                    );
                    if (isFinalProduct) {
                        costPrice = Crops.getAverageCostPerUnit(raw);
                    }
                }

                // 2. Fallback: use rawPrice (handles both number and {price})
                if (costPrice === 0 && rawItem !== undefined) {
                    costPrice = typeof rawItem === 'object' ? (rawItem.price || 0) : rawItem;
                }

                const shopPrice = Number(customPrices[raw]?.shop) || costPrice * 1.25;
                const bulkPrice = Number(customPrices[raw]?.bulk) || 0;
                const profit = shopPrice - costPrice;
                const bulkProfit = bulkPrice - costPrice;

                const sMargin = shopPrice !== null && costPrice ? ((profit / costPrice) * 100) : 0;
                const bMargin = bulkPrice !== null && costPrice ? ((bulkProfit / costPrice) * 100) : 0;
                const taxRate = App.state.shopTaxRate || 0.08; // default 8% if not set
                const profitAfterTax = profit * (1 - taxRate);
                const sMarginAfterTax = costPrice > 0 ? ((profitAfterTax / costPrice) * 100) : 0;

                const addBtn = needed > 0 ? `
                    <button class="success small" style="margin-bottom:4px;" onclick="Inventory.addToOrder('${raw}', ${needed})">
                        +${needed} to Order
                    </button><br>` : '';

                const moveBtn = (needed > 0 && warehouse > 0) ? `
                    <button class="primary small" onclick="Inventory.moveToShop('${raw}')">
                        Move ${Math.min(needed, warehouse)} to Display
                    </button>` : '';

                const row = document.createElement("tr");
                row.style.background = low ? 'rgba(255,100,100,0.12)' : '';
                row.innerHTML = `
                    <td><strong>${raw}</strong></td>
                    <td>Raw Material</td>
                    
                    <td style="text-align:center; font-size:14px;">
                    <span style="font-weight:bold;color:#ee940e;">Raw Cost: </span>
                    <span style="font-weight:bold;color:${costPrice >= 0 ? '#0f8' : '#f66'};font-weight:bold;">$${costPrice.toFixed(2)}</span><br>
                        <input type="number" class="shop-price-input" data-item="${raw}" data-tier="shop"
                            value="${shopPrice.toFixed(2)}" style="width:82px; text-align:center; font-weight:900; color:${profitAfterTax > 0 ? '#0f8' : '#f66'};"
                            placeholder="${(costPrice * 1.25).toFixed(2)}">
                            <br>
                            <span style="font-weight: bold;color:#0e95d4;">Profit (shop):</span>
                            <span style="font-weight:bold;color:${profit >= 0 ? '#0f8' : '#f66'};">$${profit.toFixed(2)}</span>
                            <br><span style="font-weight: bold;color:#0e95d4;">Profit After Tax:</span>
                            <span style="font-weight: bold; color:${profitAfterTax >= 0 ? '#0ff' : '#f66'};">$${profitAfterTax.toFixed(2)}</span>
                            <br>
                            <span style="font-weight: bold;color:#0e95d4;">margin:</span>
                            <span style="font-weight:bold;color:${sMargin >= 0 ? '#0f8' : '#f66'};">${sMargin.toFixed(2)}%</span>
                            <br>
                            <span style="font-weight: bold;color:#0e95d4;">Margin after tax:</span>
                            <span style="font-weight:bold;color:${sMarginAfterTax >= 0 ? '#0ff' : '#f66'};">${sMarginAfterTax.toFixed(1)}%</span>
                            </td>
                    <td style="text-align:center; font-size:14px;">
                    <span style="font-weight:bold;color:#ee940e;">Raw Cost: </span>
                    <span style="color:${costPrice >= 0 ? '#0f8' : '#f66'};font-weight:bold;">$${costPrice.toFixed(2)}</span><br>
                        <input type="number" class="bulk-price-input" data-item="${raw}" data-tier="bulk"
                            value="${(customPrices[raw]?.bulk ?? costPrice).toFixed(2)}" 
                            style="width:82px; text-align:center; font-weight: 900; color:${profitAfterTax > 0 ? '#0f8' : '#f66'};"
                            placeholder="${(costPrice).toFixed(2)}">
                        <br>
                        <span style="font-weight: bold;color:#f0ec0f;">Profit (bulk):</span>
                        <span style="font-weight:bold;color:${bulkProfit >= 0 ? '#0f8' : '#f66'};">$${bulkProfit.toFixed(2)}</span>
                        <br>
                        <span style="font-weight: bold;color:#f0ec0f;">margin:</span>
                        <span style="font-weight:bold;color:${bMargin >= 0 ? '#0f8' : '#f66'};">${bMargin.toFixed(2)}%</span>
                        <br>&nbsp;
                        <br>&nbsp;
                        </td>
                    <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                        <span style="color:#888;">Warehouse Stock</span><br>
                        <input type="number" min="0"
                            class=" warehouse-stock-input"
                            data-item="${raw}"
                            value="${warehouse}"
                            ${!hasPermission("canEditwarehouseStock") ? 'disabled' : ''}
                            >
                        
                        <br><span style="color:#0af;">${warehouseWeight}kg</span>
                    </td>
                    <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                        <span style="color:#888;">For Sale In Shop</span><br>
                        <input type="number" min="0"
                            class=" shop-stock-input"
                            data-item="${raw}"
                            value="${shop}"
                            ${!hasPermission("canEditShopStock") ? 'disabled' : ''}
                            >
                        
                        <br><span style="color:#0af;">${shopWeight}kg</span>
                    </td>
                    <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                        <span style="color:#888;">Min Shop Stock</span><br>
                        <input type="number" min="0"
                            class="min-stock-input"
                            data-item="${raw}"
                            value="${min}"
                            title="0 = Not on display"
                            ${!hasPermission("canEditShopStock") ? 'disabled' : ''}
                            ><br>&nbsp;
                    </td>
                    <td style="color:${low ? 'var(--red)' : 'var(--green)'};font-weight:bold;">
                        ${low ? 'LOW (-' + needed + ')' : 'OK'}
                    </td>
                    <td>
                        ${addBtn}
                        ${moveBtn}
                        <button class="danger small" onclick="Inventory.removeFromShop('${raw}')">
                            Remove from Shop
                        </button>
                    </td>
                `;
                fragment.appendChild(row);
            });

        // === 3. RAW MATERIALS NOT ON DISPLAY ===
        const rawNotOnDisplay = Object.keys(rawPrice)
            .filter(r => (!minStock[r] || minStock[r] === 0) && !recipes[r])
            .sort();

        if (rawNotOnDisplay.length > 0 && (!search || rawNotOnDisplay.some(r => r.toLowerCase().includes(search)))) {
            const header = document.createElement("tr");
            header.innerHTML = `<td colspan="10" style="background:#222; color:#d4850e; padding:14px; text-align:center; font-weight:bold; font-size:16px;">
            RAW MATERIALS NOT ON DISPLAY
        </td>`;
            fragment.appendChild(header);

            rawNotOnDisplay.forEach(raw => {
                if (search && !raw.toLowerCase().includes(search)) return;
                const warehouse = warehouseStock[raw] || 0;
                const weightPerUnit = Calculator.weight(raw);
                const warehouseWeight = (warehouse * weightPerUnit).toFixed(2);
                totalWeightWarehouse += warehouse * weightPerUnit;

                // === SMART COST: Use average harvest cost for seed products ===
                let costPrice = 0;
                const rawItem = App.state.rawPrice?.[raw];

                // 1. If it's a seed's final product (Corn, Wheat, etc.) → use average harvest cost
                if (App.state.seeds) {
                    const isFinalProduct = Object.values(App.state.seeds).some(s =>
                        s.finalProduct === raw
                    );
                    if (isFinalProduct) {
                        costPrice = Crops.getAverageCostPerUnit(raw);
                    }
                }

                // 2. Fallback: use rawPrice (handles both number and {price})
                if (costPrice === 0 && rawItem !== undefined) {
                    costPrice = typeof rawItem === 'object' ? (rawItem.price || 0) : rawItem;
                }

                const row = document.createElement("tr");
                row.style.background = "rgba(100,150,255,0.08)";
                row.innerHTML = `
                    <td><strong>${raw}</strong></td>
                    <td>Raw Material</td>
                    <td style="text-align:center;font-weight:bold;color:#aaa;font-size:14px;">
                        Cost: 
                        <span style=" font-weight: bold; color:${costPrice >= 0 ? '#0f8' : '#f66'};">$${costPrice.toFixed(2)}</span>
                    </td>
                    <td  style="text-align:center;color:#666;">—</td>
                    <td style="text-align:center;font-weight:bold;color:var(--accent);font-size:16px;">
                        <input type="number" min="0"
                            class=" warehouse-stock-input"
                            data-item="${raw}"
                            value="${warehouse}">
                        <br><span style="color:#888;">warehouse stock</span>
                        ${weightPerUnit > 0 ? `<br><span style="color:#0af;">${warehouseWeight}kg</span>` : ""}
                    </td>
                    <td colspan="3" style="text-align:center;color:#888;">Not for sale yet</td>
                    <td>
                        <button class="success small" onclick="Inventory.addRawToShop('${raw}')">
                            + Add to Shop Display
                        </button>
                    </td>
                `;
                fragment.appendChild(row);
            });
        }

        tbody.innerHTML = "";
        tbody.appendChild(fragment);

        const summary = document.getElementById("inventorySummary");
        if (summary) {
            summary.innerHTML = `
                <div style="display:flex;gap:20px;justify-content:center;align-items:center;flex-wrap:wrap;font-size:15px;">
                    <span style="color:var(--green)">Shop: ${totalWeightShop.toFixed(2)}kg</span>
                    <span style="color:#0af">Warehouse: ${totalWeightWarehouse.toFixed(2)}kg</span>
                    <span style="color:#0ff;font-weight:bold;">TOTAL: ${(totalWeightShop + totalWeightWarehouse).toFixed(2)}kg</span>
                    ${lowCount > 0 ? `
                    <span>
                        <button id="lowStockBadge"
                                style="background:${onlyLow ? '#c33' : 'rgba(255,50,50,0.15)'};color:${onlyLow ? 'white' : '#f66'};border:1px solid ${onlyLow ? '#f66' : '#f55'};padding:6px 14px;border-radius:20px;font-weight:bold;font-size:14px;cursor:pointer;"
                                onclick="Inventory.filterLowStock(!Inventory._filterLowOnly)">
                            ${onlyLow ? 'Low Only (' + lowCount + ')' : lowCount + ' low'}
                        </button>
                    </span>` : '<span style="color:var(--green);font-weight:bold;">All stocked!</span>'}
                </div>`;
        }
        // === RE-ATTACH PRICE INPUT LISTENERS (MUST RUN AFTER RENDER) ===
        document.querySelectorAll('#inventoryTable .shop-price-input, #inventoryTable .bulk-price-input').forEach(input => {
            // Remove old listeners to prevent duplicates
            input.removeEventListener('blur', Inventory.handlePriceChange);
            input.removeEventListener('keydown', Inventory._handlePriceKeydown);

            // Re-attach
            input.addEventListener('blur', () => Inventory.handlePriceChange(input));
            input.addEventListener('keydown', Inventory._handlePriceKeydown);

            // Input cleaning (allow only numbers, comma, dot)
            input.addEventListener('input', () => {
                input.value = input.value.replace(/[^0-9.,]/g, '');
            });

            // Manager-only editing
            if (!isManager()) {
                input.disabled = true;
                input.title = "Only managers can edit prices";
                input.style.opacity = "0.6";
                input.style.cursor = "not-allowed";
            } else {
                input.disabled = false;
                input.style.cursor = "text";
                input.title = "Edit price • Tab or click away to save";
            }
        });

    },

    // AUTO-SAVE + GREEN FLASH — MODERN, NO DEPRECATED EVENT
    _filterLowOnly: false,

    filterLowStock(enabled) {
        this._filterLowOnly = !!enabled;
        document.getElementById("inventorySearch").value = "";
        this.render();
    },

    addRawToShop(raw) {
        const min = prompt(`Set minimum shop stock for "${raw}"? (e.g. 20)`, "20");
        const minNum = parseInt(min);
        if (isNaN(minNum) || minNum < 1) {
            showToast("fail", "Enter a valid minimum stock");
            return;
        }

        // === THIS IS THE KEY FIX ===
        // Auto-set a default shop price (e.g. 2× raw cost)
        const rawCost = App.state.rawPrice?.[raw]?.price || App.state.rawPrice?.[raw] || 0;
        const defaultShopPrice = (rawCost * 2).toFixed(2); // or 1.5, 3, whatever you want

        if (!App.state.customPrices) App.state.customPrices = {};
        if (!App.state.customPrices[raw]) App.state.customPrices[raw] = {};
        App.state.customPrices[raw].shop = parseFloat(defaultShopPrice);

        // === End of fix ===

        App.state.minStock[raw] = minNum;
        App.state.shopStock[raw] = 0;

        Promise.all([
            App.save("minStock"),
            App.save("shopStock"),
            App.save("customPrices")
        ]).then(() => {
            showToast("success", `${raw} added to shop display! Price: $${defaultShopPrice}`);
            this.render();
        });
    },

    async removeFromShop(item) {
        const ok = await showConfirm(`Remove "${item}" from shop display?\nAll display stock will return to warehouse.`);
        if (!ok) return;

        const shopQty = App.state.shopStock[item] || 0;
        App.state.warehouseStock[item] = (App.state.warehouseStock[item] || 0) + shopQty;
        delete App.state.minStock[item];
        delete App.state.shopStock[item];

        await Promise.all([
            App.save("minStock"),
            App.save("shopStock"),
            App.save("warehouseStock")
        ]);

        showToast("success", `${item} removed from shop. ${shopQty} returned to warehouse.`);
        this.render();
    },

    moveToShop(item) {
        const warehouse = App.state.warehouseStock[item] || 0;
        const shop = App.state.shopStock[item] || 0;
        const min = App.state.minStock[item] || 0;

        if (shop >= min) {
            showToast("info", `${item} already has enough on display (${shop}/${min})`);
            return;
        }

        const needed = min - shop;
        const available = warehouse;
        if (available <= 0) {
            showToast("fail", `No ${item} in warehouse to move`);
            return;
        }

        const toMove = Math.min(needed, available);
        App.state.warehouseStock[item] = warehouse - toMove;
        App.state.shopStock[item] = shop + toMove;

        App.save("warehouseStock");
        App.save("shopStock");

        showToast("success", `Moved ${toMove}× ${item} to shop display (now ${shop + toMove}/${min})`);
        this.render();
    },

    addAllLowStock() {
        const minStock = App.state.minStock || {};
        const shopStock = App.state.shopStock || {};

        let addedCount = 0;
        let totalQty = 0;

        Object.keys(minStock).forEach(item => {
            const min = minStock[item] ?? 0;
            const current = shopStock[item] || 0;
            const needed = Math.max(0, min - current);

            if (needed > 0) {
                const toAdd = needed;

                const existing = App.state.order.find(o => o.item === item);
                if (existing) {
                    existing.qty += toAdd;
                } else {
                    App.state.order.push({ item, qty: toAdd, tier: "shop" });
                }

                addedCount++;
                totalQty += toAdd;
            }
        });

        if (addedCount === 0) {
            showToast("info", "No low stock items need restocking!");
            return;
        }

        debouncedSaveOrder?.();
        Order.renderCurrentOrder();
        debouncedCalcRun();

        showToast("success", `Added ${addedCount} low stock item${addedCount > 1 ? "s" : ""} (${totalQty} total) to order`);
        activateTab("order");
    },

    addToOrder(item, qty) {
        qty = parseInt(qty) || 1;

        const existing = App.state.order.find(o => o.item === item);
        if (existing) {
            existing.qty += qty;
        } else {
            App.state.order.push({ item, qty, tier: "shop" });
        }

        debouncedSaveOrder?.();
        Order.renderCurrentOrder();
        debouncedCalcRun();

        showToast("success", `${qty}× ${item} added to order`);
        activateTab("order");
    },
    async handlePriceChange(input) {
        const item = input.dataset.item;
        const tier = input.dataset.tier;  // "shop" or "bulk"
        let val = input.value.replace(/,/g, "").trim();
        let num = val === "" ? null : parseFloat(val);

        if (num !== null && isNaN(num)) return;

        // Ensure customPrices exists
        if (!App.state.customPrices) App.state.customPrices = {};
        if (!App.state.customPrices[item]) App.state.customPrices[item] = {};

        if (num === null) {
            delete App.state.customPrices[item][tier];
            if (Object.keys(App.state.customPrices[item]).length === 0) {
                delete App.state.customPrices[item];
            }
        } else {
            App.state.customPrices[item][tier] = num;
            // Format with commas and 2 decimals
            input.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Visual feedback
        input.style.background = "#00880044";
        input.style.borderColor = "var(--green)";

        try {
            await App.save("customPrices");
            Inventory.render();  // Critical: re-render to update profit everywhere
        } catch (err) {
            console.error("Failed to save customPrices", err);
            input.style.background = "#88000044";
            input.style.borderColor = "var(--red)";
        }

        // Clear flash
        setTimeout(() => {
            input.style.background = "";
            input.style.borderColor = "";
        }, 600);
    },
    _handlePriceKeydown(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            e.target.blur();  // Triggers save
        }
    }

};
let lastSavedInput = null;
// FIXED: Weight update + green flash (works 100%)
document.getElementById("inventoryTable")?.addEventListener("focusout", function (e) {
    const input = e.target;
    if (!input) return;

    // Only stock inputs (not price inputs)
    if (!input.matches('.shop-stock-input, .warehouse-stock-input, .min-stock-input')) return;

    const item = input.dataset.item;
    if (!item) return;

    let value = parseInt(input.value) || 0;
    if (value < 0) value = 0;
    input.value = value;

    // === SAVE TO STATE ===
    if (input.classList.contains("shop-stock-input")) {
        App.state.shopStock[item] = value;
        App.save("shopStock");
    } else if (input.classList.contains("warehouse-stock-input")) {
        App.state.warehouseStock[item] = value;
        App.save("warehouseStock");
    } else if (input.classList.contains("min-stock-input")) {
        App.state.minStock[item] = value;
        App.save("minStock");
    }

    // === UPDATE WEIGHT LIVE (THIS IS THE KEY FIX) ===
    const weightPerUnit = Calculator.weight(item);
    if (weightPerUnit > 0) {
        const qty = value;
        const newWeightText = (qty * weightPerUnit).toFixed(2) + "kg";

        // Find the correct weight label in the same cell
        const weightLabel = input.closest("td")
            ?.querySelector('span[style*="color:#0af"], span.style-color-0af');

        if (weightLabel) {
            weightLabel.textContent = newWeightText;
        }
    }

    // === GREEN FLASH ===
    input.style.background = "#10da3fff";
    input.style.transition = "background 0.4s ease";
    setTimeout(() => input.style.background = "", 400);
});




// Debounced search
const updateInventorySearch = debounce(() => Inventory.render(), 200);
const searchInput = document.getElementById("inventorySearch");
if (searchInput) {
    searchInput.addEventListener("input", updateInventorySearch);
    searchInput.addEventListener("paste", () => setTimeout(updateInventorySearch, 100));
}