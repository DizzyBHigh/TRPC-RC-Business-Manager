
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
		const now = new Date(); // capture timestamp FIRST
		const nowISO = now.toISOString();
		const initialOverall = Math.round((water + ground + light) / 3);

		pot.history.push({
			recordedAt: nowISO,
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
				if (pot.harvested) {
					// Use the age from the harvest history entry (fixed at harvest time)
					const harvestEntry = pot.history?.findLast(e => e.stageName === "Harvested");
					ageDisplay = harvestEntry?.ageDisplay || "—";
					// Or fallback to pot.harvest.date if no history entry has age
					if (ageDisplay === "—") {
						const harvestTime = new Date(pot.harvest?.date);
						const planted = new Date(pot.plant.plantedAt);
						const ageMs = harvestTime - planted;
						const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
						const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
						ageDisplay = `${totalHours}h ${remainingMinutes}m`;
					}
				} else {
					// Normal active plant: current age
					const planted = new Date(pot.plant.plantedAt);
					const now = new Date();
					const ageMs = now - planted;
					const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
					const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
					ageDisplay = `${totalHours}h ${remainingMinutes}m`;
				}
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
				<style="color:#aaa;">
					${hasPlant
						? `${pot.plant.strain} ${pot.plant.sex === 'Female' ? '♀' : '♂'} • ${ageDisplay}${pot.harvested ? ' (at harvest)' : ''}`
						: 'Empty pot'
					}
				
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
					? `<span style="color:#27ae60; font-weight:bold;">Harvested (${pot.harvest.buds || 0}g @ ${pot.harvest.quality || 0}%) • Age at harvest: ${ageDisplay}</span>
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

	plantSeed(groupId, potId) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot) return alert("Pot not found");

		this.currentGroupId = groupId;
		this.currentPotId = potId;

		document.getElementById("plantPotInfo").textContent = `Pot: ${pot.label} (prepped Water: ${pot.currentWater}%, Ground: ${pot.currentGround}%)`;
		document.getElementById("plantStrain").value = "";
		document.getElementById("plantNotes").value = "";
		// Default to Female
		document.querySelector('input[name="plantSex"][value="Female"]').checked = true;

		document.getElementById("plantSeedModal").style.display = "flex";
	},

	cancelPlantModal() {
		document.getElementById("plantSeedModal").style.display = "none";
	},

	savePlantSeed() {
		const strain = document.getElementById("plantStrain").value.trim();
		if (!strain) return alert("Enter a strain name");

		const sexRadio = document.querySelector('input[name="plantSex"]:checked');
		if (!sexRadio) return alert("Select plant sex");
		const sex = sexRadio.value;

		const notes = document.getElementById("plantNotes").value.trim();

		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot) return;

		const now = new Date();
		const nowISO = now.toISOString();

		pot.plant = {
			strain,
			sex,                    // "Female" or "Male"
			plantedAt: nowISO,
			notes,
			currentStage: "Seedling",
			stagePercent: 0,
			healthPercent: 100
		};

		// Add initial history entry
		pot.history.push({
			recordedAt: nowISO,
			ageDisplay: "0h 0m",
			stageName: "Seedling",
			stagePercent: 0,
			healthPercent: 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: Math.round((pot.currentWater + pot.currentGround + 100 + pot.currentLight) / 4),
			notes: `Seed planted – ${sex} (${strain})${notes ? ' – ' + notes : ''} – initial state (Health 100%)`
		});

		App.save("growGroups");
		this.cancelPlantModal();
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
		document.getElementById("updateTimeContainer").style.display = 'block'; // visible for new updates
		document.getElementById("updateAge").value = ageDisplay;
		document.getElementById("updateStageName").value = latest.stageName || "Seedling";
		document.getElementById("updateStagePercent").value = latest.stagePercent || 0;
		document.getElementById("updateHealth").value = latest.healthPercent || 100;
		document.getElementById("updateWater").value = latest.waterPercent || pot.currentWater || 0;
		document.getElementById("updateGround").value = latest.groundPercent || pot.currentGround || 0;
		document.getElementById("updateLight").value = latest.lightPercent || pot.currentLight || 0;
		document.getElementById("updateOverall").value = Math.round(avgOverall);

		document.getElementById("updateNotes").value = "";
		this.editingHistoryIndex = undefined; // new update

		document.getElementById("updatePlantModal").style.display = "flex";
	},

	cancelUpdateModal() {
		document.getElementById("updatePlantModal").style.display = "none";
	},

	saveUpdate() {
		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot || !pot.plant) return alert("Plant not found");

		const now = new Date(); // FIRST
		const nowISO = now.toISOString();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const update = {
			// When editing, keep ORIGINAL recordedAt — do NOT use the time field
			// recordedAt is NEVER overwritten when editing
			recordedAt: this.editingHistoryIndex !== undefined
				? pot.history[this.editingHistoryIndex].recordedAt  // keep original
				: now.toISOString(),                                // only new updates get current time
					
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

		if (this.editingHistoryIndex !== undefined && this.editingHistoryIndex >= 0) {
			// Editing existing entry – overwrite
			pot.history[this.editingHistoryIndex] = update;
			this.editingHistoryIndex = undefined; // reset flag
		} else {
			// New update
			if (!pot.history) pot.history = [];
			pot.history.push(update);
		  }

		App.save("growGroups");
		// Refresh history modal if it's currently open
		if (document.getElementById("historyModal").style.display === "flex") {
			this.viewHistory(this.currentGroupId, this.currentPotId);
		}
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
		const now = new Date(); // FIRST
		const nowISO = now.toISOString();
		const planted = pot.plant ? new Date(pot.plant.plantedAt) : now;
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			recordedAt: nowISO,
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
			recordedAt: nowISO,
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
		const now = new Date(); // FIRST
		const nowISO = now.toISOString();
		const planted = pot.plant ? new Date(pot.plant.plantedAt) : now;
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			recordedAt: nowISO,
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
			recordedAt: nowISO,
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

		// Sort history by time (earliest first, oldest at top)
		const sortedHistory = [...pot.history].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

		sortedHistory.forEach((entry, displayIndex) => {
			// Find the ORIGINAL index in pot.history
			const originalIndex = pot.history.findIndex(h => h.recordedAt === entry.recordedAt);

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
					: entry.stageName || '—'
				}
			  </td>
			  <td style="padding:10px; text-align:center; border-bottom:1px solid #333; white-space:nowrap;">
				<button class="edit-history-btn" data-original-index="${originalIndex}">Edit</button>
				<button class="delete-history-btn" data-original-index="${originalIndex}">Delete</button>
			</td>
			`;

			// Attach listeners using data attribute
			row.querySelector('.edit-history-btn').addEventListener('click', () => {
				const origIndex = parseInt(row.querySelector('.edit-history-btn').dataset.originalIndex);
				GrowManager.editHistoryEntry(groupId, potId, origIndex);
			});

			row.querySelector('.delete-history-btn').addEventListener('click', () => {
				const origIndex = parseInt(row.querySelector('.delete-history-btn').dataset.originalIndex);
				GrowManager.deleteHistoryEntry(groupId, potId, origIndex);
			});

			tbody.appendChild(row);
		  });

		document.getElementById("historyModal").style.display = "flex";
	},

	closeHistoryModal() {
		document.getElementById("historyModal").style.display = "none";
	  },

	editHistoryEntry(groupId, potId, index) {
		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot || !pot.history?.[index]) return alert("Entry not found");

		const entry = pot.history[index];

		// Re-use the update modal (or create a separate one if you prefer)
		document.getElementById("updateModalTitle").textContent = `Edit History Entry #${index + 1}`;
		document.getElementById("updateTimeContainer").style.display = 'block'; // still show it, just locked
		// Show original time READ-ONLY as display (not editable)
		document.getElementById("updateTimeDisplay").textContent = new Date(entry.recordedAt).toLocaleString([], {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});

		document.getElementById("updateAge").value = entry.ageDisplay || '';
		document.getElementById("updateStageName").value = entry.stageName || 'Seedling';
		document.getElementById("updateStagePercent").value = entry.stagePercent || 0;
		document.getElementById("updateHealth").value = entry.healthPercent || 0;
		document.getElementById("updateWater").value = entry.waterPercent || 0;
		document.getElementById("updateGround").value = entry.groundPercent || 0;
		document.getElementById("updateLight").value = entry.lightPercent || 0;
		document.getElementById("updateOverall").value = entry.overallPercent || 0;
		document.getElementById("updateNotes").value = entry.notes || '';

		// Remember we're editing an existing entry
		this.editingHistoryIndex = index;

		document.getElementById("updatePlantModal").style.display = "flex";
	},

	deleteHistoryEntry(groupId, potId, index) {
		if (!confirm("Delete this history entry? This cannot be undone.")) return;

		const group = App.state.growGroups.find(g => g.id === groupId);
		const pot = group?.pots.find(p => p.id === potId);
		if (!pot || !pot.history?.[index]) return;

		pot.history.splice(index, 1);

		// Optional: re-calculate current values from last remaining entry
		if (pot.history.length > 0) {
			const last = pot.history[pot.history.length - 1];
			pot.currentWater = last.waterPercent;
			pot.currentGround = last.groundPercent;
			pot.currentLight = last.lightPercent;
		} else {
			// If no history left, reset to initial pot values
			pot.currentWater = pot.initialWater || 0;
			pot.currentGround = pot.initialGround || 0;
			pot.currentLight = pot.initialLight || 0;
		}

		App.save("growGroups");
		this.viewHistory(groupId, potId); // refresh modal
		this.renderPots(); // refresh pot card
		// Refresh history modal if it's currently open
		
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

		// Show correct section based on sex
		if (pot.plant.sex === "Female") {
			document.getElementById("femaleHarvest").style.display = "block";
			document.getElementById("maleHarvest").style.display = "none";
			document.getElementById("harvestBuds").value = "";
			document.getElementById("harvestQuality").value = "";
		} else {
			document.getElementById("femaleHarvest").style.display = "none";
			document.getElementById("maleHarvest").style.display = "block";
			document.getElementById("harvestSeedStrain").value = ""; // can be different
			document.getElementById("harvestSeedsCount").value = "";
		}
		document.getElementById("harvestNotes").value = "";

		document.getElementById("harvestModal").style.display = "flex";
	},

	cancelHarvestModal() {
		document.getElementById("harvestModal").style.display = "none";
	},

	saveHarvest() {
		const group = App.state.growGroups.find(g => g.id === this.currentGroupId);
		const pot = group?.pots.find(p => p.id === this.currentPotId);
		if (!pot || !pot.plant) return;

		const now = new Date();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			stageName: pot.plant.currentStage || "Flowering",
			stagePercent: pot.plant.stagePercent || 100,
			healthPercent: pot.plant.healthPercent || 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: 0
		};

		let harvestUpdate = {
			recordedAt: now.toISOString(),
			ageDisplay,
			stageName: "Harvested",
			stagePercent: 100,
			healthPercent: latest.healthPercent,
			waterPercent: pot.currentWater,
			groundPercent: pot.currentGround,
			lightPercent: pot.currentLight,
			overallPercent: latest.overallPercent,
			notes: document.getElementById("harvestNotes").value.trim() || "Harvest completed"
		};

		if (pot.plant.sex === "Female") {
			const buds = parseFloat(document.getElementById("harvestBuds").value) || 0;
			const quality = parseFloat(document.getElementById("harvestQuality").value) || 0;
			if (buds <= 0) return alert("Enter a positive bud amount");

			harvestUpdate.harvestType = "Female";
			harvestUpdate.harvestBuds = buds;
			harvestUpdate.harvestQuality = quality;
			harvestUpdate.harvestStrain = pot.plant.strain; // same as planted
		} else {
			const seedStrain = document.getElementById("harvestSeedStrain").value.trim() || pot.plant.strain;
			const seedCount = parseInt(document.getElementById("harvestSeedsCount").value) || 0;
			if (seedCount <= 0) return alert("Enter a positive seed count");

			harvestUpdate.harvestType = "Male";
			harvestUpdate.harvestSeedsStrain = seedStrain;
			harvestUpdate.harvestSeedsCount = seedCount;
		}

		pot.history.push(harvestUpdate);

		pot.harvested = true;
		pot.harvest = {
			date: now.toISOString(),
			type: pot.plant.sex,
			...(pot.plant.sex === "Female" ? {
				buds: harvestUpdate.harvestBuds,
				quality: harvestUpdate.harvestQuality,
				strain: harvestUpdate.harvestStrain
			} : {
				seedStrain: harvestUpdate.harvestSeedsStrain,
				seedCount: harvestUpdate.harvestSeedsCount
			}),
			notes: harvestUpdate.notes
		};

		App.save("growGroups");
		this.cancelHarvestModal();
		this.renderPots();
		alert(`Harvested ${pot.plant.sex === "Female" ? `${harvestUpdate.harvestBuds}g @ ${harvestUpdate.harvestQuality}%` : `${harvestUpdate.harvestSeedsCount} seeds (${harvestUpdate.harvestSeedsStrain})`}! Logged to history.`);
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