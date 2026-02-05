// ====================================
// CATEGORIES WITH FULL DRAG & DROP ORDERING
// ====================================
const Categories = {
    render() {
        const container = document.getElementById("categoryList");
        container.innerHTML = `
                <div class="controls">
                        <input type="text" id="newCategoryName" placeholder="New category name..." style="padding:12px;width:300px;">
                        <button class="success" onclick="Categories.add()">+ Add Category</button>
                    </div>
                `;

        // Get categories in saved order (or alphabetical if none saved)
        const orderedCats = App.state.categoryOrder && Array.isArray(App.state.categoryOrder)
            ? App.state.categoryOrder.filter(cat => App.state.categories[cat])
            : Object.keys(App.state.categories).sort();

        // Add any missing categories to the end
        const allCats = Object.keys(App.state.categories);
        const missing = allCats.filter(cat => !orderedCats.includes(cat));
        const finalOrder = [...orderedCats, ...missing.sort()];

        finalOrder.forEach(cat => {
            const items = App.state.categories[cat] || [];
            const safeId = "addTo_" + cat.replace(/ /g, '_');

            const div = document.createElement("div");
            div.className = "category-block draggable-category";
            div.dataset.category = cat;
            div.innerHTML = `
                        <div class="category-header" style="cursor:move; background:var(--card); padding:10px; border-radius:8px 8px 0 0; border:1px solid var(--border);">
                            <strong>${cat}</strong> <small>(${items.length} items)</small>
                            <button class="danger small" style="float:right;margin-left:8px;" onclick="Categories.remove('${cat}')">Delete</button>
                            <span style="float:right;margin-right:8px;color:#888;">Drag to reorder</span>
                        </div>
                        <div style="background:var(--card);padding:16px;border-radius:0 0 8px 8px;border:1px solid var(--border);border-top:none;">
                            <div class="controls" style="margin-bottom:12px;">
                                <div class="searchable-select" style="width:300px;display:inline-block;">
                                    <input type="text" id="${safeId}" placeholder="Search items to add..." oninput="Categories.filterAdd(this,'${cat}')">
                                    <div class="options" id="${safeId}_options"></div>
                                </div>
                                <button class="success small" onclick="Categories.addItem('${cat}')">+ Add Item</button>
                            </div>
                            <div class="category-items sortable" data-category="${cat}">
                                ${items.map(item => `
                                    <span class="category-pill draggable-item" data-item="${item}" style="cursor:move;">
                                        ${item}
                                        <button class="danger small" style="margin-left:6px;padding:2px 6px;" onclick="Categories.removeItem('${cat}','${item}')">×</button>
                                    </span>
                                `).join("")}
                                ${items.length === 0 ? '<em style="color:#666;">No items yet — add some!</em>' : ''}
                            </div>
                        </div>`;
            container.appendChild(div);
        });

        this.initDragAndDrop();
    },

    initDragAndDrop() {
        // Category reordering
        new Sortable(document.getElementById("categoryList"), {
            handle: ".category-header",
            animation: 150,
            ghostClass: "sortable-ghost",
            chosenClass: "sortable-chosen",
            onEnd: () => {
                const newOrder = Array.from(document.querySelectorAll(".draggable-category"))
                    .map(el => el.dataset.category);
                App.state.categoryOrder = newOrder;
                App.save("categoryOrder");
                console.log("Categories reordered:", newOrder);
            }
        });

        // Item reordering within each category
        document.querySelectorAll(".category-items.sortable").forEach(container => {
            new Sortable(container, {
                group: "items",
                animation: 150,
                ghostClass: "sortable-ghost",
                onEnd: (evt) => {
                    const cat = container.dataset.category;
                    const newItems = Array.from(container.querySelectorAll(".draggable-item"))
                        .map(el => el.dataset.item);

                    App.state.categories[cat] = newItems;
                    App.save("categories");
                    console.log(`Items reordered in ${cat}:`, newItems);
                }
            });
        });
    },

    filterAdd(input, cat) {
        const val = input.value.toLowerCase();
        const opts = document.getElementById(input.id + "_options");
        opts.innerHTML = "";
        opts.style.display = val ? "block" : "none";
        if (!val) return;

        const current = App.state.categories[cat] || [];
        App.allItems()
            .filter(i => !current.includes(i) && i.toLowerCase().includes(val))
            .slice(0, 20)
            .forEach(i => {
                const div = document.createElement("div");
                div.className = "category-item";
                div.textContent = i;
                div.onclick = () => { input.value = i; opts.style.display = "none"; };
                opts.appendChild(div);
            });
    },

    addItem(cat) {
        const input = document.querySelector(`#addTo_${cat.replace(/ /g, '_')}`);
        const item = input.value.trim();
        if (item && App.allItems().includes(item) && !App.state.categories[cat].includes(item)) {
            App.state.categories[cat].push(item);
            App.save("categories");
            input.value = "";
            this.render();
            PriceList.render();
        }
    },

    add() {
        const name = document.getElementById("newCategoryName").value.trim();
        if (name && !App.state.categories[name]) {
            App.state.categories[name] = [];
            App.save("categories");
            document.getElementById("newCategoryName").value = "";
            this.render();
        }
    },

    remove(cat) {
        if (showConfirm(`Delete category "${cat}" and all its items forever?`)) {
            delete App.state.categories[cat];
            if (App.state.categoryOrder) {
                App.state.categoryOrder = App.state.categoryOrder.filter(c => c !== cat);
                App.save("categoryOrder");
            }
            App.save("categories");
            this.render();
        }
    },

    removeItem(cat, item) {
        App.state.categories[cat] = App.state.categories[cat].filter(i => i !== item);
        if (App.state.categories[cat].length === 0) {
            delete App.state.categories[cat];
            if (App.state.categoryOrder) {
                App.state.categoryOrder = App.state.categoryOrder.filter(c => c !== cat);
                App.save("categoryOrder");
            }
        }
        App.save("categories");
        this.render();
        PriceList.render();
    }
};
