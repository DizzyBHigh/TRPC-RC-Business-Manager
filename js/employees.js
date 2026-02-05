// ========================
// Employee Manager
// ========================
const EmployeeManager = {
    render() {
        const list = document.getElementById("employeeList");
        const employees = Object.entries(App.state.employees)
            .sort(([a], [b]) => a.localeCompare(b));

        if (employees.length === 0) {
            list.innerHTML = "<p style='color:#888;text-align:center;margin:40px 0;'>No employees yet</p>";
            return;
        }

        list.innerHTML = employees.map(([name, data]) => {
            // Force rate to number — handle corrupted data
            let rate = 0;
            if (typeof data === 'number') {
                rate = data;
            } else if (typeof data === 'object' && data !== null) {
                rate = Number(data.rate || data.value || data.commissionRate || 0) || 0;
            }

            rate = Math.max(0, Math.min(100, rate));  // Clamp 0-100

            return `
                <div class="item-row" style="align-items:center;justify-content:space-between;padding:12px;">
                    <div>
                        <strong style="font-size:16px;">${name}</strong>
                        <span style="margin-left:20px;color:var(--accent);">Current Rate: ${rate}% commission</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="number" id="rate_${name.replace(/ /g, '_')}" value="${rate}" min="0" max="100" style="width:80px;padding:8px;">
                        <span>%</span>
                        <button class="primary small" onclick="EmployeeManager.update('${name}')">Update Rate</button>
                        <button class="danger small" onclick="EmployeeManager.remove('${name}')">Delete</button>
                    </div>
                </div>
            `;
        }).join("");
    },
    add() {
        const name = document.getElementById("newEmployeeName").value.trim();
        const rateInput = document.getElementById("newEmployeePct");
        const rate = Number(rateInput.value) || 0;

        if (!name) return showToast("fail", "Enter employee name");
        if (rate < 0 || rate > 100) return showToast("fail", "Rate must be 0-100%");

        App.state.employees[name] = rate;  // Always store as number
        App.save("employees");
        rateInput.value = "15";  // Reset
        document.getElementById("newEmployeeName").value = "";
        this.render();
        Order.render();
        EmployeeSelect.refreshAll();
    },

    update(name) {
        const inputId = "rate_" + name.replace(/ /g, '_');
        const input = document.getElementById(inputId);
        const newRate = Number(input.value) || 0;

        if (newRate < 0 || newRate > 100) return showToast("fail", "Invalid rate (0-100%)");

        App.state.employees[name] = newRate;  // Force number
        App.save("employees");
        showToast("success", `${name}'s commission updated to ${newRate}%`);
        this.render();
        Order.render();
        EmployeeSelect.refreshAll();
    },
    remove(name) {
        if (showConfirm(`Permanently delete employee "${name}" and all their records?`)) {
            deleteFirebaseKey(`employees.${name}`);
            delete App.state.employees[name];
            if (App.state.roles && App.state.roles[name]) {
                deleteFirebaseKey(`roles.${name}`);
                delete App.state.roles[name];
            }
            this.render();
            Order.render();
            EmployeeSelect.refreshAll();
        }
    }
};

// ============================
// Add Content for Employees
// ============================
if (!document.getElementById("employees")) {
    document.body.insertAdjacentHTML("beforeend", `
            <div id="employees" class="tab-content">
                <h2>Employee Commission Manager</h2>
                <div class="controls">
                <input type="text" id="newEmployeeName" placeholder="Employee name">
                <input type="number" id="newEmployeePct" value="15" min="0" max="100" style="width:80px;">%
                <button class="success" onclick="EmployeeManager.add()">+ Add Employee</button>
                </div>
                <div id="employeeList" style="margin-top:20px;"></div>
            </div>
            `);
}

// UPDATE EMPLOYEE DROPDOWNS
// ────────────────────────────────
// CENTRAL EMPLOYEE DROPDOWN MANAGER
// ────────────────────────────────
const EmployeeSelect = {
    hasInitialized: false,

    refreshAll() {
        const allNames = Object.keys(App.state.employees)
            .filter(name => name !== "Unknown")
            .sort((a, b) => a.localeCompare(b));

        const namesWithUnknown = [...allNames, "Unknown"];

        const selectors = [
            "#employeeSelect",
            "#filterEmployee",
            "#purchaseEmployee",
            "#roleEmployeeSelect",
            "#addEmployee",
            "#removeEmployee",
            "#ledgerEmployee"
        ];

        const selectsWithUnknown = new Set([
            "#employeeSelect",
            "#ledgerEmployee",
            "#filterEmployee"
        ]);

        selectors.forEach(sel => {
            const select = document.querySelector(sel);
            if (!select) return;

            const prevValue = select.value;                 // ← what user actually chose
            const hasUnknown = selectsWithUnknown.has(sel);
            const namesToUse = hasUnknown ? namesWithUnknown : allNames;

            // ── Rebuild options ─────────────────────────────────────
            // Inside the selectors.forEach loop, right after you have `select`:
            const placeholderText = sel === "#filterEmployee"
                ? "All Employees"
                : "— Select Employee —";

            select.innerHTML = `
                        <option value="">${placeholderText}</option>
                        ${namesToUse.map(name =>
                name === "Unknown"
                    ? `<option value="Unknown">Unknown (0% commission)</option>`
                    : `<option value="${name}">${name}</option>`
            ).join('')}
                    `;

            setTimeout(() => {
                let restored = false;

                if (prevValue && prevValue !== "" && prevValue !== "Unknown" && namesToUse.includes(prevValue)) {
                    select.value = prevValue;
                    restored = true;
                }
                if (!restored && prevValue === "Unknown" && hasUnknown) {
                    select.value = "Unknown";
                    restored = true;
                }
                if (!restored && prevValue === "") {
                    select.value = "";
                    restored = true;
                }
                if (!restored && !EmployeeSelect.hasInitialized && window.playerName && namesToUse.includes(window.playerName.trim())) {
                    select.value = window.playerName.trim();
                }
            }, 0);
        });

        EmployeeSelect.hasInitialized = true;
    },

    reset() {
        this.hasInitialized = false;
    }
};

// ————————————————————————
// ONE-TIME SETUP — RUN ONCE AFTER DOM IS READY
// ————————————————————————
function initFilterEmployee() {
    const filterSelect = document.getElementById('filterEmployee');
    if (!filterSelect) {
        console.warn('filterEmployee not found — will retry...');
        setTimeout(initFilterEmployee, 100);
        return;
    }

    // Remove any old listeners
    filterSelect.onchange = null;
    filterSelect.replaceWith(filterSelect.cloneNode(true)); // nuclear clean
    const freshSelect = document.getElementById('filterEmployee');

    // Attach the handler
    freshSelect.addEventListener('change', () => {
        console.log('%cFILTER CHANGED → rendering orders', 'color: #0f9; font-weight: bold;', freshSelect.value);
        Order.render();
    });

    console.log('filterEmployee listener attached — FINAL VERSION');

    // NOW populate options — this guarantees options exist before any change can happen
    EmployeeSelect.refreshAll();
}

// Run it safely
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFilterEmployee);
} else {
    initFilterEmployee();
}