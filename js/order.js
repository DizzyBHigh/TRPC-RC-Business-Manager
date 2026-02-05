// ================================================================================================
// Order Manager — NOW WITH 3 MODES: Customer Sale | Restock Shop | Restock Warehouse
// ================================================================================================
window.orderJustCompleted = false;
window.permanentOrderCleared = false;

// RUN ONCE ON STARTUP — kills any order that shouldn't exist
window.addEventListener("load", async () => {
    setTimeout(async () => {
        const currentPendingId = App.state.currentPendingId || App.state.lastLoadedPendingId;
        const hasPending = currentPendingId &&
            (App.state.pendingOrders || []).some(o => o.id === currentPendingId);

        // If no pending order is loaded but we have items → ghost order
        if (!hasPending && App.state.order.length > 0) {
            console.log("Ghost order detected — clearing permanently");
            App.state.order = [];
            await window.ls.set("order", []);
            Order.renderCurrentOrder();
        }
    }, 800);
});
const Order = {
    mode: "customer", // "customer" | "shop" | "warehouse"

    // RENDER CURRENT ORDER — NOW WITH WEIGHT
    renderCurrentOrder() {
        if (window.orderJustCompleted) {
            console.log("Skipping render — order just completed");
            return; // ← THIS PREVENTS THE RACE CONDITION
        }
        const container = document.getElementById("orderItems");
        if (!container) return;

        if (App.state.order.length === 0) {
            container.innerHTML = `
                    <p style="text-align:center;color:#888;margin:40px 0;">
                    No items in order yet<br>
                    <small>Use the search box above to add items</small>
                    </p>`;
            // ALSO CLEAR PROFIT DISPLAY WHEN ORDER IS EMPTY
            //document.getElementById("profitLine")?.style.setProperty("display", "none");
            //document.getElementById("totalCost").textContent = "$0.00";
            //document.getElementById("profitAmount").textContent = "$0.00";
            //document.getElementById("grandTotal").textContent = "$0.00";
            return;
        }

        let totalWeight = 0;
        let html = `<table class="order-table">
                <thead><tr>
                    <th>Qty</th><th>Item</th><th>Weight</th><th>Tier</th><th>Price</th><th>Total</th><th></th>
                </tr></thead><tbody>`;

        App.state.order.forEach((o, idx) => {
            const cost = Calculator.cost(o.item);
            const basePrice = App.state.customPrices[o.item]?.[o.tier] || cost * (o.tier === "bulk" ? 1.10 : 1.25);
            const sellPrice = o.customPrice !== undefined ? o.customPrice : basePrice;
            const itemWeight = Calculator.weight(o.item);
            const lineWeight = (o.qty * itemWeight).toFixed(2);

            if (itemWeight > 0) totalWeight += o.qty * itemWeight;

            html += `<tr>
                        <td><input type="number" min="1" value="${o.qty}" style="width:60px"
                                onchange="Order.updateQty(${idx}, +this.value)"></td>
                        <td><strong>${o.item}</strong></td>
                        <td style="color:#0af;font-weight:bold;">
                        ${itemWeight > 0 ? `${lineWeight}kg` : "—"}
                        </td>
                        <td><select onchange="Order.updateTier(${idx}, this.value)">
                        <option value="shop" ${o.tier === "shop" ? "selected" : ""}>Shop</option>
                        <option value="bulk" ${o.tier === "bulk" ? "selected" : ""}>Bulk</option>
                        </select></td>
                        <td><input type="number" step="0.01" style="width:80px" placeholder="${basePrice.toFixed(2)}"
                                value="${o.customPrice !== undefined ? o.customPrice : ''}"
                                onchange="Order.updatePrice(${idx}, this.value ? +this.value : null)"></td>
                        <td>$${(sellPrice * o.qty).toFixed(2)}</td>
                        <td><button class="danger small" onclick="Order.remove(${idx})">Remove</button></td>
                    </tr>`;
        });

        html += `</tbody></table>`;

        // ADD TOTAL WEIGHT FOOTER
        if (totalWeight > 0) {
            html += `<div style="margin-top:15px;padding:12px;background:#002244;color:#0ff;border-radius:8px;text-align:center;font-size:18px;font-weight:bold;">
                    TOTAL ORDER WEIGHT: ${totalWeight.toFixed(2)} kg
                    </div>`;
        }

        container.innerHTML = html;
    },

    async add() {
        // If we're starting a new order, clear the permanent flag
        if (window.permanentOrderCleared && App.state.order.length === 0) {
            window.permanentOrderCleared = false;
            await window.ls.remove(ORDER_CLEARED_KEY);
            console.log("New order started — permanent clear reset");
        }

        const name = document.getElementById("itemSearch").value.trim();
        const qty = parseInt(document.getElementById("newQty").value) || 1;
        if (!name || !App.allItems().includes(name)) {
            showToast("fail", "Please select a valid item first!");
            return;
        }
        App.state.order.push({ item: name, qty, tier: "shop" });
        debouncedSaveOrder();;
        document.getElementById("itemSearch").value = "";
        document.getElementById("newQty").value = 1;
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    updateQty(idx, qty) {
        qty = parseInt(qty) || 1;
        if (qty < 1) qty = 1;
        App.state.order[idx].qty = qty;
        debouncedSaveOrder();;
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    updateTier(idx, tier) {
        App.state.order[idx].tier = tier;
        delete App.state.order[idx].customPrice;
        debouncedSaveOrder();;
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    updatePrice(idx, price) {
        if (price === null || price === "" || isNaN(price)) {
            delete App.state.order[idx].customPrice;
        } else {
            App.state.order[idx].customPrice = price;
        }
        debouncedSaveOrder();;
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    remove(idx) {
        App.state.order.splice(idx, 1);
        debouncedSaveOrder();;
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    async clear() {
        // 1. Determine if this order came from a pending order
        const currentPendingId = App.state.currentPendingId || App.state.lastLoadedPendingId;
        const isFromPending = currentPendingId &&
            (App.state.pendingOrders || []).some(o => o.id === currentPendingId);

        const confirmed = await showConfirm(
            isFromPending
                ? "Clear order and return to pending list?<br><small>This will stop processing and make it available again.</small>"
                : "Clear entire order?"
        );

        if (!confirmed) return;

        // 2. CANCEL ANY PENDING AUTOSAVES — CRITICAL!
        if (typeof debouncedSaveOrder === 'function' && debouncedSaveOrder.cancel) {
            debouncedSaveOrder.cancel();
        }
        if (typeof debouncedCalcRun === 'function' && debouncedCalcRun.cancel) {
            debouncedCalcRun.cancel();
        }

        // 3. Clean up pending order flags (if it was pending)
        if (isFromPending) {
            App.state.pendingOrders = (App.state.pendingOrders || []).map(o => {
                if (o.id === currentPendingId) {
                    const { inProgress, inProgressBy, inProgressAt, ...clean } = o;
                    return clean;
                }
                return o;
            });
            await window.ls.set("pendingOrders", App.state.pendingOrders);
        }

        // 4. Remove loaded pending banner & flags
        const banner = document.getElementById("loadedPendingBanner");
        if (banner) banner.style.display = "none";

        delete App.state.currentPendingId;
        delete App.state.lastLoadedPendingId;
        await window.ls.set("currentPendingId", null);
        await window.ls.set("lastLoadedPendingId", null);

        // 5. PERMANENTLY CLEAR THE CURRENT ORDER — THIS IS THE NUCLEAR FIX
        App.state.order = [];
        App.state.currentCustomer = "";
        App.state.currentEmployee = "";

        await App.save("order");           // ← This now FORCES [] to Firebase
        await App.save("currentCustomer");
        await App.save("currentEmployee");
        // Reset form fields
        const customerInput = document.getElementById("customerName");
        const employeeSelect = document.getElementById("employeeSelect");
        if (customerInput) customerInput.value = "";
        if (employeeSelect) employeeSelect.value = "";
        // FORCE SAVE EMPTY STATE USING YOUR ls SYSTEM — THIS KILLS GHOSTS
        await Promise.all([
            window.ls.set("order", []),
            window.ls.set("currentCustomer", ""),
            window.ls.set("currentEmployee", "")
        ]);

        // 6. Final UI refresh
        Order.renderCurrentOrder();  // ← This now clears profit display too
        debouncedCalcRun();
        updateProfitDisplay();
        Inventory.render();
        document.getElementById("orderPageSummary").innerHTML = "";

        showToast("success", Order.mode === "shop" || Order.mode === "warehouse" ? "Restock order cleared" : "Order cleared permanently");
    },

    async complete() {
        if (App.state.order.length === 0) return showToast("fail", "Order is empty!");

        const overlay = document.getElementById("processingOverlay");
        const title = document.getElementById("processingTitle");
        const subtitle = document.getElementById("processingSubtitle");

        overlay.style.display = "flex";
        title.textContent = "Processing Order...";
        subtitle.textContent = "Consuming materials...";

        try {
            const isShopRestock = this.mode === "shop";
            const isWarehouseRestock = this.mode === "warehouse";
            const isCustomerSale = this.mode === "customer";  // ← MOVED HERE — NOW IN SCOPE

            // ──────── 1. GET EMPLOYEE & COMMISSION RATE ────────
            const employeeSelect = document.getElementById("employeeSelect");
            const employeeName = employeeSelect?.value?.trim();
            if (!employeeName) throw new Error("Please select an employee!");

            const empData = App.state.employees?.[employeeName];
            if (empData === undefined) throw new Error("Employee not found!");
            const commissionRate = (typeof empData === 'object') ? (empData.commissionRate ?? 0) : empData;

            // ──────── 2. GET CUSTOMER ────────
            let customerName = "Walk-in";
            if (this.mode === "customer") {
                const customerInput = document.getElementById("customerName");
                customerName = customerInput?.value?.trim() || "Walk-in";
                if (!customerName) throw new Error("Customer name required!");
            } else {
                customerName = "INTERNAL";
            }

            // ──────── 3. CALCULATE TOTALS PROGRAMMATICALLY (NO DOM READING) ────────
            // ──────── 3. CALCULATE TOTALS PROGRAMMATICALLY + APPLY DISCOUNT ────────
            let subtotal = 0;        // Before discount
            let totalCost = 0;
            let totalWeight = 0;
            let discountApplied = 0;
            let discountReason = "";

            App.state.order.forEach(o => {
                const cost = Calculator.cost(o.item);
                const basePrice = App.state.customPrices?.[o.item]?.[o.tier] || cost * (o.tier === "bulk" ? 1.10 : 1.25);
                const sellPrice = o.customPrice !== undefined ? o.customPrice : basePrice;

                totalCost += cost * o.qty;
                subtotal += sellPrice * o.qty;

                // Weight (with crop finalWeight override)
                let itemWeight = Calculator.weight(o.item);
                if (App.state.seeds) {
                    const seedData = Object.values(App.state.seeds).find(s => s.finalProduct === o.item);
                    if (seedData?.finalWeight) {
                        itemWeight = seedData.finalWeight;
                    }
                }
                totalWeight += o.qty * itemWeight;
            });

            totalWeight = Number(totalWeight.toFixed(3));

            // === APPLY DISCOUNT (only for customer sales) ===
            if (isCustomerSale) {
                const discountInput = document.getElementById("discountAmount");
                const reasonInput = document.getElementById("discountReason");

                discountApplied = parseFloat(discountInput?.value || "0") || 0;
                discountReason = reasonInput?.value?.trim() || "";

                // Don't allow discount larger than subtotal
                if (discountApplied > subtotal) {
                    discountApplied = subtotal;
                }
            }

            const totalSale = Math.max(0, subtotal - discountApplied);
            const profit = totalSale - totalCost;  // Profit after discount

            // ──────── 4. GENERATE RECORD ────────
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const orderId = (isShopRestock ? "RESTOCK-SHOP-" : isWarehouseRestock ? "RESTOCK-WH-" : "SALE-") + now.getTime().toString().slice(-6);

            const orderRecord = {
                id: orderId,
                date: dateStr,
                timestamp: now.toISOString(),
                type: isShopRestock ? "restock_shop" : isWarehouseRestock ? "restock_warehouse" : "sale",
                employee: employeeName,
                customer: customerName,
                items: App.state.order.map(o => ({ ...o })),
                itemSummary: App.state.order.map(o => `${o.qty}×${o.item}`).join(", "),
                subtotal: isCustomerSale ? Number(subtotal.toFixed(2)) : 0,           // New
                discountApplied: isCustomerSale ? Number(discountApplied.toFixed(2)) : 0, // New
                discountReason: isCustomerSale ? discountReason : "",                 // New
                totalSale: isCustomerSale ? Number(totalSale.toFixed(2)) : 0,
                profit: isCustomerSale ? Number(profit.toFixed(2)) : 0,
                totalWeight: totalWeight,
                commissionRate: commissionRate,
                commissionAmount: isCustomerSale ? Number((profit * (commissionRate / 100)).toFixed(2)) : 0,
                commissionPaid: false
            };

            // ──────── 5. SAVE TO LEDGER & COMPLETED ORDERS ────────
            App.state.ledger.push(orderRecord);
            await App.save("ledger");

            if (isCustomerSale) {
                App.state.completedOrders = App.state.completedOrders || [];
                App.state.completedOrders.push(orderRecord);
                await App.save("completedOrders");
            }

            // ──────── 6. CONSUME MATERIALS + ADD TO CORRECT STOCK ────────
            subtitle.textContent = "Consuming materials and updating stock...";

            // INSIDE complete() — REPLACE YOUR consumeAndCraft WITH THIS
            const consumeAndCraft = (item, qty, path = []) => {
                const key = path.concat(item).join("→");
                const cropKey = `crop→${key}`;
                const choice = Calculator.liveToggle[cropKey] ?? Calculator.liveToggle[key] ?? "craft";
                const stock = App.state.warehouseStock[item] || 0;
                const recipe = App.state.recipes[item];

                // === 1. CROP: "Grow" = Estimate only, NO CONSUMPTION ===
                const isCrop = App.state.seeds && Object.values(App.state.seeds).some(s => s.finalProduct === item);
                if (isCrop && choice === "grow") {
                    // Do NOTHING — materials consumed manually in Harvest tab
                    return;
                }

                // === 2. CROP: "Use Warehouse" ===
                if (isCrop && choice === "warehouse" && stock >= qty) {
                    App.state.warehouseStock[item] = Math.max(0, stock - qty);
                    return;
                }

                // === 3. NORMAL CRAFTING LOGIC (unchanged) ===
                if (choice === "warehouse" && stock >= qty) {
                    App.state.warehouseStock[item] = Math.max(0, stock - qty);
                    return;
                }

                if (!recipe?.i || Object.keys(recipe.i).length === 0) {
                    App.state.warehouseStock[item] = Math.max(0, (App.state.warehouseStock[item] || 0) - qty);
                    return;
                }

                const batches = Math.ceil(qty / (recipe.y || 1));
                for (const [ing, q] of Object.entries(recipe.i)) {
                    consumeAndCraft(ing, q * batches, path.concat(item));
                }

                // Add crafted item for restock orders
                if (path.length === 0 && (isShopRestock || isWarehouseRestock)) {
                    if (isShopRestock) {
                        App.state.shopStock[item] = (App.state.shopStock[item] || 0) + qty;
                    } else {
                        App.state.warehouseStock[item] = (App.state.warehouseStock[item] || 0) + qty;
                    }
                }
            };


            App.state.order.forEach(o => consumeAndCraft(o.item, o.qty));

            // Save stock
            await Promise.all([
                App.save("warehouseStock"),
                isShopRestock ? App.save("shopStock") : Promise.resolve()
            ]);

            // Clean up pending
            if (App.state.lastLoadedPendingId) {
                App.state.pendingOrders = (App.state.pendingOrders || []).filter(o => o.id !== App.state.lastLoadedPendingId);
                await App.save("pendingOrders");
                delete App.state.lastLoadedPendingId;
                await App.save("lastLoadedPendingId");
            }

            // SUCCESS
            overlay.style.display = "none";

            const action = isWarehouseRestock ? "Warehouse Restock" :
                isShopRestock ? "Shop Restock" : "Customer Sale";

            showToast("success", `
            <div style="text-align:center;">
                <div style="font-size:20px;margin-bottom:4px;">${action} Completed!</div>
                <div style="font-size:14px;opacity:0.9;">${orderRecord.itemSummary}</div>
                <div style="font-size:14px;margin-top:4px;">
                    Weight: <strong>${totalWeight}kg</strong> • Employee: <strong>${employeeName}</strong>
                </div>
            </div>
        `, 4500);

            // Reset
            window.orderJustCompleted = true;
            App.state.order = [];
            App.state.currentCustomer = "";
            App.state.currentEmployee = "";
            document.getElementById("customerName")?.value && (document.getElementById("customerName").value = "");
            document.getElementById("employeeSelect")?.value && (document.getElementById("employeeSelect").value = "");
            document.getElementById("newQty")?.value && (document.getElementById("newQty").value = "1");
            document.getElementById("itemSearch")?.value && (document.getElementById("itemSearch").value = "");

            const banner = document.getElementById("loadedPendingBanner");
            if (banner) banner.style.display = "none";

            this.mode = "customer";
            Order.setMode("customer");
            window.orderJustCompleted = false;

            Order.renderCurrentOrder();
            debouncedCalcRun();

            updateProfitDisplay();
            Inventory.render();
            Ledger.render();
            Order.renderPending();
            document.getElementById("orderPageSummary").innerHTML = "";
        } catch (err) {
            overlay.style.display = "none";
            console.error("Order failed:", err);
            showToast("fail", err.message || "Order failed — check console");
        }
    },



    render() {
        const from = document.getElementById("filterFrom")?.value || "";
        const to = document.getElementById("filterTo")?.value || "";
        const selectedEmp = document.getElementById("filterEmployee")?.value || "";
        const commissionFilter = document.getElementById("filterCommissionStatus")?.value || "all";

        // === FILTER & RENDER LOGIC (same as before) ===
        let orders = [...App.state.completedOrders]
            .filter(o => !from || o.date >= from)
            .filter(o => !to || o.date <= to)
            .filter(o => !selectedEmp || o.employee === selectedEmp)
            .filter(o => {
                if (commissionFilter === "paid") return o.commissionPaid === true;
                if (commissionFilter === "unpaid") return o.commissionPaid !== true;
                return true;
            })
            .sort((a, b) => (b.timestamp || b.date + b.id).localeCompare(a.timestamp || a.date + b.id));

        let totalGross = 0, totalComm = 0, totalNet = 0, totalWeight = 0;

        const rows = orders.map(o => {
            const gross = o.profit || 0;
            const rate = o.commissionRate || 0;
            const comm = gross * (rate / 100);
            const net = gross - comm;
            const weight = o.totalWeight || 0;

            const isPaid = o.commissionPaid === true;
            const paidStatus = isPaid
                ? `<span style="color:#0f8;font-weight:bold;">Paid</span>`
                : `<span style="color:#f66;">Unpaid</span>`;

            totalGross += gross;
            totalComm += comm;
            totalNet += net;
            totalWeight += weight;

            /* const displayWeight = weight > 0 ? weight.toFixed(1) + "kg" :
                (o.items || []).reduce((s, i) => s + (i.qty || 1) * (Calculator.weight(i.item) || 0), 0).toFixed(1);
            const weightText = displayWeight > 0 ? displayWeight + "kg" : "—"; */

            // FIXED WEIGHT DISPLAY — handles string from .toFixed()
            const savedWeight = parseFloat(o.totalWeight || 0);
            const weightText = savedWeight > 0 ? savedWeight.toFixed(1) + "kg" : "—";

            totalWeight += savedWeight;  // also fix the summary total
            return `<tr>
                        <td>${o.date}</td>
                        <td><code>${o.id}</code></td>
                        <td>${o.employee || "Walk-in"}</td>
                        <td>${o.customer || "—"}</td>
                        <td>${o.itemSummary}</td>
                        <td style="color:#0af;font-weight:bold;">${weightText}</td>
                        <td style="font-weight:bold;">
                            $${o.totalSale.toFixed(2)}
                            ${o.discountApplied > 0
                    ? `<br><small style="color:#fa5;font-weight:normal;">
                                    (Includes -$${o.discountApplied.toFixed(2)} discount ${o.discountReason ? `: ${o.discountReason}` : ""})
                                </small>`
                    : ""
                }
                        </td>
                        <td style="color:#0f8; font-weight:bold;">$${gross.toFixed(2)}</td>
                        <td style="color:#0cf;">${rate}% → $${comm.toFixed(2)}</td>
                        <td style="color:#0f8;font-weight:bold;">$${net.toFixed(2)}</td>
                        <td style="text-align:center;font-size:1.2em;">${paidStatus}</td>
                    </tr>`;
        }).join("") || `<tr><td colspan="11" style="text-align:center;padding:80px;color:#888">No completed orders match filters</td></tr>`;

        document.getElementById("completedOrdersBody").innerHTML = rows;
        document.getElementById("ordersSummary").innerHTML = `
                    <div style="background:#111;padding:12px 16px;border-radius:8px;color:#fff;font-weight:bold;">
                        ${orders.length} sale${orders.length === 1 ? "" : "s"}
                        → Gross <span style="color:#0f8">$${totalGross.toFixed(2)}</span>
                        | Comm <span style="color:#0cf">$${totalComm.toFixed(2)}</span>
                        | Net <span style="color:#0f8">$${totalNet.toFixed(2)}</span>
                        | Weight <span style="color:#0af">${totalWeight.toFixed(1)}kg</span>
                    </div>`;

        // === SHOW PAY COMMISSION BUTTON ONLY FOR MANAGERS ===
        let managerButton = "";

        const currentUserName = App.state.loggedInUser || window.playerName || "";
        const userRole = window.myRole;
        const selectedEmployee = document.getElementById("filterEmployee")?.value || "";

        if (currentUserName && userRole && userRole.toLowerCase().includes("manager") &&
            selectedEmployee !== "" &&
            selectedEmployee !== "All Employees") {
            managerButton = `
                        <button id="payCommissionBtn" onclick="Order.payVisibleCommissions()"
                            style="padding:10px 24px; background:#0c0; color:black; font-weight:bold; border-radius:6px; font-size:16px;">
                            Pay Commission <span id="commissionAmountPreview"></span>
                        </button>`;
        }

        // INJECT THE BUTTON INTO THE DOM ← THIS WAS THE MISSING PIECE
        const payContainer = document.getElementById("payCommissionContainer");
        if (payContainer) {
            payContainer.innerHTML = managerButton;
        }

        // Update live preview (amount in parentheses)
        this.updateCommissionPreview();

    },

    // RENDER COMPLETED ORDERS — NOW WITH WEIGHT
    getVisibleOrders() {
        const from = document.getElementById("filterFrom")?.value || "";
        const to = document.getElementById("filterTo")?.value || "";
        const selectedEmp = document.getElementById("filterEmployee")?.value || "";
        const commissionFilter = document.getElementById("filterCommissionStatus")?.value || "all";

        return [...App.state.completedOrders]
            .filter(o => !from || o.date >= from)
            .filter(o => !to || o.date <= to)
            .filter(o => !selectedEmp || o.employee === selectedEmp)
            .filter(o => {
                if (commissionFilter === "paid") return o.commissionPaid === true;
                if (commissionFilter === "unpaid") return o.commissionPaid !== true;
                return true;
            });

    },

    calculateUnpaidCommissionForVisible() {
        const orders = this.getVisibleOrders();
        let total = 0;
        for (const o of orders) {
            if (o.commissionPaid || !o.profit || !o.commissionRate) continue;
            total += o.profit * (o.commissionRate / 100);
        }
        return Number(total.toFixed(2));
    },

    updateCommissionPreview() {
        const amount = this.calculateUnpaidCommissionForVisible();
        const preview = document.getElementById("commissionAmountPreview");
        const btn = document.getElementById("payCommissionBtn");
        if (!preview || !btn) return;

        if (amount > 0) {
            preview.textContent = `($${amount.toFixed(2)})`;
            btn.disabled = false;
            btn.style.opacity = "1";
        } else {
            preview.textContent = "(nothing to pay)";
            btn.disabled = true;
            btn.style.opacity = "0.6";
        }
    },

    async payVisibleCommissions() {
        const selectedEmp = document.getElementById("filterEmployee")?.value?.trim();
        if (!selectedEmp || selectedEmp === "— Select Employee —") {
            showToast("fail", "Please select an employee first!");
            return;
        }

        const orders = this.getVisibleOrders();
        const unpaid = orders.filter(o => !o.commissionPaid && o.employee === selectedEmp);

        if (unpaid.length === 0) {
            showToast("info", "No unpaid commissions for this employee.");
            return;
        }

        const total = Number((unpaid.reduce((sum, o) => sum + o.profit * (o.commissionRate / 100), 0)).toFixed(2));

        const confirmed = await showConfirm(
            `Pay <strong>$${total.toFixed(2)}</strong> commission to <strong>${selectedEmp}</strong>?<br><br>` +
            `<small>${unpaid.length} sale${unpaid.length > 1 ? "s" : ""} will be marked as paid.</small>`
        );
        if (!confirmed) return;

        const now = new Date();
        const paymentId = "COMM-" + now.getTime().toString().slice(-8);

        App.state.ledger.push({
            id: paymentId,
            date: now.toISOString().slice(0, 10),
            timestamp: now.toISOString(),
            type: "commission_payment",
            employee: selectedEmp,
            amount: -total,
            description: `Commission payout to ${selectedEmp} (${unpaid.length} sale${unpaid.length > 1 ? "s" : ""})`,
            relatedOrders: unpaid.map(o => o.id)
        });
        await App.save("ledger");

        App.state.completedOrders = App.state.completedOrders.map(o => {
            if (unpaid.some(u => u.id === o.id)) {
                return {
                    ...o,
                    commissionPaid: true,
                    commissionPaidAt: now.toISOString()
                };
            }
            return o;
        });
        await App.save("completedOrders");

        this.render();
        Ledger.render();
        showToast("success", `Paid $${total.toFixed(2)} to ${selectedEmp}!`);
    },
    addLowWarehouseToOrder() {
        const low = [];
        Object.entries(App.state.minStock || {}).forEach(([item, minQty]) => {
            const current = App.state.warehouseStock[item] || 0;
            if (current < minQty) {
                low.push({ item, qty: Math.max(1, minQty - current) });
            }
        });

        if (low.length === 0) return showToast("success", `Warehouse is already at minimum stock levels!`);

        low.forEach(i => {
            const existing = App.state.order.find(o => o.item === i.item);
            if (existing) existing.qty += i.qty;
            else App.state.order.push({ item: i.item, qty: i.qty, tier: "shop" });
        });

        this.setMode('warehouse');
        debouncedSaveOrder();;
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();

        showToast("success", `Added ${low.length} items to Warehouse Restock order`);
    },

    //not used
    export() {
        const json = JSON.stringify(App.state.completedOrders, null, 2);
        navigator.clipboard.writeText(json).then(
            () => showToast("success", "Copied to clipboard!"),
            () => prompt("Copy manually:", json)
        );
    },
    // not used
    import() {
        const text = prompt("Paste completed orders JSON:");
        if (!text?.trim()) return;
        let data;
        try { data = JSON.parse(text); } catch { return showToast("fail", "Invalid JSON"); }
        if (!Array.isArray(data)) return showToast("fail", "Must be an array");

        const existing = new Set(App.state.completedOrders.map(o => o.id));
        const toAdd = data.filter(o => o.id && !existing.has(o.id));
        if (!toAdd.length) return showToast("fail", "No new orders");

        App.state.completedOrders.push(...toAdd);
        App.save("completedOrders");
        showToast("success", `Imported ${toAdd.length} order${toAdd.length === 1 ? "" : "s"}`);
        this.render();
    },

    calculateTotalWeight(items) {
        if (!items || !Array.isArray(items)) return 0;
        return items.reduce((total, line) => {
            const qty = line.qty || 1;
            let weightPerUnit = 0;

            // Check crafted first
            if (App.state.craftedItems?.[line.item]?.weight !== undefined) {
                weightPerUnit = App.state.craftedItems[line.item].weight;
            }
            // Then raw materials
            else if (App.state.rawMaterials?.[line.item]?.weight !== undefined) {
                weightPerUnit = App.state.rawMaterials[line.item].weight;
            }

            return total + (qty * weightPerUnit);
        }, 0).toFixed(2);
    },

    setMode(mode) {
        this.mode = mode;

        // Update buttons
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-customer')?.classList.toggle('active', mode === 'customer');
        document.getElementById('btn-shop')?.classList.toggle('active', mode === 'shop');
        document.getElementById('btn-warehouse')?.classList.toggle('active', mode === 'warehouse');

        // Update complete button text
        const texts = { customer: "Customer Sale", shop: "Shop Restock", warehouse: "Warehouse Restock" };
        document.getElementById('completeText').textContent = texts[mode];

        // Show/hide customer field
        document.getElementById('customerField').style.display = mode === 'customer' ? 'block' : 'none';

        // Auto-switch auto-fill button visibility
        document.querySelectorAll('button[onclick*="addLowWarehouse"]').forEach(b => {
            b.style.display = mode === 'warehouse' ? 'inline-block' : 'none';
        });

        // Re-render table to hide price/tier in restock modes
        this.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    // ──────────────────────────────────────────────────────────────
    // 3. UPGRADED: savePending() — NOW WORKS IN ALL MODES (Customer + Restock)
    // ──────────────────────────────────────────────────────────────
    async savePending() {
        if (App.state.order.length === 0) {
            return showToast("fail", "Order is empty! Add items first.");
        }

        // ─── EMPLOYEE CHECK ─────────────────────────────
        const employeeSelect = document.getElementById("employeeSelect");
        const employeeName = employeeSelect?.value?.trim();

        if (!employeeName || employeeName === "" || employeeName === "— Select Employee —") {
            employeeSelect?.focus();
            return showToast("fail", "Please select the employee");
        }

        // ─── CUSTOMER MODE CHECK (the real fix) ─────────────────────────────
        const currentMode = Order.mode || "customer"; // fallback safety

        if (currentMode === "customer") {
            const customerInput = document.getElementById("customerName");
            const customerName = customerInput?.value?.trim();

            if (!customerName) {
                customerInput?.focus();
                return showToast("fail", "Customer name is required for customer sales!");
            }
        }

        // ─── OPTIONAL NOTE ─────────────────────────────────────
        const note = prompt("Add a note (optional)", "")?.trim() || null;

        // ─── SMART ORDER NAME ──────────────────────────────────
        const isRestock = currentMode === "shop" || currentMode === "warehouse";
        const modeLabel = currentMode === "shop" ? "Shop Restock" :
            currentMode === "warehouse" ? "Warehouse Restock" : "";

        const customerName = currentMode === "customer"
            ? document.getElementById("customerName")?.value?.trim()
            : "INTERNAL";

        const itemsText = App.state.order.map(i => `${i.qty}×${i.item}`).join(", ");
        const defaultTitle = isRestock
            ? `${modeLabel} – ${itemsText}`
            : `${customerName} – ${itemsText}`;

        const finalTitle = prompt("Pending order name:", defaultTitle.slice(0, 120)) || defaultTitle.slice(0, 120);

        // ─── SAVE TO FIREBASE ──────────────────────────────────
        const pendingOrder = {
            id: "PEND-" + Date.now(),
            savedAt: new Date().toISOString(),
            name: finalTitle.trim(),
            customer: customerName,
            employee: employeeName,
            note: note,
            items: App.state.order.map(o => ({ ...o })),
            mode: currentMode
        };

        App.state.pendingOrders = App.state.pendingOrders || [];
        App.state.pendingOrders.unshift(pendingOrder);
        await App.save("pendingOrders");
        // clear pending orders flag
        delete App.state.lastLoadedPendingId;
        App.save("lastLoadedPendingId");

        showToast("success", `Pending order saved!\n"${pendingOrder.name}"\nby ${employeeName}`);
        Order.renderPending();
    },

    // ──────────────────────────────────────────────────────────────
    // 2. UPGRADED: loadPending() — NOW REMEMBERS WHICH ONE WAS LOADED
    // ──────────────────────────────────────────────────────────────
    async loadPending(id) {
        const order = (App.state.pendingOrders || []).find(o => o.id === id);
        if (!order) return showToast("fail", "Order not found!");

        // SOURCE OF TRUTH: logged-in user
        const currentUser = App.state.loggedInUser || window.playerName;
        if (!currentUser) {
            return showToast("fail", "User not logged in!");
        }

        if (!(await showConfirm(`Load pending order?<br><strong>${order.name}</strong><br><small>by ${order.employee}</small>`))) {
            return;
        }

        // MARK AS IN PROGRESS — USING REAL USER
        Order.markPendingAsInProgress(id, currentUser);

        // Load order
        App.state.order = order.items.map(i => ({ ...i }));
        App.state.currentCustomer = order.customer || "";
        App.state.currentEmployee = currentUser; // still set for commission later

        // Optional: pre-select user in dropdown for commission
        const select = document.getElementById("employeeSelect");
        if (select && select.querySelector(`option[value="${currentUser}"]`)) {
            select.value = currentUser;
        }

        App.state.lastLoadedPendingId = id;
        await App.save("lastLoadedPendingId");

        if (order.mode) Order.setMode(order.mode);

        debouncedSaveOrder();
        Order.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();

        Order.showLoadedPendingBanner(order, currentUser);
        activateTab("order");
    },

    async deletePending(id) {
        const ok = await showConfirm("Delete this pending order permanently?");
        if (!ok) return;

        console.log("Deleting pending order:", id);

        // 1. Remove from in-memory state
        App.state.pendingOrders = (App.state.pendingOrders || []).filter(o => o.id !== id);

        // 2. Clean up loaded flags
        let needSaveFlags = false;
        if (App.state.currentPendingId === id) {
            delete App.state.currentPendingId;
            needSaveFlags = true;
        }
        if (App.state.lastLoadedPendingId === id) {
            delete App.state.lastLoadedPendingId;
            needSaveFlags = true;
        }

        // 3. FORCE SAVE TO FIREBASE — THIS IS THE NUCLEAR FIX
        try {
            await App.save("pendingOrders");  // ← THIS ACTUALLY WRITES TO FIREBASE

            if (needSaveFlags) {
                await Promise.all([
                    App.save("currentPendingId"),
                    App.save("lastLoadedPendingId")
                ]);
            }

            console.log("Pending order deleted from Firebase:", id);
        } catch (err) {
            console.error("Failed to delete from Firebase:", err);
            showToast("fail", "Failed to delete from server — check internet");
            return;
        }

        // 4. Update UI
        Order.renderPending();
        Order.renderCurrentOrder?.();

        showToast("success", "Pending order permanently deleted from server");
    },

    clearPendingInProgress(id) {
        if (!App.state.pendingOrders) return;
        App.state.pendingOrders = App.state.pendingOrders.map(o => {
            if (o.id === id) {
                const { inProgress, inProgressBy, inProgressAt, ...rest } = o;
                return rest; // remove inProgress flags
            }
            return o;
        }).filter(Boolean); // remove undefined

        App.save("pendingOrders");
    },

    // PENDING ORDERS — NOW SHOWS WEIGHT
    renderPending() {
        const list = App.state.pendingOrders || [];
        const tbody = document.getElementById("pendingOrdersBody");
        const section = document.getElementById("pendingOrdersSection");
        if (!tbody || !section) return;

        if (list.length === 0) {
            section.style.display = "none";
            return;
        }

        section.style.display = "block";
        const sorted = [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt));

        tbody.innerHTML = sorted.map(o => {
            let total = 0, weight = 0;
            for (const item of o.items) {
                const cost = Calculator.cost(item.item);
                const basePrice = App.state.customPrices?.[item.item]?.[item.tier] || cost * (item.tier === "bulk" ? 1.10 : 1.25);
                const sellPrice = item.customPrice ?? basePrice;
                total += sellPrice * item.qty;
                weight += item.qty * Calculator.weight(item.item);
            }

            const itemsList = o.items.map(i => `${i.qty}× ${i.item}`).join("<br>");

            // THIS IS THE ONLY SOURCE OF TRUTH — NO DROPDOWNS
            const currentUserName = App.state.loggedInUser;
            const roles = App.state.roles || {};

            // Determine if current user is manager or the one who has the order checked out
            // Who can delete?
            let canDelete = false;

            // 1. Managers can always delete
            if (currentUserName && roles[currentUserName]) {
                if (roles[currentUserName].toLowerCase() === "manager") {
                    canDelete = true;
                }
            }

            // 2. The person who checked it out can delete it (even if not manager)
            if (o.inProgress && o.inProgressBy === currentUserName) {
                canDelete = true;
            }

            if (o.inProgress) {
                return `
                        <tr style="background:#332200; border-left:4px solid #fa5; opacity:0.95;">
                        <td style="padding:10px 12px; color:#888; font-size:0.9em;">
                            ${new Date(o.savedAt).toLocaleDateString()}<br>
                            <small>${new Date(o.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                        </td>
                        <td style="padding:12px;">
                            <strong style="font-size:1.1em; color:#ffa;">${o.name}</strong><br>
                            <small style="color:#ff8;">by ${o.employee}</small>
                            ${o.note ? `<br><small style="color:#fa5; font-style:italic;">${o.note}</small>` : ""}
                            <div style="margin-top:8px; padding:8px; background:#443300; border-radius:4px; font-size:0.9em; color:#ffa;">
                            <strong>Currently being processed by:</strong><br>
                            <strong style="color:#ff8; font-size:1.1em;">${o.inProgressBy}</strong><br>
                            <small>Started ${new Date(o.inProgressAt).toLocaleTimeString()}</small>
                            </div>
                        </td>
                        <td style="padding:12px; color:#0cf;">${o.customer}</td>
                        <td style="padding:12px;">
                            <small style="color:#aaa; line-height:1.5;">${itemsList}</small>
                        </td>
                        <td style="padding:12px; color:#0af; font-weight:bold;">
                            ${weight > 0 ? weight.toFixed(1) + "kg" : "—"}
                        </td>
                        <td style="padding:12px; text-align:right; font-weight:bold; color:#0f8;">
                            $${total.toFixed(2)}
                        </td>
                        <td style="padding:12px; text-align:center;">
                            <small style="color:#ffa; font-weight:bold;">In Progress</small><br>
                            ${canDelete ? `
                            <button onclick="Order.deletePending('${o.id}')" 
                                    style="background:#c33; color:white; padding:6px 12px; font-size:0.9em; margin-top:6px; border:none; border-radius:4px; font-weight:bold;">
                            Delete (Manager)
                            </button>
                            ` : `<small style="color:#666; font-style:italic;">Manager only</small>`}
                        </td>
                        </tr>
                        `;
            }

            // Normal pending orders — everyone can delete
            return `
                    <tr style="border-bottom:1px solid #333;">
                    <td style="padding:10px 12px; color:#888; font-size:0.9em;">
                        ${new Date(o.savedAt).toLocaleDateString()}<br>
                        <small>${new Date(o.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </td>
                    <td style="padding:12px;">
                        <strong style="font-size:1.1em;">${o.name}</strong><br>
                        <small style="color:#0cf;">by ${o.employee}</small>
                        ${o.note ? `<br><small style="color:#fa5; font-style:italic;">${o.note}</small>` : ""}
                    </td>
                    <td style="padding:12px; color:#0cf;">${o.customer}</td>
                    <td style="padding:12px;">
                        <small style="color:#aaa; line-height:1.5;">${itemsList}</small>
                    </td>
                    <td style="padding:12px; color:#0af; font-weight:bold;">
                        ${weight > 0 ? weight.toFixed(1) + "kg" : "—"}
                    </td>
                    <td style="padding:12px; text-align:right; font-weight:bold; color:#0f8;">
                        $${total.toFixed(2)}
                    </td>
                    <td style="padding:12px; text-align:center;">
                        <button onclick="Order.loadPending('${o.id}')" 
                                style="background:#0f8; color:black; font-weight:bold; padding:8px 16px; border:none; border-radius:6px;">
                        Load
                        </button>
                        <br>
                        <button onclick="Order.deletePending('${o.id}')" 
                                style="background:#c33; color:white; padding:6px 12px; border:none; border-radius:4px; margin-top:4px;">
                        Delete
                        </button>
                    </td>
                    </tr>
                    `;
        }).join("");
    },

    autoRestoreCheckedOutOrder() {
        const currentUser = App.state.loggedInUser || window.playerName;
        if (!currentUser) return;

        const pendingOrders = App.state.pendingOrders || [];
        if (!Array.isArray(pendingOrders)) return;

        const activeOrder = pendingOrders.find(order =>
            order.inProgress === true && order.inProgressBy === currentUser
        );

        if (!activeOrder) return;

        console.log(`Auto-restoring checked-out order: ${activeOrder.name} (checked out by ${activeOrder.inProgressBy})`);

        // === RESTORE ORDER DATA ===
        App.state.order = activeOrder.items?.map(i => ({ ...i })) || [];
        App.state.currentCustomer = activeOrder.customer || "";

        // Restore customer field
        const customerInput = document.getElementById("customerName");
        if (customerInput) customerInput.value = activeOrder.customer || "";

        // Force correct employee in dropdown
        const realEmployeeName = activeOrder.inProgressBy;
        const employeeSelect = document.getElementById("employeeSelect");
        if (employeeSelect) employeeSelect.value = realEmployeeName;

        App.state.currentEmployee = realEmployeeName;

        // Restore mode
        if (activeOrder.mode) Order.setMode(activeOrder.mode);

        // Remember this is loaded
        App.state.lastLoadedPendingId = activeOrder.id;
        App.save("lastLoadedPendingId");

        // === SHOW BANNER — USING OUR FIXED FUNCTION (NO DUPLICATES!) ===
        Order.showLoadedPendingBanner(activeOrder, realEmployeeName);

        // Final render
        Order.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
    },

    // Show banner when a pending order is loaded
    showLoadedPendingBanner(order, currentEditorName = order.inProgressBy || order.employee) {
        const banner = document.getElementById("loadedPendingBanner");
        if (!banner) return;

        banner.style.display = "block";

        // Clear any previously added dynamic status lines
        banner.querySelectorAll(".current-editor-status").forEach(el => el.remove());

        document.getElementById("pendingName").textContent = order.name;
        document.getElementById("pendingEmployee").textContent = order.employee;
        document.getElementById("pendingSavedAt").textContent = new Date(order.savedAt).toLocaleString();

        const noteEl = document.getElementById("pendingNote");
        if (order.note?.trim()) {
            noteEl.textContent = "Note: " + order.note.trim();
            noteEl.style.display = "block";
        } else {
            noteEl.style.display = "none";
        }

        // Add current editor status — safely, only once
        const statusDiv = document.createElement("div");
        statusDiv.className = "current-editor-status";
        statusDiv.innerHTML = `<strong style="color:#ff8;">Currently being processed by: ${currentEditorName}</strong>`;
        statusDiv.style.cssText = "margin-top:8px; font-size:1.1em;";

        const content = banner.querySelector(".banner-content") || banner;
        content.appendChild(statusDiv);

        // Cancel button
        document.getElementById("pendingActions").innerHTML = `
                    <button onclick="Order.clearLoadedPending()" 
                            style="background:#c33;padding:6px 12px;border:none;border-radius:4px;color:white;">
                        Cancel & Return to Pending
                    </button>
                `;
    },

    // Clear the banner (and optional: remove the tracking ID)
    async clearLoadedPending() {
        if (!App.state.lastLoadedPendingId) return;

        const id = App.state.lastLoadedPendingId;

        // Ask confirmation
        if (!(await showConfirm("Return this order to the pending list?<br><small>It will no longer show as in progress</small>"))) {
            return;
        }

        // Remove in-progress flag
        App.state.pendingOrders = App.state.pendingOrders.map(o => {
            if (o.id === id) {
                const { inProgress, inProgressBy, inProgressAt, ...clean } = o;
                return clean;
            }
            return o;
        });

        await App.save("pendingOrders");

        // Now clear current order
        const banner = document.getElementById("loadedPendingBanner");
        if (banner) banner.style.display = "none";

        delete App.state.lastLoadedPendingId;
        App.save("lastLoadedPendingId");

        App.state.order = [];
        App.state.currentCustomer = "";
        App.state.currentEmployee = "";
        document.getElementById("employeeSelect").value = "";
        document.getElementById("customerName").value = "";

        debouncedSaveOrder();
        Order.renderCurrentOrder();
        debouncedCalcRun();
        updateProfitDisplay();
        Order.renderPending();

        showToast("success", "Order returned to pending list");
    },
    // Add this new function to Order object
    markPendingAsInProgress(id, employeeName) {
        if (!App.state.pendingOrders) return;

        App.state.pendingOrders = App.state.pendingOrders.map(order => {
            if (order.id === id) {
                return {
                    ...order,
                    inProgress: true,
                    inProgressBy: employeeName,
                    inProgressAt: new Date().toISOString()
                };
            }
            return order;
        });

        App.save("pendingOrders");  // this updates everyone else's view instantly
    }
};


function updateProfitDisplay() {
    const items = App.state.order || [];
    let totalCost = 0;
    let subtotal = 0;  // Sale amount BEFORE discount

    if (items.length > 0) {
        items.forEach(function (o) {
            const cost = Calculator.cost(o.item);
            const price = o.customPrice !== undefined ? o.customPrice :
                (App.state.customPrices && App.state.customPrices[o.item] && App.state.customPrices[o.item][o.tier]) ||
                cost * (o.tier === "bulk" ? 1.10 : 1.25);

            totalCost += cost * o.qty;
            subtotal += price * o.qty;
        });
    }

    const profit = subtotal - totalCost;
    const profitPercent = subtotal > 0 ? (profit / subtotal) * 100 : 0;

    // === APPLY DISCOUNT FOR DISPLAY ONLY ===
    let discountApplied = 0;
    const discountInput = document.getElementById("discountAmount");
    if (discountInput && discountInput.value) {
        discountApplied = parseFloat(discountInput.value) || 0;
        // Don't allow discount larger than subtotal
        if (discountApplied > subtotal) {
            discountApplied = subtotal;
        }
    }

    const finalTotal = Math.max(0, subtotal - discountApplied);

    // === UPDATE DOM ELEMENTS ===
    const costEl = document.getElementById("costToProduce");
    if (costEl) costEl.textContent = "$" + totalCost.toFixed(2);

    const profitEl = document.getElementById("profitAmount");
    if (profitEl) {
        profitEl.textContent = "$" + profit.toFixed(2);
        profitEl.style.color = profit >= 0 ? "#0f8" : "#f66";
        profitEl.className = profit >= 0 ? "profit-positive" : "profit-negative";
    }

    const percentEl = document.getElementById("profitPercent");
    if (percentEl) percentEl.textContent = profitPercent.toFixed(1) + "%";

    const totalEl = document.getElementById("grandTotal");
    if (totalEl) {
        totalEl.textContent = "$" + finalTotal.toFixed(2);
        // Change color when discount is applied
        if (discountApplied > 0) {
            totalEl.style.color = "#fa5";  // Orange/yellow to highlight discount
            totalEl.style.fontWeight = "bold";
        } else {
            totalEl.style.color = "#0f8";  // Normal green
            totalEl.style.fontWeight = "bold";
        }
    }

    // Optional: Show discount amount live somewhere (e.g. next to grand total)
    const discountDisplay = document.getElementById("liveDiscountDisplay");
    if (discountDisplay) {
        if (discountApplied > 0) {
            discountDisplay.textContent = `−$${discountApplied.toFixed(2)}`;
            discountDisplay.style.display = "inline";
        } else {
            discountDisplay.style.display = "none";
        }
    }
}

// Populate employee dropdown + restore saved values
function initOrderPage() {

    const custInput = document.getElementById("customerName");
    if (custInput) {
        custInput.value = App.state.currentCustomer || "";
        custInput.addEventListener("input", async () => {
            App.state.currentCustomer = custInput.value;
            await ls.set("currentCustomer");
        });
    }

    // Restore mode and render
    if (Order.mode) Order.setMode(Order.mode);
    if (!window.orderJustCompleted) {
        Order.renderCurrentOrder();
    }
    debouncedCalcRun();
    updateProfitDisplay();
}

// ========================
// Show / Hide Profit on customer Invioce
// ========================

let showProfit = true;
document.getElementById("toggleProfit").addEventListener("click", () => {
    showProfit = !showProfit;
    updateProfitView();
});

function updateProfitView() {
    const toggleBtn = document.getElementById('toggleProfit');
    if (!toggleBtn) return;

    const showProfit = toggleBtn.textContent.includes('Hide');

    // Update button text
    toggleBtn.textContent = showProfit
        ? 'Show Profit (Staff View)'
        : 'Hide Profit (Customer View)';

    // Toggle unit cost column in invoice table
    document.querySelectorAll('.profit-only').forEach(el => {
        el.style.display = showProfit ? '' : 'none';
    });

    // Toggle staff-only cost/subtotal section
    const staffCostSummary = document.getElementById('staffCostSummary');
    if (staffCostSummary) {
        staffCostSummary.style.display = showProfit ? 'flex' : 'none';
    }

    // Toggle profit row
    const profitRow = document.getElementById('orderProfitRow');
    if (profitRow) {
        profitRow.style.display = showProfit ? 'block' : 'none';
    }

    // Update profit color (always green in your old style)
    const profitAmountEl = document.getElementById('orderProfitAmount');
    if (profitAmountEl) {
        profitAmountEl.style.color = '#0f8';
        // Color the "PROFIT:" label
        const labelSpan = profitAmountEl.closest('span');
        if (labelSpan) labelSpan.style.color = '#0f8';
    }
}

document.getElementById("filterFrom")?.addEventListener("change", () => Order.render());
document.getElementById("filterTo")?.addEventListener("change", () => Order.render());
document.getElementById("filterEmployee")?.addEventListener("change", () => Order.render());

window.CompletedOrders = Order;