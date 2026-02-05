// ========================
// Ledger — NOW WITH LIVE FILTERS!
// ========================
const Ledger = {

    // Clear all filter
    clearFilters() {
        document.getElementById("ledgerFrom").value = "";
        document.getElementById("ledgerTo").value = "";
        document.getElementById("ledgerEmployee").value = "";
        document.getElementById("ledgerSearch").value = "";
        this.render();
    },

    // Auto-populate employee dropdown
    populateEmployeeFilter() {
        const select = document.getElementById("ledgerEmployee");
        if (!select) return;

        const employees = new Set();
        App.state.ledger.forEach(e => {
            if (e.employee) employees.add(e.employee);
        });

        select.innerHTML = `<option value="">All Employees</option>`;
        [...employees].sort().forEach(emp => {
            const opt = document.createElement("option");
            opt.value = emp;
            opt.textContent = emp;
            select.appendChild(opt);
        });
    },
    render() {
        const tbody = document.getElementById("ledgerBody");
        const balanceEl = document.getElementById("currentBalance");
        if (!tbody) return;

        // === FILTERS ===
        const from = document.getElementById("ledgerFrom")?.value || "";
        const to = document.getElementById("ledgerTo")?.value || "";
        const employee = document.getElementById("ledgerEmployee")?.value || "";
        const search = document.getElementById("ledgerSearch")?.value?.toLowerCase().trim() || "";

        let entries = [...App.state.ledger];

        // Apply filters
        if (from || to) {
            entries = entries.filter(e => {
                const d = e.date || "";
                return (!from || d >= from) && (!to || d <= to);
            });
        }
        if (employee) {
            entries = entries.filter(e => (e.employee || "").toLowerCase() === employee.toLowerCase());
        }
        if (search) {
            entries = entries.filter(e =>
                (e.description || "").toLowerCase().includes(search) ||
                (e.itemSummary || "").toLowerCase().includes(search) ||
                (e.customer || "").toLowerCase().includes(search) ||
                (e.id || "").toLowerCase().includes(search)
            );
        }

        // Sort newest first
        entries.sort((a, b) => {
            const timeA = b.timestamp || b.date + (b.id || "");
            const timeB = a.timestamp || a.date + (a.id || "");
            return timeA.localeCompare(timeB);
        });

        // Calculate running balance from newest to oldest
        let runningBalance = 0;
        let totalIncome = 0;
        let totalExpense = 0;

        // First pass: calculate current balance (from all ledger, not just filtered)
        App.state.ledger.forEach(e => {
            let amount = 0;
            switch (e.type) {
                case "sale":
                    amount = e.totalSale || 0;
                    totalIncome += amount;
                    break;
                case "restock_shop":
                case "restock_warehouse":
                    amount = 0;
                    break;
                case "raw_purchase":
                case "purchase":
                    amount = -(e.totalCost || Math.abs(e.amount) || 0);
                    totalExpense += Math.abs(amount);
                    break;
                case "commission_payment":
                    amount = -(Math.abs(e.amount) || 0);
                    totalExpense += Math.abs(amount);
                    break;
                case "money_added":
                    amount = Math.abs(e.amount) || 0;
                    totalIncome += amount;
                    break;
                case "money_removed":
                    amount = -(Math.abs(e.amount) || 0);
                    totalExpense += Math.abs(amount);
                    break;
                default:
                    amount = Number(e.amount) || 0;
                    if (amount > 0) totalIncome += amount;
                    else totalExpense += Math.abs(amount);
                    break;
            }
            runningBalance += amount;
        });

        // Second pass: calculate balance at each point in time (from newest to oldest)
        const balanceAtTime = {};
        let tempBalance = runningBalance;

        entries.forEach(e => {
            let amount = 0;
            switch (e.type) {
                case "sale":
                    amount = e.totalSale || 0;
                    break;
                case "restock_shop":
                case "restock_warehouse":
                    amount = 0;
                    break;
                case "raw_purchase":
                case "purchase":
                    amount = -(e.totalCost || Math.abs(e.amount) || 0);
                    break;
                case "commission_payment":
                    amount = -(Math.abs(e.amount) || 0);
                    break;
                case "money_added":
                    amount = Math.abs(e.amount) || 0;
                    break;
                case "money_removed":
                    amount = -(Math.abs(e.amount) || 0);
                    break;
                default:
                    amount = Number(e.amount) || 0;
                    break;
            }

            balanceAtTime[e.id] = tempBalance;
            tempBalance -= amount; // go backwards in time
        });

        // Check if current user is manager
        const isMgr = (() => {
            const user = window.playerName || App.state.loggedInUser || "";
            const role = App.state.roles?.[user];
            return role && role.toLowerCase().includes("manager");
        })();

        tbody.innerHTML = entries.length ? "" : `<tr><td colspan="${isMgr ? "7" : "6"}" style="text-align:center;padding:80px;color:#888;">No transactions match filters</td></tr>`;

        entries.forEach(e => {
            let amount = 0;
            switch (e.type) {
                case "sale":
                    amount = e.totalSale || 0;
                    break;
                case "restock_shop":
                case "restock_warehouse":
                    amount = 0;
                    break;
                case "raw_purchase":
                case "purchase":
                    amount = -(e.totalCost || Math.abs(e.amount) || 0);
                    break;
                case "commission_payment":
                    amount = -(Math.abs(e.amount) || 0);
                    break;
                case "money_added":
                    amount = Math.abs(e.amount) || 0;
                    break;
                case "money_removed":
                    amount = -(Math.abs(e.amount) || 0);
                    break;
                default:
                    amount = Number(e.amount) || 0;
                    break;
            }
            // Now build description (keep your existing desc logic)
            let desc = e.description || e.type || "—";
            let customerInfo = "";

            if (e.type === "sale") {
                amount = e.totalSale || 0;
                customerInfo = e.customer && e.customer !== "Walk-in" ? ` → ${e.customer}` : "";

                let saleDesc = "Customer Sale" + customerInfo;

                // Add discount info if there was one
                if (e.discountApplied > 0) {
                    const discountText = e.discountReason
                        ? ` (Discount: $${e.discountApplied.toFixed(2)} - ${e.discountReason})`
                        : ` (Discount: $${e.discountApplied.toFixed(2)})`;
                    saleDesc += `<br><small style="color:#fa5; font-weight:bold;">${discountText}</small>`;
                }

                desc = saleDesc;

            } else if (e.type === "restock_shop" || e.type === "restock_warehouse") {
                amount = 0;
                desc = `Restock (${e.type === "restock_shop" ? "Shop" : "Warehouse"})`;
            } else if (e.type === "raw_purchase" || e.type === "purchase") {
                amount = -(e.totalCost || Math.abs(e.amount) || 0);
                desc = `${e.description}`;
                //  Bought ${ e.qty || "?" }× ${ e.item || "items" }
            } else if (e.type === "commission_payment") {
                amount = -(Math.abs(e.amount) || 0);
                desc = e.description || "Commission Payment";
            } else if (e.type === "money_added") {
                amount = Math.abs(e.amount) || 0;
                desc = e.description || "Cash In";
            } else if (e.type === "money_removed") {
                amount = -(Math.abs(e.amount) || 0);
                desc = e.description || "Cash Out";
            } else if (e.type === "harvest_cost") {
                typeHtml = `<span style="color:#ff6b35; font-weight:bold;">Harvest Cost</span>`;
                /* row.style.background = "rgba(255, 107, 53, 0.08)"; */
            } else {
                amount = Number(e.amount) || 0;
                desc = e.description || e.type || "Transaction";
            }

            let amountCell = "";

            if (e.type === "sale" && e.subtotal > e.totalSale) {
                // Discounted sale: original struck through in red, discounted in green
                amountCell = `
                    <div style="text-align:right; line-height:1.4;">
                        <div style="color:var(--red); text-decoration:line-through; opacity:0.9;">
                            $${e.subtotal.toFixed(2)}
                        </div>
                        <div style="font-weight:bold; color:var(--green); font-size:1.1em;">
                            $${e.totalSale.toFixed(2)}
                        </div>
                    </div>
                `;
            } else {
                // Normal amounts: green for positive, red for negative, orange for zero
                let color, prefix = "";

                if (amount > 0) {
                    color = "var(--green)";
                    prefix = "+";
                } else if (amount < 0) {
                    color = "var(--red)";
                    prefix = "-";
                } else { // amount === 0
                    color = "var(--orange)"; // or #ff9500 if variable not defined
                    prefix = "";
                }

                amountCell = `
                    <span style="font-weight:bold; color:${color};">
                        ${prefix}$${Math.abs(amount).toFixed(2)}
                    </span>
                `;
            }

            const weight = e.totalWeight || 0;
            const weightText = weight > 0 ? `<br><small style="color:#0af;font-weight:bold;">${weight.toFixed(1)}kg</small>` : "";

            const deleteBtn = isMgr ? `
                <button class="danger small" style="padding:4px 8px;margin-left:8px;"
                        onclick="Ledger.deleteTransaction('${e.id}')"
                        title="Delete transaction (Manager only)">
                    ×
                </button>` : "";

            const row = document.createElement("tr");
            row.innerHTML = `
                <td style="white-space:nowrap;">${e.date || "—"}</td>
                <td><code style="background:#333;padding:2px 6px;border-radius:4px;">${e.id}</code></td>
                <td>${e.employee || "—"}</td>
                <td>
                    <div><strong>${desc}</strong>${deleteBtn}</div>
                    <small style="color:#888;">
                        ${e.itemSummary || ""}
                        ${customerInfo}
                    </small>
                    ${weightText}
                </td>
                <td style="text-align:right;">
                    ${amountCell}
                </td>
                <td style="text-align:right;font-weight:bold;color:${balanceAtTime[e.id] >= 0 ? 'var(--green)' : 'var(--red)'};font-size:18px;">
                    $${balanceAtTime[e.id].toFixed(2)}
                </td>
            `;
            tbody.appendChild(row);
        });

        // Update current balance
        if (balanceEl) {
            balanceEl.textContent = "$" + runningBalance.toFixed(2);
            balanceEl.style.color = runningBalance >= 0 ? "var(--green)" : "var(--red)";
        }

        // Weight summary
        const summary = document.getElementById("ledgerWeightSummary");
        if (summary) {
            const netWeight = (entries.reduce((sum, e) => sum + (e.totalWeight || 0), 0)).toFixed(1);
            summary.innerHTML = `
                <div style="text-align:center;margin-top:15px;font-size:15px;">
                    <strong style="color:#0ff;">NET WEIGHT FLOW: ${netWeight}kg</strong>
                </div>`;
        }
    },


    // ADD THIS METHOD TO Ledger OBJECT
    async deleteTransaction(id, index) {
        if (!await showConfirm("Permanently delete this transaction?\nThis cannot be undone.")) return;

        // Remove from state
        App.state.ledger = App.state.ledger.filter(e => e.id !== id);

        // Save to Firebase
        await App.save("ledger");

        // Re-render
        Ledger.render();

        showToast("success", "Transaction deleted");
    }
};

