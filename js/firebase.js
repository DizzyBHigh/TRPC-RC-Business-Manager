

firebase.initializeApp(firebaseConfig);

firebase.auth().onAuthStateChanged(user => {
    if (user) {
        console.log("Logged in as", user.uid);
        App.userDoc = SHARED_DOC_REF;  // reconnect just in case
        //goOnline();  // ADD THIS LINE
    } else {
        console.log("Signing in anonymously...");
        firebase.auth().signInAnonymously()
            .then(() => console.log("Anonymous login success"))
            .catch(err => console.error("Auth failed:", err));
    }
});

// Also set App.userDoc immediately when page loads
firebase.auth().onAuthStateChanged(user => {
    if (user) App.userDoc = SHARED_DOC_REF;
});

const db = firebase.firestore();

// UNIVERSAL DELETE — WORKS FOR ANY NESTED KEY IN YOUR APP
window.deleteFirebaseKey = function (fieldPath) {
    // fieldPath examples:
    // "recipes.Fermentation Barrel (Copy)"
    // "rawPrice.Wood"
    // "employees.Jackson Stone"
    // "shopStock.Chair"

    const updateObj = {};
    updateObj[fieldPath] = firebase.firestore.FieldValue.delete();

    return SHARED_DOC_REF.update(updateObj)
        .then(() => console.log("Deleted from Firebase:", fieldPath))
        .catch(err => {
            console.error("Delete failed:", err);
            showToast("fail", "Delete failed — check console");
        });
};

// ──────────────────────── SAFESET v3 ────────────────────────
const SHARED_DOC_REF = db.collection("business").doc("main");
const originalSet = SHARED_DOC_REF.set.bind(SHARED_DOC_REF);

function safeSet(data, options = { merge: true }) {
    function clean(obj) {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) return obj.map(clean).filter(v => v !== null);
        if (typeof obj !== "object") return obj;

        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined && value !== null) {
                cleaned[key] = clean(value);
            }
        }
        return Object.keys(cleaned).length === 0 ? null : cleaned;
    }

    const cleanedData = clean(data);
    if (cleanedData === null) {
        console.warn("safeSet called with completely empty data — skipping");
        return Promise.resolve();
    }

    return originalSet(cleanedData, options).catch(err => {
        console.error("Firebase write failed:", err);
        showToast("fail", "Save failed — check internet or Firebase rules");
    });
}