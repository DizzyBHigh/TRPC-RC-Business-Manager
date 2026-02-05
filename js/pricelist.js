// =============
// Price List 
// =============
const PriceList = {
    render() {
        const filter = document.getElementById("priceFilter").value.trim().toLowerCase();
        const showHidden = document.getElementById("showHidden").checked;
        let html = "";

        Object.entries(App.state.categories)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([cat, items]) => {
                const filtered = items.filter(i =>
                    i.toLowerCase().includes(filter) &&
                    (showHidden || !App.state.hiddenFromPriceList[i])
                );
                if (filtered.length === 0) return;

                html += `<div class="category-header">${cat}</div>
                        <table class="price-table">
                        <tr>
                            <th>Hide</th>
                            <th>Item</th>
                            <th>Weight</th>
                            <th>Cost</th>

                            <!-- BULK GROUP -->
                            <th class="price-group bulk">Bulk Price</th>
                            <th class="price-group bulk">Bulk Profit</th>
                            <th class="price-group bulk">Bulk Margin</th>

                            <!-- SHOP GROUP -->
                            <th class="price-group shop">Shop Price</th>
                            <th class="price-group shop">Shop Profit</th>
                            <th class="price-group shop">Shop Margin</th>

                            <!-- NEW: ADD TO ORDER COLUMN -->
                            <th style="width:180px;text-align:center;">Add to Order</th>
                        </tr>`;

                filtered.forEach(item => {
                    const cost = Calculator.cost(item);
                    const weight = Calculator.weight(item);
                    const bulk = App.state.customPrices[item]?.bulk ?? null;
                    const shop = App.state.customPrices[item]?.shop ?? null;

                    const bVal = bulk !== null ? Number(bulk).toFixed(2) : "";
                    const sVal = shop !== null ? Number(shop).toFixed(2) : "";

                    const bProfit = bulk !== null ? Number(bulk) - cost : 0;
                    const sProfit = shop !== null ? Number(shop) - cost : 0;
                    const bMargin = bulk !== null && cost ? ((bProfit / cost) * 100) : 0;
                    const sMargin = shop !== null && cost ? ((sProfit / cost) * 100) : 0;

                    const hidden = App.state.hiddenFromPriceList[item];
                    const hiddenStyle = hidden ? 'opacity:0.5;background:#2d1b3a;' : '';

                    const weightDisplay = weight > 0
                        ? `<strong style="color:#0af;">${weight.toFixed(2)} kg</strong>`
                        : `<span style="color:#666;">—</span>`;

                    // ADD TO ORDER BUTTON + INPUT
                    const addToOrderHTML = `
                                    <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
                                    <input type="number" min="1" value="1" style="width:60px;padding:6px;font-size:14px;text-align:center;"
                                            id="addQty_${item.replace(/ /g, '_')}">
                                    <button class="success small" style="padding:6px 12px;"
                                            onclick="PriceList.addToOrder('${item}')">
                                        Add
                                    </button>
                                    </div>`;

                    html += `<tr style="${hiddenStyle}">
                            <td style="text-align:center;">
                            <input type="checkbox" class="hide-checkbox" data-item="${item}" ${hidden ? "checked" : ""}
                                    onchange="PriceList.toggleHide('${item}',this.checked)">
                            </td>
                            <td><strong>${item}</strong>${hidden ? ' <small style="color:#ff6b6b">(hidden)</small>' : ''}</td>
                            <td style="text-align:center;font-weight:bold;">${weightDisplay}</td>
                            <td style="color:#aaa;">$${cost.toFixed(2)}</td>

                            <!-- BULK -->
                            <td><input type="text" class="price-input" data-item="${item}" data-tier="bulk"
                                    value="${bVal}" placeholder="${(cost * 1.10).toFixed(2)}"></td>
                            <td class="${bProfit >= 0 ? 'profit-positive' : 'profit-negative'}">$${bProfit.toFixed(2)}</td>
                            <td class="${bProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${bMargin.toFixed(1)}%</td>

                            <!-- SHOP -->
                            <td><input type="text" class="price-input" data-item="${item}" data-tier="shop"
                                    value="${sVal}" placeholder="${(cost * 1.25).toFixed(2)}"></td>
                            <td class="${sProfit >= 0 ? 'profit-positive' : 'profit-negative'}">$${sProfit.toFixed(2)}</td>
                            <td class="${sProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${sMargin.toFixed(1)}%</td>

                            <!-- ADD TO ORDER -->
                            <td>${addToOrderHTML}</td>
                        </tr>`;
                });

                html += `</table><div style="margin:20px 0;"></div>`;
            });

        document.getElementById("priceListContainer").innerHTML = html ||
            "<p style='text-align:center;color:#888;padding:60px;'>No items match filter.</p>";

        this.initPriceInputs();
    },

    // Re-attach input listeners after render
    initPriceInputs() {
        const isMgr = isManager();

        // Show manager status message at the top
        let statusMsg = document.getElementById("pricelistEditText");
        if (!statusMsg) {
            statusMsg = document.createElement("div");
            statusMsg.id = "priceListStatus";
            statusMsg.style.cssText = "text-align:center;margin:20px 0;padding:16px;background:#222;border-radius:12px;font-size:18px;";
            document.getElementById("priceListContainer").before(statusMsg);
        }

        if (isMgr) {
            statusMsg.innerHTML = `<strong style="color:var(--green);">MANAGER MODE — You can edit prices</strong>`;
        } else {
            statusMsg.innerHTML = `
                    <strong style="color:var(--red);">VIEW ONLY — Only managers can edit prices here</strong><br>
                    <span style="color:#aaa;font-size:15px;">
                        You can still set a custom price per order on the Order page if needed
                    </span>`;
        }

        document.querySelectorAll(".price-input").forEach(input => {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceWith(newInput);

            if (isMgr) {
                // Full editing for managers
                newInput.addEventListener("blur", () => this.handlePriceChange(newInput));
                newInput.addEventListener("keydown", e => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        newInput.blur();
                    }
                });
                newInput.addEventListener("input", () => {
                    newInput.value = newInput.value.replace(/[^0-9.,]/g, "");
                });
                newInput.style.cursor = "text";
                newInput.title = "Click to edit price";
            } else {
                // Read-only for everyone else
                newInput.disabled = true;
                newInput.style.background = "#2d2d2d";
                newInput.style.color = "#888";
                newInput.style.cursor = "not-allowed";
                newInput.title = "Only managers can edit prices";
            }
        });


        // Hide/Unhide checkboxes
        document.querySelectorAll(".hide-checkbox").forEach(cb => {
            if (!isMgr) {
                cb.disabled = true;
                cb.title = "Only managers can hide items";
            }
        });

        // Unhide All button
        const unhideBtn = document.querySelector('button[onclick*="unhideAll"]');
        if (unhideBtn) {
            unhideBtn.disabled = !isMgr;
            unhideBtn.title = isMgr ? "" : "Only managers can unhide all items";
            unhideBtn.style.opacity = isMgr ? "1" : "0.5";
        }
    },

    addToOrder(itemName) {
        const qtyInput = document.getElementById(`addQty_${itemName.replace(/ /g, '_')}`);
        const qty = parseInt(qtyInput.value) || 1;
        if (qty < 1) qty = 1;

        // Add to current order
        const existing = App.state.order.find(o => o.item === itemName);
        if (existing) {
            existing.qty += qty;
        } else {
            App.state.order.push({ item: itemName, qty: qty, tier: "shop" });
        }

        // Save & refresh
        debouncedSaveOrder?.();
        Order.renderCurrentOrder();
        Calculator.run();

        // Feedback
        showToast("success", `${qty}× ${itemName} added to order`);

        // Switch to Order tab
        document.querySelector(`.tab[data-tab="order"]`)?.click();
    },

    async handlePriceChange(input) {
        const item = input.dataset.item;
        const tier = input.dataset.tier;
        let val = input.value.replace(/,/g, "").trim();
        let num = val === "" ? null : parseFloat(val);

        if (num !== null && isNaN(num)) return;

        if (!App.state.customPrices[item]) App.state.customPrices[item] = {};
        if (num === null) {
            delete App.state.customPrices[item][tier];
            if (Object.keys(App.state.customPrices[item]).length === 0) delete App.state.customPrices[item];
        } else {
            App.state.customPrices[item][tier] = num;
            input.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        input.style.background = "#00880044";
        input.style.borderColor = "var(--green)";

        try {
            await App.save("customPrices");
            this.render();
        } catch (err) {
            console.error("Save failed", err);
            input.style.background = "#88000044";
            input.style.borderColor = "var(--red)";
        }

        setTimeout(() => {
            input.style.background = "";
            input.style.borderColor = "";
        }, 600);
    },

    toggleHide(item, hide) {
        if (hide) App.state.hiddenFromPriceList[item] = true;
        else delete App.state.hiddenFromPriceList[item];
        App.save("hiddenFromPriceList").then(() => this.render());
    },

    unhideAll() {
        if (showConfirm("Unhide ALL items from price list?")) {
            App.state.hiddenFromPriceList = {};
            App.save("hiddenFromPriceList").then(() => this.render());
        }
    },

    saveAll() {
        showToast("success", "Prices are saved automatically!");
    }
};

