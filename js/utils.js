


// DEBOUNCING - reduces lag
// debounce helper
function debounce(func, wait) {
    let timeout;
    const debounced = function (...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
    debounced.cancel = () => clearTimeout(timeout);
    return debounced;
}

const debouncedCalcRun = debounce(() => Calculator.run(), 400);
const debouncedOrderRender = debounce(() => Order.render(), 400);        // ← NEW: for filters
const debouncedRenderPending = debounce(() => Order.renderPending(), 300); // optional, nice to have

// Faster Saving (should reduce lag)
const debouncedSaveOrder = debounce(() => {
    console.log("Auto-saving current order to Firebase...");
    App.save("order");
}, 1200); // waits 800ms after last change before saving

// DATA LOADER — SAFE, CLEAN, NAMESPACED
async function loadSafe(key, fallback = null) {
    try {
        const value = await ls.get("cnc_" + key);

        // If nothing saved → return fallback
        if (value === null || value === undefined) {
            return fallback;
        }

        // If it's already a parsed object/array (from ls.get), just return it
        if (typeof value !== "string") {
            return value;
        }

        // Otherwise try to parse it (legacy support)
        const parsed = JSON.parse(value);
        return parsed;

    } catch (error) {
        console.error(`Corrupted or invalid data for ${key}:`, error);
        showToast("fail", `Corrupted ${key} data detected — resetting to default.`);

        // Clean up the bad entry
        await ls.remove("cnc_" + key);

        return fallback;
    }

}
// clear illegal characters before saving
function sanitizeItemName(name) {
    return name.trim().replace(/[.#$[\]]/g, '_'); // only bad chars, keep spaces
}

// check id exists before setting text
function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
//TOAST ALERT
function showToast(type, message, duration = 1250) {
    // Remove old
    document.getElementById("Toast")?.remove();

    const toast = document.createElement("div");
    toast.id = "Toast";

    const icons = {
        success: "✓",
        fail: "✕",
        info: "ℹ"
    };

    toast.innerHTML = `
                <div class="toast-inner ${type}Toast">
                    <div class="toast-icon">${icons[type] || "●"}</div>
                    <div style="flex:1; line-height:1.4;">${message}</div>
                </div>
            `;

    document.body.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
        toast.querySelector('.toast-inner').style.animation = 'toastOut 0.4s ease forwards';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

async function showConfirm(message) {
    return new Promise((resolve) => {
        document.getElementById("ConfirmDialog")?.remove();

        const dialog = document.createElement("div");
        dialog.id = "ConfirmDialog";
        dialog.innerHTML = `
                    <div class="confirmToast">
                        <div style="display:flex; align-items:center; gap:16px;">
                            <div class="toast-icon">?</div>
                            <div class="message">${message}</div>
                        </div>
                        <div class="buttons">
                            <button id="confirmNo">No</button>
                            <button id="confirmYes">Yes</button>
                        </div>
                    </div>
                `;

        document.body.appendChild(dialog);

        dialog.querySelector("#confirmYes").onclick = () => { dialog.remove(); resolve(true); };
        dialog.querySelector("#confirmNo").onclick = () => { dialog.remove(); resolve(false); };

        // Click outside = cancel
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) {
                dialog.remove();
                resolve(false);
            }
        });
    });
}



// Function to get the current player name, handling namespaced storage
async function getCurrentPlayerName() {
    try {
        const companyId = await getCurrentCompanyId();
        if (!companyId) return null;

        return getPlayerName(companyId);
    } catch (error) {
        console.error('Error getting current player name:', error);
        return null;
    }
}

// Check if current user is a manager
function isManager() {
    const user = window.playerName || App.state.loggedInUser || "";
    if (!user) return false;

    // First check the global (your initRoles sets this)
    if (window.myRole && window.myRole.toLowerCase().includes("manager")) {
        return true;
        if (myRole && myRole.toLowerCase().includes("manager")) return true;

        // Then check App.state (for consistency)
        const role = App.state.roles?.[user];
        return role && role.toLowerCase().includes("manager");
    }
}

function generateCompanyId(businessName) {
    // Remove special characters, spaces, and convert to lowercase, then create a consistent ID
    return businessName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .substring(0, 50); // Limit length to prevent excessively long IDs
}

// Function to ensure the company ID is set in the business configuration
async function ensureCompanyId() {
    try {
        const configDoc = await firebase.firestore().collection('business').doc('config').get();

        if (!configDoc.exists) {
            throw new Error('Business configuration document does not exist');
        }

        const configData = configDoc.data();

        // If companyId doesn't exist, generate it from the business name and save it
        if (!configData.companyId) {
            const companyId = generateCompanyId(configData.name);

            await firebase.firestore().collection('business').doc('config').update({
                companyId: companyId,
                companyIdGeneratedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Company ID generated and saved: ${companyId}`);
            return companyId;
        }

        return configData.companyId;

    } catch (error) {
        console.error('Error ensuring company ID:', error);
        throw error;
    }
}

// ============================================
// SHOW EVERYONE WHO IS ONLINE 
// ============================================

function renderOnlineUsers() {
    const target = document.getElementById("onlineList");
    if (!target) {
        console.warn("renderOnlineUsers: #onlineList element not found yet");
        setTimeout(renderOnlineUsers, 100);
        return;
    }

    // === ATTACH LOGOUT LISTENER ONCE USING DELEGATION ===
    // Remove any previous delegation to be safe
    target.removeEventListener("click", handleLogoutClick);
    target.addEventListener("click", handleLogoutClick);

    function handleLogoutClick(e) {
        if (e.target.id === "logoutBtn" || e.target.closest("#logoutBtn")) {
            e.preventDefault();
            e.stopPropagation();
            logoutUser();
        }
    }

    // === LOGOUT FUNCTION (defined once) ===
    async function logoutUser() {
        try {
            // Always try to mark offline — if ref doesn't exist, it just skips
            const onlineRef = App.state?.onlineStatusRef || window.onlineRef;
            if (onlineRef) {
                await onlineRef.set({
                    online: false,
                    lastSeen: new Date().toISOString()
                });
            }

            // Always clear all possible login traces (safe even if not set)
            if (App.state) {
                delete App.state.loggedInUser;
                App.state.currentEmployee = "";
            }
            delete window.playerName;

            localStorage.removeItem('playerName');
            localStorage.removeItem('loggedInUser');

            if (window.ls?.remove) {
                await Promise.all([
                    window.ls.remove("loggedInUser").catch(() => { }),
                    window.ls.remove("playerName").catch(() => { })
                ]);
            }

            // UI cleanup
            const empSelect = document.getElementById("employeeSelect");
            if (empSelect) empSelect.value = "";

            showToast("success", "Logged out successfully");

            setTimeout(() => {
                window.location.reload();
            }, 800);

        } catch (err) {
            console.error("Logout error:", err);
            showToast("fail", "Logout failed");
        }
    }

    // === ON SNAPSHOT: ONLY UPDATE HTML ===
    ONLINE_DOC.collection("users").onSnapshot(snap => {
        const onlineUsers = [];

        snap.forEach(doc => {
            const d = doc.data();
            if (!d || !d.name || typeof d.name !== "string" || d.name.trim() === "") return;

            const name = d.name.trim();
            const onlineFlag = d.online === true;

            let lastSeenMs = Date.now();
            if (d.lastSeen) {
                if (typeof d.lastSeen.toMillis === "function") {
                    lastSeenMs = d.lastSeen.toMillis();
                } else if (d.lastSeen?.seconds) {
                    lastSeenMs = d.lastSeen.seconds * 1000;
                }
            }

            if (!onlineFlag || Date.now() - lastSeenMs > 300000) return;

            onlineUsers.push(name);
        });

        onlineUsers.sort((a, b) => a.localeCompare(b));

        if (onlineUsers.length === 0) {
            target.innerHTML = `<span style="color:#666; font-style:italic;">No one online</span>`;
            return;
        }

        const namesList = onlineUsers.map(name => `<strong style="color:#0f8;">${name}</strong>`).join(" • ");

        target.innerHTML = `
            <button id="logoutBtn" class="logoutBtn" title="Logout">↩ Logout</button>
            <span style="color:#0f8; font-weight:bold;">Online:</span>
            <strong style="margin-left:6px;">${onlineUsers.length}</strong>
            <span style="margin-left:8px;">${namesList}</span>
        `;

        if (onlineUsers.length > 5) {
            target.title = "Online users:\n" + onlineUsers.map(n => `• ${n}`).join("\n");
            target.style.cursor = "help";
        }
    }, err => {
        console.error("Online listener error:", err);
        target.innerHTML = `<span style="color:#f66;">Error</span>`;
    });
}

// CALL IT WHEN DOM IS READY
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderOnlineUsers);
} else {
    renderOnlineUsers();
}



function resolveWarehouseItemToDisplay(itemName, qtyUsedFromWarehouse) {
    // These are the only crafted items that can come from warehouse and replace raw costs
    const craftedMapping = {
        "Varnished Wood": { replaces: ["Wood", "Resin"], displayAs: "Varnished Wood" },
        "Tanned Leather": { replaces: ["Leather Strap", "Resin"], displayAs: "Tanned Leather" },
        "Hardened Leather": { replaces: ["Tanned Leather", "Resin"], displayAs: "Hardened Leather" },
        // Add more crafted items here in the future if needed
    };

    const mapping = craftedMapping[itemName];
    if (!mapping || qtyUsedFromWarehouse <= 0) return null;

    return {
        name: mapping.displayAs,
        quantity: qtyUsedFromWarehouse,
        replaces: mapping.replaces
    };
}



// ──────────────────────────────────────────────────────────────
// Remove an item directly from the crafting tree
// ──────────────────────────────────────────────────────────────
function removeOrderItemDirectly(index) {
    if (showConfirm("Remove this item from the order?")) {
        App.state.order.splice(index, 1);           // remove from order
        debouncedSaveOrder();;                           // save to Firebase
        Order.renderCurrentOrder();                       // refresh order list
        debouncedCalcRun();                            // instantly refresh the tree & totals
    }
}

function refreshAllStockLists() {
    setTimeout(() => {
        // Also refresh these no matter what (they use allItems() internally)
        //PriceList.render();
        Order.render();
        Inventory.render();
    }, 100);
}
// Emergency one-click manager claim (keep this!)
window.claimManager = async () => {
    if (confirm("Make yourself permanent Manager?")) {
        await ROLES_DOC.safeSet({ [playerName]: "manager" }, { merge: true });
        alert("You are now MANAGER! Reloading…");
        setTimeout(() => location.reload(), 1500);
    }
};

function debugCost(item) {
    console.log("=== COST DEBUG FOR:", item, "===");
    const cost = Calculator.cost(item);
    console.log("Final cost:", cost.toFixed(2));

    const recipe = App.state.recipes[item];
    if (!recipe || !recipe.i) {
        console.log("No recipe or ingredients");
        return;
    }

    console.log("Recipe ingredients:", recipe.i);
    Object.entries(recipe.i).forEach(([ing, qty]) => {
        const ingCost = Calculator.cost(ing) || 0;
        console.log(`${ing}: ${qty} × $${ingCost.toFixed(2)} = $${(qty * ingCost).toFixed(2)}`);
        if (ingCost === 0) {
            console.log("^-- THIS INGREDIENT HAS NO PRICE!");
        }
    });
}

function deepMerge(target, source) {
    if (typeof source !== 'object' || source === null) return source;
    if (typeof target !== 'object' || target === null) target = Array.isArray(source) ? [] : {};

    Object.keys(source).forEach(key => {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            target[key] = deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    });

    return target;
}


async function getOnlineCount() {
    try {
        const snap = await db.collection("business").doc("online").collection("users").get();
        let count = 0;
        snap.forEach(doc => {
            const d = doc.data();
            if (!d?.name) return;
            if (d.online !== true) return;

            let lastSeenMs = Date.now();
            if (d.lastSeen) {
                if (typeof d.lastSeen.toMillis === "function") {
                    lastSeenMs = d.lastSeen.toMillis();
                } else if (d.lastSeen.seconds) {
                    lastSeenMs = d.lastSeen.seconds * 1000;
                }
            }
            if (Date.now() - lastSeenMs > 300000) return; // 5 minutes
            count++;
        });
        return count;
    } catch (err) {
        console.warn("Failed to get online count:", err);
        return 0;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    async function logoutUser() {
        const userName = App.state?.loggedInUser || window.playerName || localStorage.getItem('playerName');

        if (!userName) {
            console.log("No user logged in");
            return;
        }

        try {
            // 1. Mark user as offline in Firebase
            const onlineRef = App.state?.onlineStatusRef || window.onlineRef;
            if (onlineRef) {
                await onlineRef.set({
                    online: false,
                    lastSeen: new Date().toISOString()
                });
                console.log(`User ${userName} marked offline`);
            }

            // 2. Clear local login state
            if (App.state) {
                delete App.state.loggedInUser;
                App.state.currentEmployee = "";
            }
            delete window.playerName;
            localStorage.removeItem('playerName');
            localStorage.removeItem('loggedInUser');

            if (window.ls && typeof window.ls.remove === 'function') {
                await window.ls.remove("loggedInUser").catch(() => { });
            }

            // Update UI
            const employeeSelect = document.getElementById("employeeSelect");
            if (employeeSelect) employeeSelect.value = "";

            // Show toast (safe fallback)
            if (typeof showToast === 'function') {
                showToast("success", `Logged out successfully`);
            } else {
                alert("Logged out successfully");
            }

            // Reload page
            setTimeout(() => {
                window.location.reload();
            }, 800);

        } catch (err) {
            console.error("Logout failed:", err);
            if (typeof showToast === 'function') {
                showToast("fail", "Logout failed — check console");
            }
        }
    }

    // Only attach listener if button exists
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logoutUser);
    }
});

async function autoBackupToFile() {
    let businessName = "My-Business";  // Fallback

    try {
        // Fetch from the correct path: business-config-companyId
        const configDoc = firebase.firestore()
            .collection("businesses")
            .doc(App.companyId || App.state.companyId)  // Use your companyId variable
            .collection("config")
            .doc("companyId");

        const snap = await configDoc.get();
        if (snap.exists) {
            const data = snap.data();
            if (data?.name && typeof data.name === "string") {
                businessName = data.name.trim();
            }
        }
    } catch (err) {
        console.warn("Failed to fetch business name for backup filename:", err);
        // Fall back to App.state if available
        businessName = App.state.businessName || App.state.name || businessName;
    }

    // Clean the name for safe filename
    businessName = businessName
        .replace(/[^a-zA-Z0-9\-_ ]/g, "")  // Remove invalid chars
        .replace(/\s+/g, "-")              // Spaces → dashes
        .substring(0, 50)                  // Limit length
        || "Business";                     // Final fallback

    const backupData = {
        timestamp: new Date().toISOString(),
        businessName: businessName,
        warehouseStock: App.state.warehouseStock || {},
        shopStock: App.state.shopStock || {},
        ledger: App.state.ledger || [],
        completedOrders: App.state.completedOrders || [],
        rawPrice: App.state.rawPrice || {},
        recipes: App.state.recipes || {},
        employees: App.state.employees || {},
        minStock: App.state.minStock || {},
        // Add any other data you want backed up
    };

    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `${businessName}-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`Auto-backup downloaded: ${link.download}`);
    showToast("success", `Backup saved: ${link.download}`);
}

if (isManager()) {  // Your manager check
    setInterval(autoBackupToFile, 180 * 60 * 1000);
}

/* function updatePageTitleAndHeader() {
    if (App.state.businessConfig?.name) {
        document.title = `${App.state.businessConfig.name} - HSRP Manager`;

        const headerName = document.querySelector('h1');
        if (headerName) headerName.textContent = App.state.businessConfig.name;

        if (App.state.businessConfig.tagline) {
            const subtitle = document.querySelector('.subtitle');
            if (subtitle) subtitle.textContent = App.state.businessConfig.tagline;
        }
    }
} */