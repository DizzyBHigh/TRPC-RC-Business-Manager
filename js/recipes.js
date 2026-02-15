// NEW: Helper to force Proper Case (CamelCase) for recipe names
function toProperCase(str) {
    return str
        .toLowerCase()
        .replace(/(^|\s|-)\w/g, letter => letter.toUpperCase())
        .replace(/#/g, ' #'); // Preserve # in "Christmas #1"
}

// ==========================
// Recipe Manager / Editor — NOW WITH WEIGHT PER FINISHED ITEM
// ==========================
const RecipeEditor = {
    addRow(mode) {
        const cont = document.getElementById(mode + "Ingredients");
        if (!cont) {
            console.warn(`Container #${mode}Ingredients not found`);
            return;
        }

        const row = document.createElement("div");
        row.className = "ingredient-row";
        row.style.cssText = "display:flex; gap:12px; align-items:center; margin:10px 0; padding:8px; background:#0d1117; border-radius:6px; border:1px solid #222;";

        row.innerHTML = `
            <div class="searchable-select" style="flex:1; position:relative;">
                <input type="text" placeholder="Ingredient or Tool" oninput="RecipeEditor.filterIng(this)" style="width:100%; padding:6px;">
                <div class="options" style="display:none; position:absolute; background:#000; border:1px solid #444; max-height:180px; overflow-y:auto; z-index:5; width:100%;"></div>
            </div>
            <input type="number" class="qty-input" value="1" min="0.1" step="0.1" style="width:110px; padding:6px;" placeholder="Qty / %">
            <select class="usage-type" style="width:150px; padding:6px; background:#111; color:#eee; border:1px solid #444; border-radius:4px;">
                <option value="full">Full consume</option>
                <option value="percent">Durability %</option>
            </select>
            <button class="danger small" onclick="this.parentNode.remove()" style="padding:6px 12px; font-size:13px;">Remove</button>
        `;

        // Live UI sync when changing type
        const qtyInput = row.querySelector(".qty-input");
        const typeSelect = row.querySelector(".usage-type");

        const updateUI = () => {
            if (!qtyInput || !typeSelect) return;
            if (typeSelect.value === "percent") {
                let v = parseFloat(qtyInput.value);
                if (isNaN(v) || v > 100) qtyInput.value = "10";
                if (v < 0.1 && v > 0) qtyInput.value = "0.1";
                qtyInput.placeholder = "0.1–100 %";
                qtyInput.max = "100";
                qtyInput.step = "0.1";
            } else {
                let v = parseFloat(qtyInput.value);
                if (isNaN(v) || v < 1) qtyInput.value = "1";
                qtyInput.placeholder = "Quantity";
                qtyInput.removeAttribute("max");
                qtyInput.step = "1";
            }
        };

        typeSelect.addEventListener("change", updateUI);
        qtyInput.addEventListener("input", updateUI);

        // Run once on creation
        updateUI();

        cont.appendChild(row);
    },

    filterRecipes(val = "") {
        val = val.toLowerCase().trim();
        const recipes = App.state.recipes || {};
        const items = Object.keys(recipes).sort();
        const tbody = document.getElementById("recipeTableBody");
        const noRecipes = document.getElementById("noRecipes");
        if (!tbody || !noRecipes) return;

        const fragment = document.createDocumentFragment();
        let visible = 0;

        items.forEach(item => {
            if (val && !item.toLowerCase().includes(val)) return;
            visible++;
            // === RE-USE EXACT SAME ROW BUILDING LOGIC AS renderRecipeTable ===
            const recipe = recipes[item];
            const yieldAmt = Number(recipe.y) || 1;
            const weight = Number(recipe.weight) || 0;

            // === TRUE RECIPE COST FROM INGREDIENTS ===
            let recipeCost = 0;
            if (recipe.i && Object.keys(recipe.i).length > 0) {
                for (const [ing, qty] of Object.entries(recipe.i)) {
                    recipeCost += (Calculator.cost(ing) || 0) * qty;
                }
                recipeCost = recipeCost / yieldAmt;
            }

            // === MARKET / RAW PRICE (if set) ===
            const rawPrice = App.state.rawPrice[item]?.price || 0;

            // === BUILD COST DISPLAY ===
            let costDisplay = `<div style="font-weight:bold; color:#0f8;">Recipe: $${recipeCost.toFixed(2)}</div>`;
            if (rawPrice > 0) {
                const color = rawPrice < recipeCost ? "#0f8" : "#fa5"; // green if cheaper than crafting
                costDisplay = `
                    <div style="color:#0af; font-size:0.9em;">Market: $${rawPrice.toFixed(2)}</div>
                    ${costDisplay}
                    ${rawPrice < recipeCost ? `<small style="color:#0f8;">(Save $${(recipeCost - rawPrice).toFixed(2)})</small>` : ''}
                `;
            }

            // === INGREDIENTS LIST (with individual costs) ===
            let ingredientsList = "—";
            if (recipe.i && Object.keys(recipe.i).length > 0) {
                ingredientsList = Object.entries(recipe.i)
                    .map(([ing, spec]) => {
                        if (typeof spec === "number") {
                            return `${spec}× ${ing}`;
                        } else if (spec?.percent) {
                            return `${spec.percent}% ${ing} (durability)`;
                        }
                        return `?× ${ing}`;
                    })
                    .join("<br>");
            }

            const row = document.createElement("tr");
            if (weight === 0) {
                row.style.background = "#0d1117";
                row.style.borderLeft = "4px solid #0af";
            } else {
                row.style.background = "rgba(0, 170, 255, 0.08)";
            }

            row.innerHTML = `
                <td style="padding:12px; text-align:left;">${item}</td>
                <td style="padding:12px; text-align:center;">${yieldAmt}</td>
                <td style="padding:12px; text-align:center;">${weight.toFixed(2)}</td>
                <td style="padding:12px; font-size:13px; line-height:1.6;">${ingredientsList}</td>
                <td style="padding:12px; text-align:center;">
                    ${costDisplay}
                </td>
                <td style="padding:12px; text-align:center;">
                    <div style="display:flex; gap:8px; align-items:center; justify-content:center;">
                        <input type="number" min="1" value="1" style="width:60px; padding:6px;" id="qty_${item.replace(/ /g, '_')}">
                        <button onclick="Inventory.addToOrder('${item}', document.getElementById('qty_${item.replace(/ /g, '_')}').value)"
                                style="padding:8px 16px; background:#0f8; color:black; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                            Add to Order
                        </button>
                        ${hasPermission("canEditRecipes") ? `
                        <button onclick="RecipeEditor.load('${item}')"
                                style="padding:8px 16px; background:#0af; color:black; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                            Edit
                        </button>
                        <button onclick="RecipeEditor.load('${item}', true)"
                                style="padding:8px 16px; background:#fa5; color:black; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                            Duplicate
                        </button>
                        ` : `
                        <span style="color:#888; font-style:italic; font-size:14px;">(Editing restricted)</span>
                        `}
                    </div>
                </td>
            `;
            fragment.appendChild(row);
        });

        tbody.innerHTML = "";
        tbody.appendChild(fragment);

        noRecipes.style.display = visible === 0 ? "block" : "none";
        noRecipes.textContent = val ? "No recipes match your search" : "No recipes yet";

        // Always apply header permissions (safe to call multiple times)
        applyRecipePermissions();
    },

    filterIng(input) {
        const val = String(input.value || "").toLowerCase().trim();
        const results = input.parentNode.querySelector(".options");
        if (!results) return; // safety

        results.innerHTML = "";
        results.style.display = val ? "block" : "none";
        if (!val) return;

        App.allItems()
            .filter(i => i.toLowerCase().includes(val))
            .slice(0, 15)
            .forEach(i => {
                const div = document.createElement("div");
                div.className = "category-item";
                div.textContent = i;
                div.onclick = () => {
                    input.value = i;
                    results.style.display = "none";
                    input.focus(); // nice touch
                };
                results.appendChild(div);
            });
    },

    create() {
        const name = sanitizeItemName(document.getElementById("newItemName").value.trim());
        if (!name || App.state.recipes[name]) return showToast("fail", "Invalid or duplicate name!");

        // NEW: Force Proper Case for new recipe name
        const properName = toProperCase(name);
        document.getElementById("newItemName").value = properName; // Update UI

        const ingredients = {};
        document.querySelectorAll("#newIngredients .ingredient-row").forEach(r => {
            const ing = r.querySelector("input[type=text]").value.trim();
            const qty = parseInt(r.querySelector("input[type=number]").value) || 1;
            if (ing) ingredients[ing] = qty;
        });

        const yield = parseInt(document.getElementById("newItemYield").value) || 1;
        const weightInput = document.getElementById("newItemWeight");
        const weight = weightInput ? parseFloat(weightInput.value) : 0;
        const safeWeight = isNaN(weight) ? 0 : weight;

        App.state.recipes[properName] = {
            i: ingredients,
            y: yield,
            weight: safeWeight
        };

        App.save("recipes");
        App.refresh();
        debouncedCalcRun();

        showToast("success", `"${properName}" created with ${safeWeight.toFixed(2)} kg weight!`);

        // Reset
        document.getElementById("newItemName").value = "";
        document.getElementById("newItemYield").value = "1";
        if (weightInput) weightInput.value = "0.00";
        document.getElementById("newIngredients").innerHTML = "";
        this.addRow("new");
        //safeRender();
        RecipeEditor.renderRecipeTable();
    },

    load(name, isDuplicating = false) {
        if (!App.state.recipes[name]) return showToast("fail", "Recipe not found");

        const r = App.state.recipes[name];
        const editArea = document.getElementById("editArea");
        editArea.style.display = "block";

        // Clone template safely
        const template = document.getElementById("createRecipeForm");
        if (!template) {
            console.error("createRecipeForm template missing!");
            return;
        }

        let html = template.outerHTML
            .replace(/createRecipeForm/g, "editRecipeForm")
            .replace(/newItemName/g, "editItemName")
            .replace(/newItemYield/g, "editYield")
            .replace(/newItemWeight/g, "editWeight")
            .replace(/newIngredients/g, "editIngredients")
            .replace(/RecipeEditor\.addRow\('new'\)/g, "RecipeEditor.addRow('edit')")
            .replace(/Create New Recipe/g, isDuplicating ?
                `Duplicating: <span style="color:#ff0;">${name}</span>` :
                `Editing: <span style="color:#ff0;">${name}</span>`);

        editArea.innerHTML = html;

        // Remove create button
        editArea.querySelector('button[onclick*="RecipeEditor.create()"]')?.closest('div')?.remove();

        // Add original name tracker
        const hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.id = "originalRecipeName";
        hidden.value = name;
        editArea.appendChild(hidden);

        // Populate
        document.getElementById("editItemName").value = isDuplicating ? name + " (Copy)" : name;
        document.getElementById("editYield").value = r.y || 1;
        document.getElementById("editWeight").value = (r.weight || 0).toFixed(2);

        const ingContainer = document.getElementById("editIngredients");
        if (!ingContainer) {
            console.error("editIngredients container missing after load");
            return;
        }

        ingContainer.innerHTML = "";

        if (r.i) {
            Object.entries(r.i).forEach(([ing, spec]) => {
                RecipeEditor.addRow("edit");
                const lastRow = ingContainer.lastElementChild;
                if (!lastRow) {
                    console.warn("Failed to add row for:", ing);
                    return;
                }
        
                // Set ingredient name
                const textInput = lastRow.querySelector('input[type="text"]');
                if (textInput) {
                    textInput.value = ing;
                } else {
                    console.warn("No text input in row for:", ing);
                }
        
                const qtyInput   = lastRow.querySelector(".qty-input");
                const typeSelect = lastRow.querySelector(".usage-type");
        
                // Only try to set if both elements exist
                if (qtyInput && typeSelect) {
                    if (typeof spec === "number") {
                        // Classic full quantity
                        typeSelect.value = "full";
                        qtyInput.value = spec;
                    }
                    else if (spec && typeof spec === "object" && spec.percent !== undefined) {
                        // Percentage mode — this is the key part that's probably missing/broken now
                        typeSelect.value = "percent";
                        qtyInput.value = spec.percent;
                        console.log(`Restored percentage for ${ing}: ${spec.percent}%`);
                    }
                    else {
                        console.warn(`Unknown spec format for ${ing}:`, spec);
                        typeSelect.value = "full";
                        qtyInput.value = 1;
                    }

                    // Force UI update (very important!)
                    typeSelect.dispatchEvent(new Event("change"));
                } else {
                    console.warn(`Row for ${ing} missing .qty-input or .usage-type — using fallback`);
                    // Fallback for old rows (if any still exist)
                    const fallbackInput = lastRow.querySelector('input[type="number"]');
                    if (fallbackInput) {
                        fallbackInput.value = typeof spec === "number" ? spec : (spec?.percent || 1);
                    }
                }
            });
        } else {
            // No ingredients — add one empty row for convenience
            RecipeEditor.addRow("edit");
        }

        // INSERT ACTION BUTTONS — HIDE DELETE & DUPLICATE WHEN DUPLICATING
        const ingredientsBox = editArea.querySelector("div[style*='background:#000814']");
        if (ingredientsBox) {
            const buttonRow = document.createElement("div");
            buttonRow.style.cssText = "margin-top:28px; display:flex; gap:16px; justify-content:center; flex-wrap:wrap;";

            const deleteBtn = (isDuplicating || !hasPermission("canDeleteRecipes")) ?
                `<span style="flex:1; color:#888; font-style:italic; padding:16px;">Delete restricted</span>` : `
                <button onclick="RecipeEditor.del()" style="flex:1; min-width:220px; padding:16px 24px; background:#aa0000; color:white; font-weight:bold; font-size:19px; border:none; border-radius:12px; cursor:pointer;">
                    DELETE RECIPE
                </button>`;

            const duplicateBtn = isDuplicating ? '' : `
                <button onclick="RecipeEditor.duplicate()" style="flex:1; min-width:220px; padding:16px 24px; background:#cc7700; color:white; font-weight:bold; font-size:19px; border:none; border-radius:12px; cursor:pointer;">
                    DUPLICATE RECIPE
                </button>`;

            buttonRow.innerHTML = `
                <button onclick="RecipeEditor.save()" style="flex:1; min-width:220px; padding:16px 24px; background:#00aa00; color:white; font-weight:bold; font-size:19px; border:none; border-radius:12px; cursor:pointer;">
                    ${isDuplicating ? 'CREATE NEW RECIPE' : 'SAVE CHANGES'}
                </button>
                <button onclick="RecipeEditor.cancel()" style="padding:16px 40px; background:#666; color:white; font-weight:bold; font-size:18px; border:none; border-radius:12px;">
                    CANCEL
                </button>
                ${deleteBtn}
                ${duplicateBtn}
            `;
            ingredientsBox.after(buttonRow);
        }
        // Store original name in a hidden input or data attribute ===
        const editForm = document.getElementById("editArea");
        if (editForm) {
            // Create or update a hidden input to track original name
            let originalNameInput = editForm.querySelector('#originalRecipeName');
            if (!originalNameInput) {
                originalNameInput = document.createElement('input');
                originalNameInput.type = 'hidden';
                originalNameInput.id = 'originalRecipeName';
                editForm.appendChild(originalNameInput);
            }
            originalNameInput.value = name;  // This is the true original name
        }

        // POPULATE FIELDS
        const nameField = document.getElementById("editItemName");
        nameField.value = isDuplicating ? name + " (Copy)" : name;
        if (isDuplicating) {
            nameField.focus();
            nameField.select();
        }

        document.getElementById("editYield").value = r.y || 1;
        document.getElementById("editWeight").value = (r.weight || 0).toFixed(2);

        // Populate ingredients
        const container = document.getElementById("editIngredients");
        container.innerHTML = "";
        Object.entries(r.i || {}).forEach(([ing, qty]) => {
            RecipeEditor.addRow("edit");
            const rows = container.querySelectorAll(".ingredient-row");
            const last = rows[rows.length - 1];
            last.querySelector("input[type=text]").value = ing;
            last.querySelector("input[type=number]").value = qty;
        });
        document.getElementById("editArea").scrollIntoView({ behavior: "instant", block: "start" });
        refreshAllStockLists();
    },

    duplicate() {
        // Get the current recipe name from the edit form
        const nameField = document.getElementById("editItemName");
        if (!nameField || !nameField.value.trim()) {
            return showToast("fail", "No recipe loaded to duplicate!");
        }

        const currentName = nameField.value.trim();

        if (!App.state.recipes[currentName]) {
            return showToast("fail", "Recipe not found!");
        }

        // Change title to show we're duplicating
        const title = document.querySelector("#editArea h2") || document.querySelector("#editArea strong");
        if (title) {
            title.innerHTML = `Duplicating: <span style="color:#ff0; font-weight:bold;">${currentName}</span> → Edit and Save as New`;
        }

        // Pre-fill name with "(Copy)" and select it
        nameField.value = currentName + " (Copy)";
        nameField.focus();
        nameField.select(); // highlights the text so user can type new name immediately

        // Hide Delete button (doesn't exist yet)
        const deleteBtn = document.querySelector('#editArea button[onclick*="RecipeEditor.del()"]');
        if (deleteBtn) deleteBtn.style.display = "none";

        // Change Save button text
        const saveBtn = document.querySelector('#editArea button[onclick="RecipeEditor.save()"]');
        if (saveBtn) saveBtn.textContent = "CREATE NEW RECIPE";
        document.getElementById("editArea").scrollIntoView({ behavior: "instant", block: "start" });
        showToast("success", `"${currentName}" loaded for duplication — edit and click CREATE NEW RECIPE`);
    },

    duplicateFromList(itemName) {
        // Exactly the same as clicking "Edit" — just loads the recipe into the form
        this.load(itemName);

        // Pre-fill the name with "(Copy)" so it's ready to rename
        const nameField = document.getElementById("editItemName");
        if (nameField) {
            nameField.value = itemName + " (Copy)";
            nameField.focus();
            nameField.select(); // highlights the text so user can type new name immediately
        }

        showToast("success", `"${itemName}" loaded for duplication — edit and save as new recipe`);
    },

    save() {
        const newNameRaw = document.getElementById("editItemName")?.value.trim();
        if (!newNameRaw) return showToast("fail", "Recipe name required!");

        const properNewName = toProperCase(sanitizeItemName(newNameRaw));
        if (!properNewName) return showToast("fail", "Invalid recipe name!");

        // FIXED: Get original name from hidden field in edit form
        const originalNameInput = document.querySelector("#editArea #originalRecipeName");
        const originalName = originalNameInput?.value.trim() || "";

        // Now this check works correctly
        const nameExists = App.state.recipes[properNewName] && properNewName !== originalName;

        if (nameExists) {
            showConfirm(`A recipe named "${properNewName}" already exists.<br><br>Overwrite it?`,
                () => this.performSave(properNewName, originalName),
                () => showToast("info", "Save cancelled – no changes made")
            );
            return;
        }

        // No conflict — save immediately with toast
        this.performSave(properNewName, originalName);
    },

    // Helper method to do the actual save (keeps code clean and avoids duplication)
    performSave(properNewName, originalName) {
        const editContainer = document.getElementById("editIngredients");
        if (!editContainer) {
            showToast("fail", "Edit form container not found – cannot save ingredients");
            return;
        }


        /* const ingredients = {}; SAVE TESTING!!!!
        const rows = editContainer.querySelectorAll(".ingredient-row");

        console.log(`Found ${rows.length} ingredient rows when saving`);

        rows.forEach((row, index) => {
            const ingInput = row.querySelector('input[type="text"]');
            const qtyInput = row.querySelector(".qty-input");
            const typeSelect = row.querySelector(".usage-type");

            const ingName = ingInput?.value?.trim() || "(no name)";

            console.group(`Row ${index + 1} — ${ingName}`);

            console.log("  - Text input exists:", !!ingInput);
            console.log("  - Qty input exists:", !!qtyInput);
            console.log("  - Type select exists:", !!typeSelect);

            if (!ingName) {
                console.warn("  → Skipped: no ingredient name");
                console.groupEnd();
                return;
            }

            let rawValue = 0;
            if (qtyInput) {
                rawValue = parseFloat(qtyInput.value) || 0;
                console.log("  - Raw value from input:", qtyInput.value, "→ parsed:", rawValue);
            } else {
                console.warn("  - No .qty-input found — using fallback");
            }

            const usageType = typeSelect?.value || "unknown";
            console.log("  - Selected usage type:", usageType);

            if (rawValue <= 0) {
                console.warn("  → Skipped: value ≤ 0");
                console.groupEnd();
                return;
            }

            let savedValue;
            if (usageType === "percent") {
                const percent = Math.min(100, Math.max(0.1, rawValue));
                savedValue = { percent: percent };
                console.log("  → Saving as PERCENT:", savedValue);
            } else {
                savedValue = Math.round(rawValue);
                console.log("  → Saving as FULL quantity:", savedValue);
            }

            ingredients[ingName] = savedValue;
            console.groupEnd();
        });

        console.log("Final ingredients object to be saved:", ingredients);
 */

        // Build recipe
        const ingredients = {};
        const rows = editContainer.querySelectorAll(".ingredient-row");
        if (rows.length === 0) {
            showToast("warning", "No ingredients added – saving empty recipe");
        }

        rows.forEach(row => {
            const ingInput = row.querySelector('input[type="text"]');
            const qtyInput = row.querySelector(".qty-input");
            const typeSelect = row.querySelector(".usage-type");

            const ing = ingInput?.value?.trim();
            if (!ing) return;

            const rawValue = parseFloat(qtyInput?.value) || 0;
            if (rawValue <= 0) return;

            const usageType = typeSelect?.value;

            if (usageType === "percent") {
                const percent = Math.min(100, Math.max(0.1, rawValue));
                ingredients[ing] = { percent: percent };
            } else {
                // Full consume – store as number (classic format)
                ingredients[ing] = Math.round(rawValue); // or keep float if you prefer
            }
        });

        const yieldInput = document.getElementById("editYield");
        const weightInput = document.getElementById("editWeight");

        const recipe = {
            i: ingredients,
            y: parseInt(yieldInput?.value) || 1,
            weight: weightInput ? parseFloat(weightInput.value) || 0 : 0
        };

        // Debug: log what we're about to save
        console.log("Saving recipe:", properNewName, recipe);

        // ─── Name change handling ───
        if (originalName && originalName !== properNewName) {
            delete App.state.recipes[originalName];
            // Firestore delete (already in your code)
            SHARED_DOC_REF.update({
                [`recipes.${originalName}`]: firebase.firestore.FieldValue.delete()
            }).catch(err => console.warn("Firestore delete failed:", err));
        }

        App.state.recipes[properNewName] = recipe;
        App.save("recipes").then(() => {
            console.log("Save completed:", properNewName);
            showToast("success", `"${properNewName}" saved (${Object.keys(ingredients).length} ingredients)`);

            document.getElementById("editArea").style.display = "none";
            RecipeEditor.renderRecipeTable();           // full refresh
            RecipeEditor.filterRecipes("");             // show all
        }).catch(err => {
            console.error("Save failed:", err);
            showToast("fail", "Failed to save recipe");
        });
    },

    async del() {
        if (!hasPermission("canDeleteRecipes")) {
            showToast("fail", "You do not have permission to delete recipes");
            return;
        }
        const nameField = document.getElementById("editItemName");
        if (!nameField) return showToast("fail", "No recipe loaded!");

        const name = nameField.value.trim();
        if (!name) return showToast("fail", "No recipe name to delete!");

        const ok = await showConfirm(`Permanently delete "${name}"? This cannot be undone.`);
        if (!ok) return;

        // Remove from local state
        delete App.state.recipes[name];

        // Safe delete from Firestore (only if name exists)
        try {
            await SHARED_DOC_REF.update({
                [`recipes.${name}`]: firebase.firestore.FieldValue.delete()
            });
            console.log("Recipe deleted:", name);
        } catch (err) {
            console.warn("Failed to delete from Firestore (may already be gone):", err);
        }

        App.refresh();
        debouncedCalcRun();

        document.getElementById("editArea").style.display = "none";
        document.getElementById("recipeSearch").value = "";

        showToast("success", `"${name}" deleted`);
        RecipeEditor.renderRecipeTable();
    },

    cancel() {
        // Clear the form
        document.getElementById("editArea").innerHTML = "";
        document.getElementById("editArea").style.display = "none";

        // Clear any current editing state
        this.currentEditing = null;

        // Refresh the table to show we're back to list view
        RecipeEditor.render();

        showToast("info", "Edit cancelled");
    },

    showCreateForm() {
        const section = document.getElementById("createRecipeSection");
        if (section) {
            section.style.display = "block";

            // Scroll to it
            section.scrollIntoView({ behavior: "smooth", block: "start" });

            // Focus the name field
            document.getElementById("newItemName")?.focus();
        }
    },

    cancelCreate() {
        const section = document.getElementById("createRecipeSection");
        if (section) {
            section.style.display = "none";
        }
        // Clear all fields in the Create New form
        document.getElementById("newItemName").value = "";
        document.getElementById("newItemYield").value = "1";
        const weightInput = document.getElementById("newItemWeight");
        if (weightInput) weightInput.value = "0.00";

        // Clear ingredients
        document.getElementById("newIngredients").innerHTML = "";
        this.addRow("new"); // add one empty row back

        showToast("info", "Create cancelled — form cleared");
    },

    renderRecipeTable() {
        this.filterRecipes("");  // "" means show all
    },

    // Auto-fix ledger entries to match proper-cased recipe names
    fixLedgerCases() {
        const toProperCase = (str) => str
            .toLowerCase()
            .replace(/(^|\s|-)\w/g, l => l.toUpperCase())
            .replace(/#/g, ' #');

        let fixed = 0;
        App.state.ledger = App.state.ledger.map(entry => {
            if (entry.type !== "shop_sale_item") return entry;

            const properName = toProperCase(entry.item);
            if (properName !== entry.item) {
                entry.item = properName;
                fixed++;
            }
            return entry;
        });

        if (fixed > 0) {
            App.save("ledger").then(() => {
                console.log(`Auto-fixed ${fixed} ledger entries`);
                showToast("info", `Auto-fixed ${fixed} sales entries`);
                ShopSales.render();
                Ledger.render?.();
            });
        }
    }
};

// AUTO-FIX: Proper Case for Recipe Names — SAFE & RELIABLE
(function safeAutoFixRecipeNames() {
    const toProperCase = (str) => str
        .toLowerCase()
        .replace(/(^|\s|-)\w/g, l => l.toUpperCase())
        .replace(/#/g, ' #');

    // Wait for App to be ready
    const tryFix = () => {
        if (typeof App === 'undefined' || !App.state || !App.state.recipes) {
            // App not ready yet — try again in 200ms
            setTimeout(tryFix, 200);
            return;
        }

        let fixed = 0;
        const newRecipes = {};

        Object.keys(App.state.recipes).forEach(oldName => {
            const properName = toProperCase(oldName);
            if (properName !== oldName) {
                console.log(`Auto-fixed recipe: "${oldName}" → "${properName}"`);
                fixed++;
            }
            newRecipes[properName] = App.state.recipes[oldName];
        });

        if (fixed > 0) {
            App.state.recipes = newRecipes;
            App.save("recipes").then(() => {
                console.log(`Auto-fixed ${fixed} recipe names!`);
                showToast("info", `Auto-fixed ${fixed} recipe names`);
                if (typeof RecipeEditor !== 'undefined' && RecipeEditor.renderRecipeTable) {
                    RecipeEditor.renderRecipeTable();
                }
                if (typeof RecipeEditor !== 'undefined' && RecipeEditor.fixLedgerCases) {
                    RecipeEditor.fixLedgerCases();
                }
            });
        }
    };

    // Start checking
    tryFix();
})();

function applyRecipePermissions() {
    const createButtonContainer = document.querySelector("#recipeTable th:last-child div");
    const createButton = document.querySelector("#recipeTable button[onclick*='showCreateForm']");

    if (hasPermission("canEditRecipes")) {
        if (createButton) createButton.style.display = "block";
        if (createButtonContainer) createButtonContainer.innerHTML = `
            <button onclick="RecipeEditor.showCreateForm()"
                style="background:rgb(189, 192, 20); color:black; font-weight:bold; font-size:16px; border:none; border-radius:12px; cursor:pointer;">
                + CREATE NEW RECIPE
            </button>
        `;
    } else {
        if (createButton) createButton.style.display = "none";
        if (createButtonContainer) {
            createButtonContainer.innerHTML = `<span style="color:#666; font-style:italic;">(Create restricted)</span>`;
        }
    }
}