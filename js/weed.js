
App.state.growGroups = App.state.growGroups || [];
const GrowManager = {
	currentGroupId: null,
	currentPotId: null,

	// ─── Group CRUD ───
	createGroup() {
		this.currentGroupId = null;
		document.getElementById("groupModalTitle").textContent = "New Grow Group";
		document.getElementById("groupName").value = "";
		document.getElementById("groupStartDate").value = new Date().toISOString().slice(0, 16);
		document.getElementById("groupDesc").value = "";
		document.getElementById("groupModal").style.display = "flex";
	},

	saveGroup() {
		const name = document.getElementById("groupName").value.trim();
		if (!name) return alert("Group name required");

		const start = document.getElementById("groupStartDate").value;
		if (!start) return alert("Select start date/time");

		const group = {
			id: this.currentGroupId || "grow-" + Date.now(),
			name,
			startDate: new Date(start).toISOString(),
			description: document.getElementById("groupDesc").value.trim(),
			createdAt: new Date().toISOString(),
			pots: this.currentGroupId ? (App.state.growGroups.find(g => g.id === this.currentGroupId)?.pots || []) : []
		};

		if (this.currentGroupId) {
			const idx = App.state.growGroups.findIndex(g => g.id === this.currentGroupId);
			if (idx !== -1) App.state.growGroups[idx] = group;
		} else {
			App.state.growGroups.push(group);
		}

		App.save("growGroups");
		this.cancelGroupModal();
		this.renderGroups();
	},

	editGroup(id) {
		const group = App.state.growGroups.find(g => g.id === id);
		if (!group) return alert("Group not found");

		this.currentGroupId = id;
		document.getElementById("groupModalTitle").textContent = "Edit Grow Group";
		document.getElementById("groupName").value = group.name;
		document.getElementById("groupStartDate").value = new Date(group.startDate).toISOString().slice(0, 16);
		document.getElementById("groupDesc").value = group.description || "";
		document.getElementById("groupModal").style.display = "flex";
	},

	deleteGroup(id) {
		if (!confirm("Delete this grow group and all pots/plants? This cannot be undone.")) return;
		App.state.growGroups = App.state.growGroups.filter(g => g.id !== id);
		App.save("growGroups");
		this.renderGroups();
	},

	viewGroup(id) {
		this.currentGroupId = id;
		const group = App.state.growGroups.find(g => g.id === id);
		if (!group) return alert("Group not found");

		document.getElementById("potsGroupTitle").textContent = `${group.name} - Pots`;
		document.getElementById("groupList").style.display = "none";
		document.getElementById("potsView").style.display = "block";
		this.renderPots();
	},

	cancelGroupModal() {
		document.getElementById("groupModal").style.display = "none";
	},

	backToGroups() {
		document.getElementById("potsView").style.display = "none";
		document.getElementById("groupList").style.display = "block";
		this.currentGroupId = null;
	},

	renderGroups() {
		const container = document.getElementById("groupList");
		container.innerHTML = "";

		if (App.state.growGroups.length === 0) {
			container.innerHTML = "<p style='text-align:center; color:#888;'>No grow groups yet. Start one above.</p>";
			return;
		}

		App.state.growGroups.forEach(group => {
			const potsCount = group.pots?.length || 0;
			const div = document.createElement("div");
			div.style.cssText = "background:#111; padding:16px; margin:12px 0; border-radius:8px; border:1px solid #333;";
			div.innerHTML = `
		  <div style="display:flex; justify-content:space-between; align-items:center;">
			<div>
			  <strong style="font-size:1.3em;">${group.name}</strong><br>
			  <small>Started: ${new Date(group.startDate).toLocaleDateString()} ${new Date(group.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
			</div>
			<div>
			  <button onclick="GrowManager.editGroup('${group.id}')">Edit</button>
			  <button onclick="GrowManager.deleteGroup('${group.id}')" style="background:#c00;">Delete</button>
			  <button onclick="GrowManager.viewGroup('${group.id}')">View Pots (${potsCount})</button>
			</div>
		  </div>
		  <p style="margin-top:12px; color:#aaa;">${group.description || "(no description)"}</p>
		`;
			container.appendChild(div);
		});
	},

	// ─── Pots ───
	addPot() {
		if (!this.currentGroupId) return alert("No group selected");
		this.currentPotId = null;
		document.getElementById("potModalTitle").textContent = "New Pot";
		document.getElementById("potLabel").value = "";
		document.getElementById("potWater").value = "0";
		document.getElementById("potGround").value = "0";
		document.getElementById("potLight").value = "75";
		document.getElementById("potModal").style.display = "flex";
	},

	cancelPotModal() {
		document.getElementById("potModal").style.display = "none";
	},

	savePot() {
		const label = document.getElementById("potLabel").value.trim();
		if (!label) return alert("Pot label required");

		const water = parseInt(document.getElementById("potWater").value) || 0;
		const ground = parseInt(document.getElementById("potGround").value) || 0;
		const light = parseInt(document.getElementById("potLight").value) || 0;

		const pot = {
			id: this.currentPotId || "pot-" + Date.now(),
			label,
			initialWater: water,
			initialGround: ground,
			initialLight: light,
			currentWater: water,
			currentGround: ground,
			currentLight: light,
			plant: null,          // set when seed planted
			history: [],
			actions: []
		};

		// Create initial history entry (pot creation snapshot)
		const now = new Date();
		const initialOverall = Math.round((water + ground + light) / 3);

		pot.history.push({
			recordedAt: now.toISOString(),
			ageDisplay: "0h 0m",
			stageName: "—",
			stagePercent: 0,
			healthPercent: "—",
			waterPercent: water,
			groundPercent: ground,
			lightPercent: light,
			overallPercent: initialOverall,
			notes: "Pot created – initial prep values set"
		});

		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		if (!group) return alert("Group not found");

		if (this.currentPotId) {
			const idx = group.pots.findIndex(p => p.id === this.currentPotId);
			if (idx !== -1) group.pots[idx] = pot;
		} else {
			group.pots.push(pot);
		}

		App.save("growGroups");
		this.cancelPotModal();
		this.renderPots();
	},

	renderPots() {
		const container = document.getElementById("potsList");
		container.innerHTML = "";
		
		// Grid: 2 columns on wide screens, 1 on narrow
		container.style.cssText = `
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
			gap: 20px;
			padding: 10px;
		`;

		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		if (!group || !group.pots.length) {
			container.innerHTML = "<p style='text-align:center; color:#888; padding:40px;'>No pots yet. Add one above.</p>";
			return;
		}

		group.pots.forEach(pot => {
			const hasPlant = !!pot.plant;

			// Latest values
			let stageDisplay = "—";
			let health = 0;
			let water = pot.currentWater || 0;
			let ground = pot.currentGround || 0;
			let light = pot.currentLight || 0;
			let overall = 0;

			if (hasPlant) {
				const latest = pot.history?.length ? pot.history[pot.history.length - 1] : null;
				if (latest) {
					stageDisplay = `${latest.stageName || "—"} ${latest.stagePercent}%`;
					stage = latest.stagePercent;
					health = latest.healthPercent || 100;
					water = latest.waterPercent;
					ground = latest.groundPercent;
					light = latest.lightPercent;
					overall = latest.overallPercent;
				} else {
					stageDisplay = `${pot.plant.currentStage || "Seedling"} ${pot.plant.stagePercent || 0}%`;
					health = pot.plant.healthPercent || 100;
				}
			} else {
				// Empty pot — just prep values
				overall = Math.round((water + ground + light) / 3);
			}

			// Age
			let ageDisplay = "—";
			if (hasPlant) {
				const planted = new Date(pot.plant.plantedAt);
				const now = new Date();
				const ageMs = now - planted;
				const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
				const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
				ageDisplay = `${totalHours}h ${remainingMinutes}m`;
			}

			const div = document.createElement("div");
			div.style.cssText = `
				background:#0d1117;
				border:1px solid #222;
				border-radius:12px;
				padding:16px;
				box-shadow:0 4px 10px rgba(0,0,0,0.5);
				min-height: 280px; /* consistent height */
				display: flex;
				flex-direction: column;
			`;
			div.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
			  <div>
				<strong style="font-size:1.3em;">${pot.label}</strong>
				<br>
				<small style="color:#aaa;">
				  ${hasPlant ? pot.plant.strain + ' • ' + ageDisplay : 'Empty pot'}
				</small>
			  </div>
			</div>
	  
			<!-- Progress bars -->
			<div style="margin:12px 0;">
			  ${hasPlant ? `
				<div style="margin-bottom:8px;">
				  <label>Health: ${health}%</label>
				  <div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
					<div style="background:#e74c3c; width:${health}%; height:100%;"></div>
				  </div>
				</div>
				<div style="margin-bottom:8px;">
				  <label >Stage: ${stageDisplay}</label>
				  <div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
					<div style="background:#FB8607; width:${stage || 0}%; height:100%;"></div>
				  </div>
				</div>
			  ` : ''}
			  <div style="margin-bottom:8px;">
				<label>Water: ${water}%</label>
				<div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
				  <div style="background:#3498db; width:${water}%; height:100%;"></div>
				</div>
			  </div>
			  <div style="margin-bottom:8px;">
				<label>Ground: ${ground}%</label>
				<div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
				  <div style="background:#44BD32; width:${ground}%; height:100%;"></div>
				</div>
			  </div>
			  <div style="margin-bottom:8px;">
				<label>Light: ${light}%</label>
				<div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
				  <div style="background:#f1c40f; width:${light}%; height:100%;"></div>
				</div>
			  </div>
			  <div>
				<label>Overall: ${overall}%</label>
				<div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
				  <div style="background:#FF44D4; width:${overall}%; height:100%;"></div>
				</div>
			  </div>
			</div>

			<!-- Buttons at bottom -->
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:auto; padding-top:12px; border-top:1px solid #333;">
        <button onclick="GrowManager.waterPlant('${group.id}', '${pot.id}')" 
                style="background:#3498db; color:white; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; flex:1;">
          Water (${water}%)
        </button>
        <button onclick="GrowManager.fertiliserPlant('${group.id}', '${pot.id}')" 
                style="background:#44BD32; color:white; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; flex:1;">
          Fertiliser (${ground}%)
        </button>

        ${hasPlant && !pot.harvested
			? ` <button onclick="GrowManager.updatePlant('${group.id}', '${pot.id}')" style="background:#2ecc71; color:black; flex:1;">Update Status</button>
				<button onclick="GrowManager.harvestPlant('${group.id}', '${pot.id}')" style="background:#FB8607; color:white; flex:1;">Harvest</button>
				<button onclick="GrowManager.viewHistory('${group.id}', '${pot.id}')" style="background:#6c5ce7; color:white; flex:1;">History</button>`
				: (hasPlant && pot.harvested
					? `<span style="color:#27ae60; font-weight:bold;">Harvested (${pot.harvest.buds}g @ ${pot.harvest.quality}%)</span>
					<button onclick="GrowManager.viewHistory('${group.id}', '${pot.id}')" style="background:#6c5ce7; color:white;">History</button>`
					: `<button onclick="GrowManager.plantSeed('${group.id}', '${pot.id}')">Plant Seed</button>`
			   )}

        <button onclick="GrowManager.editPot('${group.id}', '${pot.id}')" style="background:#3498db; color:white; flex:1;">Edit</button>
        <button onclick="GrowManager.deletePot('${group.id}', '${pot.id}')" style="background:#e74c3c; color:white; flex:1;">Delete</button>
      </div>
		  `;
			container.appendChild(div);
		});
	  },

	editPot(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot) return alert("Pot not found");

		this.currentGroupId = groupId;
		this.currentPotId = potId;
		document.getElementById("potModalTitle").textContent = "Edit Pot";
		document.getElementById("potLabel").value = pot.label;
		document.getElementById("potWater").value = pot.initialWater;
		document.getElementById("potGround").value = pot.initialGround;
		document.getElementById("potLight").value = pot.initialLight;
		document.getElementById("potModal").style.display = "flex";
	},

	deletePot(groupId, potId) {
		if (!confirm("Delete this pot?")) return;
		const group = App.state.growGroups.find(g => g.id === groupId);
		if (group) {
			group.pots = group.pots.filter(p => p.id !== potId);
			App.save("growGroups");
			this.renderPots();
		}
	},

	// ─── Plant Seed ───
	plantSeed(groupId, potId) {
		const strain = prompt("Enter strain name (e.g. Green Crack):");
		if (!strain) return;

		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot) return alert("Pot not found");

		pot.plant = {
			strain,
			plantedAt: new Date().toISOString(),
			notes: "",
			currentStage: "Seedling",      // explicit start stage
			stagePercent: 0,               // starts at 0%
			healthPercent: 100             // NEW: explicit initial health 100%
		};

		// Initial update entry with Health 100%
		if (!pot.history) pot.history = [];
		pot.history.push({
			recordedAt: new Date().toISOString(),
			ageDays: 0,
			stageName: "Seedling",
			stagePercent: 0,
			healthPercent: 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: Math.round((pot.currentWater + pot.currentGround + 100 + pot.currentLight) / 4),
			notes: "Seed planted – initial state (Health 100%)"
		});

		App.save("growGroups");
		this.renderPots();
	  },

	updatePlant(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot || !pot.plant) return alert("No plant in this pot");

		this.currentGroupId = groupId;
		this.currentPotId = potId;

		const now = new Date();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;

		// Convert to total hours and remaining minutes
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		// Get latest history entry (if any)
		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			stagePercent: 0,
			healthPercent: 50,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: 0,
			notes: ""
		};

		// Auto-calculate overall as average (can be overridden)
		const avgOverall = (
			Number(latest.waterPercent || 0) +
			Number(latest.groundPercent || 0) +
			Number(latest.healthPercent || 50) +
			Number(latest.lightPercent || 0)
		) / 4;

		document.getElementById("updateModalTitle").textContent = `Update: ${pot.label} - ${pot.plant.strain}`;
		document.getElementById("updatePotInfo").textContent = `Planted: ${planted.toLocaleString()} | Current Age: ${ageDisplay}`;
		document.getElementById("updateTime").value = now.toISOString().slice(0, 16);
		document.getElementById("updateAge").value = ageDisplay;
		document.getElementById("updateStageName").value = latest.stageName || "Seedling";
		document.getElementById("updateStagePercent").value = latest.stagePercent || 0;
		document.getElementById("updateHealth").value = latest.healthPercent || 100;
		document.getElementById("updateWater").value = latest.waterPercent || pot.currentWater || 0;
		document.getElementById("updateGround").value = latest.groundPercent || pot.currentGround || 0;
		document.getElementById("updateLight").value = latest.lightPercent || pot.currentLight || 0;
		document.getElementById("updateOverall").value = Math.round(avgOverall);

		document.getElementById("updateNotes").value = "";

		document.getElementById("updatePlantModal").style.display = "flex";
	},

	cancelUpdateModal() {
		document.getElementById("updatePlantModal").style.display = "none";
	},

	saveUpdate() {
		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot || !pot.plant) return alert("Plant not found");

		const now = new Date();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const update = {
			recordedAt: new Date(document.getElementById("updateTime").value || Date.now()).toISOString(),
			ageDisplay,  // ← NEW: save the formatted age string
			stageName: document.getElementById("updateStageName").value,
			stagePercent: parseFloat(document.getElementById("updateStagePercent").value) || 0,
			healthPercent: parseFloat(document.getElementById("updateHealth").value) || 0,
			waterPercent: parseFloat(document.getElementById("updateWater").value) || 0,
			groundPercent: parseFloat(document.getElementById("updateGround").value) || 0,
			lightPercent: parseFloat(document.getElementById("updateLight").value) || 0,
			overallPercent: parseFloat(document.getElementById("updateOverall").value) || 0,
			notes: document.getElementById("updateNotes").value.trim()
		  };

		// Update current pot values (latest state)
		pot.currentWater = update.waterPercent;
		pot.currentGround = update.groundPercent;
		pot.currentLight = update.lightPercent;

		// Add to history
		if (!pot.history) pot.history = [];
		pot.history.push(update);

		App.save("growGroups");
		this.cancelUpdateModal();
		this.renderPots();
	  },

	// Water Modal
	waterPlant(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot) return alert("Pot not found");

		this.currentGroupId = groupId;
		this.currentPotId = potId;

		document.getElementById("waterPotInfo").textContent = `Current Water: ${pot.currentWater || 0}%`;
		document.getElementById("waterBottles").value = "1";
		document.getElementById("waterModal").style.display = "flex";
	},

	cancelWaterModal() {
		document.getElementById("waterModal").style.display = "none";
	},

	applyWater() {
		const bottles = parseInt(document.getElementById("waterBottles").value) || 0;
		if (bottles < 1) return alert("Enter at least 1 bottle");

		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot) return;

		const addedWater = bottles * 25;
		const oldWater = pot.currentWater || 0;
		pot.currentWater = Math.min(100, oldWater + addedWater);

		// Create history entry
		const now = new Date();
		const planted = pot.plant ? new Date(pot.plant.plantedAt) : now;
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			recordedAt: now.toISOString(),
			ageDisplay,  // ← save age here
			stageName: pot.plant?.currentStage || "Seedling",
			stagePercent: pot.plant?.stagePercent || 0,
			healthPercent: pot.plant?.healthPercent || 100,
			waterPercent: oldWater,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: 0
		};

		const newOverall = Math.round(
			(pot.currentWater + latest.groundPercent + latest.healthPercent + latest.lightPercent) / 4
		);

		const update = {
			recordedAt: now.toISOString(),
			ageDisplay: `${totalHours}h ${remainingMinutes}m`,
			stageName: latest.stageName,
			stagePercent: latest.stagePercent,
			healthPercent: latest.healthPercent,
			waterPercent: pot.currentWater,
			groundPercent: latest.groundPercent,
			lightPercent: latest.lightPercent,
			overallPercent: newOverall,
			notes: `Watered +${bottles} bottle(s) (+${addedWater}%)`
		};

		if (!pot.history) pot.history = [];
		pot.history.push(update);

		App.save("growGroups");
		this.cancelWaterModal();
		this.renderPots();
		alert(`Watered ${bottles} bottle(s) → Water now ${pot.currentWater}%`);
	  },

	// Fertiliser Modal
	fertiliserPlant(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot) return alert("Pot not found");

		this.currentGroupId = groupId;
		this.currentPotId = potId;

		document.getElementById("fertPotInfo").textContent = `Current Ground: ${pot.currentGround || 0}%`;
		document.getElementById("fertType").value = "Basic";
		document.getElementById("fertAmount").value = "1";
		document.getElementById("fertiliserModal").style.display = "flex";
	},

	cancelFertModal() {
		document.getElementById("fertiliserModal").style.display = "none";
	},

	applyFertiliser() {
		const type = document.getElementById("fertType").value;
		const amount = parseInt(document.getElementById("fertAmount").value) || 0;
		if (!type || amount < 1) return alert("Select type and amount");

		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot) return;

		let addedPercent = 0;
		switch (type) {
			case "Basic": addedPercent = amount * 20; break;
			case "Yield": addedPercent = amount * 15; break;
			case "Growth": addedPercent = amount * 10; break;
			case "Black Market": addedPercent = amount * 25; break;
		}

		const oldGround = pot.currentGround || 0;
		pot.currentGround = Math.min(100, oldGround + addedPercent);

		// Create history entry
		const now = new Date();
		const planted = pot.plant ? new Date(pot.plant.plantedAt) : now;
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			recordedAt: now.toISOString(),
			ageDisplay,  // ← save age here
			stageName: pot.plant?.currentStage || "Seedling",
			stagePercent: pot.plant?.stagePercent || 0,
			healthPercent: pot.plant?.healthPercent || 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: oldGround,
			lightPercent: pot.currentLight || 0,
			overallPercent: 0
		};

		const newOverall = Math.round(
			(latest.waterPercent + pot.currentGround + latest.healthPercent + latest.lightPercent) / 4
		);

		const update = {
			recordedAt: now.toISOString(),
			ageDisplay: `${totalHours}h ${remainingMinutes}m`,
			stageName: latest.stageName,
			stagePercent: latest.stagePercent,
			healthPercent: latest.healthPercent,
			waterPercent: latest.waterPercent,
			groundPercent: pot.currentGround,
			lightPercent: latest.lightPercent,
			overallPercent: newOverall,
			notes: `Added ${amount}× ${type} fertiliser (+${addedPercent}% Ground)`
		};

		if (!pot.history) pot.history = [];
		pot.history.push(update);

		App.save("growGroups");
		this.cancelFertModal();
		this.renderPots();
		alert(`Added ${amount}× ${type} → Ground now ${pot.currentGround}%`);
	  },

	viewHistory(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot || !pot.history?.length) {
			alert("No update history yet for this plant.");
			return;
		}

		this.currentGroupId = groupId;
		this.currentPotId = potId;

		document.getElementById("historyModalTitle").textContent = `History: ${pot.label} - ${pot.plant?.strain || 'Plant'}`;

		const tbody = document.getElementById("historyTableBody");
		tbody.innerHTML = "";

		// Sort history by time (oldest first)
		const sortedHistory = [...pot.history].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

		sortedHistory.forEach(entry => {
			const time = new Date(entry.recordedAt).toLocaleString([], {
				year: 'numeric', month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit'
			});

			const row = document.createElement("tr");
			row.innerHTML = `
			<td style="padding:10px; border-bottom:1px solid #333;">${time}</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #333;">${entry.ageDisplay || '—'}</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #333;">${entry.stageName || '—'} ${entry.stagePercent}%</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #333;">${entry.healthPercent || '—'}%</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #3498DB;">${createPercentCircle(entry.waterPercent || 0, '#3498DB')} ${entry.waterPercent || '—'}%</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #44BD32;">${createPercentCircle(entry.groundPercent || 0, '#44BD32')} ${entry.groundPercent || '—'}%</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #F1C40F;">${createPercentCircle(entry.lightPercent || 0, '#f1c40f')} ${entry.lightPercent || '—'}%</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #FF44D4;">${createPercentCircle(entry.overallPercent || 0, '#FF44D4')} ${entry.overallPercent || '—'}%</td>
			<td style="padding:10px; border-bottom:1px solid #333;">${entry.notes || '—'}</td>
			<td style="padding:10px; text-align:center; border-bottom:1px solid #333;">
  ${entry.harvestBuds !== undefined
					? `${entry.harvestBuds}g @ ${entry.harvestQuality}%`
					: entry.stageName || '—'}
</td>
		  `;
			tbody.appendChild(row);
		});

		document.getElementById("historyModal").style.display = "flex";
	},

	closeHistoryModal() {
		document.getElementById("historyModal").style.display = "none";
	  },

	harvestPlant(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot || !pot.plant) return alert("No plant in this pot");

		this.currentGroupId = groupId;
		this.currentPotId = potId;

		const now = new Date();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		document.getElementById("harvestModalTitle").textContent = `Harvest: ${pot.label} - ${pot.plant.strain}`;
		document.getElementById("harvestPotInfo").textContent = `Planted: ${planted.toLocaleString()} | Age: ${ageDisplay}`;
		document.getElementById("harvestBuds").value = "";
		document.getElementById("harvestQuality").value = "";
		document.getElementById("harvestNotes").value = "";

		document.getElementById("harvestModal").style.display = "flex";
	},

	cancelHarvestModal() {
		document.getElementById("harvestModal").style.display = "none";
	},

	saveHarvest() {
		const buds = parseFloat(document.getElementById("harvestBuds").value) || 0;
		const quality = parseFloat(document.getElementById("harvestQuality").value) || 0;
		if (buds <= 0) return alert("Enter a positive bud amount");
		if (quality < 0 || quality > 100) return alert("Quality must be 0–100%");

		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot || !pot.plant) return;

		const now = new Date();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		// Get latest status (for continuity)
		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			stageName: pot.plant.currentStage || "Flowering",
			stagePercent: pot.plant.stagePercent || 100,
			healthPercent: pot.plant.healthPercent || 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: 0
		};

		const harvestUpdate = {
			recordedAt: now.toISOString(),
			ageDisplay,
			stageName: "Harvested",
			stagePercent: 100,
			healthPercent: latest.healthPercent,
			waterPercent: pot.currentWater,
			groundPercent: pot.currentGround,
			lightPercent: pot.currentLight,
			overallPercent: latest.overallPercent,
			harvestBuds: buds,
			harvestQuality: quality,
			notes: document.getElementById("harvestNotes").value.trim() || "Harvest completed"
		};

		// Add to history as final entry
		if (!pot.history) pot.history = [];
		pot.history.push(harvestUpdate);

		// Mark as harvested
		pot.harvested = true;
		pot.harvest = {
			date: now.toISOString(),
			buds,
			quality,
			notes: harvestUpdate.notes
		};

		// Optional: clear current values or keep them frozen
		// pot.currentWater = 0; // or leave as-is

		App.save("growGroups");
		this.cancelHarvestModal();
		this.renderPots();
		alert(`Harvested ${buds}g at ${quality}% quality! Logged to history.`);
	  },
};
function createPercentCircle(percent, color) {
	const radius = 10;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (percent / 100) * circumference;

	return `
	  <svg width="28" height="28" viewBox="0 0 28 28">
		<circle cx="14" cy="14" r="${radius}" fill="none" stroke="#333" stroke-width="4" />
		<circle cx="14" cy="14" r="${radius}" fill="none" stroke="${color}" stroke-width="4"
				stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
				transform="rotate(-90 14 14)" />
		<text x="14" y="18" font-size="10" text-anchor="middle" fill="#fff">
		  ${Math.round(percent)}
		</text>
	  </svg>
	`;
  }
window.addEventListener("load", () => {
	// Ensure data exists
	App.state.growGroups = App.state.growGroups || [];
});