// Ledger onload functions
document.addEventListener("DOMContentLoaded", () => {

    Ledger.populateEmployeeFilter();
    Ledger.render();
    LedgerManual.init(); // This hides forms and sets up buttons
});

// Refresh when clicking Ledger tab
document.querySelectorAll('[onclick*="ledger"]').forEach(el => {
    el.addEventListener("click", () => setTimeout(Ledger.render, 100));
});


// ================================================
// MANUAL LEDGER TRANSACTIONS (Add/Remove money)
// ================================================
const LedgerManual = {
    // Helper to generate nice IDs
    generateId(prefix = "MANUAL") {
        const now = new Date();
        return `${prefix}-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    },

    // Fill employee dropdowns
    populateEmployeeSelects() {
        const employees = Object.keys(App.state.employees || {}).sort();
        const addSel = document.getElementById("addEmployee");
        const removeSel = document.getElementById("removeEmployee");
        [addSel, removeSel].forEach(sel => {
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = '<option value="">Select Employee (optional)</option>';
            employees.forEach(name => {
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
            if (employees.includes(current)) sel.value = current;
        });
    },

    // ADD MONEY
    add() {
        const amount = parseFloat(document.getElementById("addAmount").value) || 0;
        if (amount <= 0) return showToast("fail", "Enter a positive amount");

        const employee = document.getElementById("addEmployee").value.trim() || "Owner/Cash";
        const desc = document.getElementById("addDesc").value.trim() || "Money added";

        const record = {
            id: this.generateId("DEPOSIT"),
            date: new Date().toISOString().slice(0, 10),
            timestamp: new Date().toISOString(),
            type: "money_added",
            employee: employee,
            description: desc,
            amount: amount
        };

        App.state.ledger.push(record);
        App.save("ledger");
        Ledger.render();
        showToast("success", `$${amount.toFixed(2)} added to ledger`);
        this.hideForms();
    },

    // REMOVE MONEY
    remove() {
        const amount = parseFloat(document.getElementById("removeAmount").value) || 0;
        if (amount <= 0) return showToast("fail", "Enter a positive amount");

        const employee = document.getElementById("removeEmployee").value.trim() || "Owner/Cash";
        const desc = document.getElementById("removeDesc").value.trim() || "Money removed";

        const record = {
            id: this.generateId("WITHDRAW"),
            date: new Date().toISOString().slice(0, 10),
            timestamp: new Date().toISOString(),
            type: "money_removed",
            employee: employee,
            description: desc,
            amount: -amount
        };

        App.state.ledger.push(record);
        App.save("ledger");
        Ledger.render();
        showToast("success", `$${amount.toFixed(2)} removed from ledger`);
        this.hideForms();
    },

    // CLEAR FORM INPUTS
    clearForms() {
        document.getElementById("addAmount").value = "";
        document.getElementById("addDesc").value = "";
        document.getElementById("removeAmount").value = "";
        document.getElementById("removeDesc").value = "";
    },

    // SHOW/HIDE FORMS
    showAddForm() {
        document.getElementById("addMoneyForm").style.display = "block";
        document.getElementById("removeMoneyForm").style.display = "none";
        document.getElementById("showAddMoneyBtn").style.display = "none";
        document.getElementById("showRemoveMoneyBtn").style.display = "none";
        document.getElementById("addAmount").focus();
    },

    showRemoveForm() {
        document.getElementById("removeMoneyForm").style.display = "block";
        document.getElementById("addMoneyForm").style.display = "none";
        document.getElementById("showAddMoneyBtn").style.display = "none";
        document.getElementById("showRemoveMoneyBtn").style.display = "none";
        document.getElementById("removeAmount").focus();
    },

    hideForms() {
        document.getElementById("addMoneyForm").style.display = "none";
        document.getElementById("removeMoneyForm").style.display = "none";
        document.getElementById("showAddMoneyBtn").style.display = "inline-block";
        document.getElementById("showRemoveMoneyBtn").style.display = "inline-block";
        LedgerManual.clearForms();
    },
    init() {// INITIALIZE ON PAGE LOAD
        this.hideForms();
        this.populateEmployeeSelects();

        document.getElementById("showAddMoneyBtn").onclick = () => this.showAddForm();
        document.getElementById("showRemoveMoneyBtn").onclick = () => this.showRemoveForm();
    }

};