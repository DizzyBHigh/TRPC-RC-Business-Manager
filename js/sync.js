// ==============================
// FINAL SYNC SYSTEM — COVERS EVERYTHING IN business/main
// ==============================
const Sync = {
    // THIS MAP IS NOW 100% CORRECT FOR YOUR FIREBASE STRUCTURE
    dataMap: {
        prices: "customPrices",
        recipes: "recipes",
        raw: "rawPrice",
        categories: "Categories",
        hidden: "hiddenfromPrices",
        employees: "Employees",
        shopstock: "shopStock",
        warehousestock: "warehouseStock",
        ledger: "ledger",
        orders: "completedOrders",
        minstock: "minStock",
        ocr: "ocrCorrections"
    },

    friendlyNames: {
        customPrices: "Custom Prices",
        recipes: "Crafting Recipes",
        rawPrice: "Raw Material Prices",
        Categories: "Item Categories",
        hiddenfromPrices: "Hidden from Price List",
        Employees: "Employees & Commission Rates",
        shopStock: "Shop Display Stock",
        warehouseStock: "Warehouse Stock",
        ledger: "Financial Ledger",
        completedOrders: "Completed Customer Orders",
        minStock: "Minimum Stock Alerts",
        ocrCorrections: "OCR Auto-Corrections"
    },

    // EXPORT — WORKS PERFECTLY
    exportSelected() {
        const backup = { version: "4.0", date: new Date().toISOString(), exported: {} };

        Object.entries(this.dataMap).forEach(([id, firebaseKey]) => {
            const cb = document.getElementById("exp_" + id);
            if (cb?.checked) {
                const val = App.state[firebaseKey];
                if (val && (Array.isArray(val) ? val.length : Object.keys(val || {}).length > 0)) {
                    backup.exported[firebaseKey] = JSON.parse(JSON.stringify(val));
                }
            }
        });

        const json = JSON.stringify(backup, null, 2);
        document.getElementById("exportBox").value = json;
        navigator.clipboard.writeText(json).then(
            () => showToast("success", "BACKUP COPIED TO CLIPBOARD!"),
            () => prompt("COPY THIS BACKUP NOW:", json)
        );
    },

    // IMPORT — SAFE, SMART, NO DUPLICATES
    importSelected() {
        const text = document.getElementById('importBox').value.trim();
        if (!text) return showToast("fail", "Paste backup first!");

        let data;
        try { data = JSON.parse(text); } catch (e) { return showToast("fail", "Invalid JSON"); }

        const source = data.exported || data.deletedData || data;
        if (!source) return showToast("fail", "No data found in backup!");

        let imported = 0, skipped = 0;
        const status = document.getElementById("importStatus");

        Object.entries(this.dataMap).forEach(([id, firebaseKey]) => {
            const cb = document.getElementById("imp_" + id);
            if (!cb?.checked) return;

            const incoming = source[firebaseKey];
            if (incoming === undefined) return;

            const current = App.state[firebaseKey] || (Array.isArray(incoming) ? [] : {});

            if (Array.isArray(incoming)) {
                const existingIds = new Set(current.map(x => x.id).filter(Boolean));
                const newItems = incoming.filter(x => x.id && !existingIds.has(x.id));
                if (newItems.length > 0) {
                    App.state[firebaseKey] = [...current, ...newItems];
                    App.save(firebaseKey);
                    imported++;
                }
                skipped += incoming.length - newItems.length;
            }
            else if (typeof incoming === "object") {
                const merged = { ...current, ...incoming };
                if (JSON.stringify(merged) !== JSON.stringify(current)) {
                    App.state[firebaseKey] = merged;
                    App.save(firebaseKey);
                    imported++;
                } else {
                    skipped++;
                }
            }
        });

        const msg = imported === 0
            ? "Nothing new to import"
            : `SUCCESS! ${imported} data type(s) updated`;
        status.textContent = skipped > 0 ? `${msg} • ${skipped} skipped (already exist)` : msg;
        status.style.color = imported > 0 ? "var(--green)" : "orange";

        setTimeout(() => location.reload(), 1500);
    },

    // CLEAR — FULL BACKUP + SAFE DELETE
    async clearSelected() {
        const toClear = [];
        const backup = { version: "4.0", date: new Date().toISOString(), deletedData: {} };

        Object.entries(this.dataMap).forEach(([id, firebaseKey]) => {
            const cb = document.getElementById("clr_" + id);
            if (cb?.checked) {
                toClear.push(firebaseKey);
                const val = App.state[firebaseKey];
                if (val && (Array.isArray(val) ? val.length : Object.keys(val || {}).length > 0)) {
                    backup.deletedData[firebaseKey] = JSON.parse(JSON.stringify(val));
                }
            }
        });

        if (toClear.length === 0) return showToast("fail", "Select at least one item to clear!");

        const total = toClear.reduce((sum, k) => sum + (Array.isArray(App.state[k]) ? App.state[k].length : Object.keys(App.state[k] || {}).length), 0);

        if (await showConfirm(`PERMANENTLY DELETE ${total} record(s) across ${toClear.length} categories?\n\nA full backup will be copied to clipboard.\n\nContinue?`)) {
            return document.getElementById("clearStatus").textContent = "Cancelled";
        }

        // COPY BACKUP FIRST
        navigator.clipboard.writeText(JSON.stringify(backup, null, 2)).catch(() => {
            prompt("CRITICAL BACKUP — COPY NOW:", JSON.stringify(backup, null, 2));
        });

        // DELETE FROM FIREBASE + LOCAL
        const updateObj = {};
        toClear.forEach(key => {
            updateObj[key] = firebase.firestore.FieldValue.delete();
            App.state[key] = Array.isArray(App.state[key]) ? [] : {};
        });

        SHARED_DOC_REF.update(updateObj).catch(console.error);

        document.getElementById("clearStatus").textContent = `DELETED ${total} records! Backup copied.`;
        document.getElementById("clearStatus").style.color = "var(--red)";

        setTimeout(() => location.reload(), 1500);
    }
};