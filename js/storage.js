// =============================================
// FINAL — 100% NAMESPACED — NO RAW localStorage EVER AGAIN
// =============================================

let CACHED_COMPANY_ID = null;

async function getCurrentCompanyId() {
    if (CACHED_COMPANY_ID) return CACHED_COMPANY_ID;

    try {
        const snap = await db.collection("business").doc("config").get();
        if (!snap.exists) {
            CACHED_COMPANY_ID = "default-business";
            return CACHED_COMPANY_ID;
        }

        const data = snap.data();
        if (data.companyId && data.companyId.trim()) {
            CACHED_COMPANY_ID = data.companyId.trim();
            return CACHED_COMPANY_ID;
        }

        const generated = (data.name || "Business")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 40) || "business";

        await db.collection("business").doc("config").update({ companyId: generated });
        CACHED_COMPANY_ID = generated;
        return generated;
    } catch (e) {
        CACHED_COMPANY_ID = "fallback-business";
        return CACHED_COMPANY_ID;
    }
}


// THE ONE AND ONLY local Storage functiom — USED BY EVERYTHING
window.ls = {
    async get(key, fallback = null) {
        const prefix = await getCurrentCompanyId();
        try {
            const raw = localStorage.getItem(`${prefix}_${key}`);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            console.warn(`ls.get failed [${key}]`, e);
            return fallback;
        }
    },
    async set(key, value) {
        const prefix = await getCurrentCompanyId();
        const storageKey = `${prefix}_${key}`;
        try {
            if (value === null || value === undefined) {
                localStorage.removeItem(storageKey);
            } else {
                localStorage.setItem(storageKey, JSON.stringify(value));
            }
            console.log(`SAVED → ${storageKey} =`, value);
        } catch (e) {
            console.error(`ls.set FAILED [${key}]`, e);
        }
    },
    async remove(key) {
        const prefix = await getCurrentCompanyId();
        localStorage.removeItem(`${prefix}_${key}`);
    }
};

// THE ONE AND ONLY PERMANENT CLEAR KEY — COMPANY-SCOPED
const ORDER_CLEARED_KEY = "orderPermanentlyCleared";

if (window.ls.get(ORDER_CLEARED_KEY) === true) {
    window.permanentOrderCleared = true;
    App.state.order = [];
    console.log("Permanent order clear restored from localStorage");
}

// Restore permanent clear state on page load using ls
(async () => {
    const cleared = await window.ls.get(ORDER_CLEARED_KEY);
    if (cleared === true) {  // ls.get returns parsed boolean
        window.permanentOrderCleared = true;
        console.log("Permanent order clear RESTORED from local Storage");
    }
})();