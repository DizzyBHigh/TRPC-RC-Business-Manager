
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
			notes: "Pot created – initial prep values set",
			entryType: "pot-created"   // ← NEW
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

		// Grid layout: 2 columns on wide screens, 1 on narrow
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
			const isHarvested = pot.harvested === true;

			// Get display values — use frozen harvest values if available
			let stageDisplay = "—";
			let health = 0;
			let water = pot.currentWater ?? 0;
			let ground = pot.currentGround ?? 0;
			let light = pot.currentLight ?? 0;
			let overall = 0;
			let stagePercent = 0;

			if (hasPlant) {
				if (isHarvested && pot.harvest) {
					// Prioritize frozen harvest values
					water = pot.harvest.finalWater ?? water;
					ground = pot.harvest.finalGround ?? ground;
					light = pot.harvest.finalLight ?? light;
					health = pot.harvest.finalHealth ?? 100;
					overall = pot.harvest.finalOverall ?? 0;
					stagePercent = 100;
					stageDisplay = "Harvested 100%";
				} else {
					// Active plant: use latest history or plant defaults
					const latest = pot.history?.length ? pot.history[pot.history.length - 1] : null;
					if (latest) {
						stageDisplay = `${latest.stageName || "—"} ${latest.stagePercent}%`;
						stagePercent = latest.stagePercent || 0;
						health = latest.healthPercent || 100;
						water = latest.waterPercent ?? water;
						ground = latest.groundPercent ?? ground;
						light = latest.lightPercent ?? light;
						overall = latest.overallPercent ?? 0;
					} else {
						stageDisplay = `${pot.plant.currentStage || "Seedling"} ${pot.plant.stagePercent || 0}%`;
						stagePercent = pot.plant.stagePercent || 0;
						health = pot.plant.healthPercent || 100;
					}
				}
			} else {
				// Empty pot
				overall = Math.round((water + ground + light) / 3);
			}

			// Age display
			let ageDisplay = "—";
			if (hasPlant) {
				if (pot.harvested) {
					// Prefer saved ageAtHarvest first
					ageDisplay = pot.harvest?.ageAtHarvest || "—";

					// Fallback: calculate from saved harvest date
					if (ageDisplay === "—" && pot.harvest?.date && pot.plant?.plantedAt) {
						const harvestTime = new Date(pot.harvest.date);
						const planted = new Date(pot.plant.plantedAt);
						if (!isNaN(harvestTime) && !isNaN(planted)) {
							const ageMs = harvestTime - planted;
							const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
							const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
							ageDisplay = `${totalHours}h ${remainingMinutes}m`;
						}
					}

					// Ultimate fallback
					if (ageDisplay === "—") {
						ageDisplay = "Unknown";
					}
				} else {
					// Active plant: live age
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
			min-height: 280px;
			display: flex;
			flex-direction: column;
		  `;

			div.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
			  <div>
				<strong style="font-size:1.3em;">${pot.label}</strong>
				<br>
				
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
				  <label>Stage: ${stageDisplay}</label>
				  <div style="background:#333; height:12px; border-radius:6px; overflow:hidden;">
					<div style="background:#FB8607; width:${stagePercent}%; height:100%;"></div>
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
			<div style="display:flex; flex-direction:column; gap:12px; margin-top:auto; padding-top:12px; border-top:1px solid #333;">
			<!-- Harvest summary – shown first (above buttons) for harvested pots -->
			${hasPlant && pot.harvested ? `
				<div style="padding:12px; background:#1a3c1a; border-radius:8px; text-align:center; color:#27ae60; font-weight:bold;">
				Harvested ${pot.harvest?.type === "Female"
									? `${pot.harvest.buds || 0}g @ ${pot.harvest.quality || 0}%`
									: `${pot.harvest?.seedTotal || 0} seeds total`}
				• Age at harvest: ${ageDisplay}
				${pot.harvest?.type === "Male" && pot.harvest?.seeds?.length > 0
									? `<br>${pot.harvest.seeds.map(s => `${s.count} × ${s.strain}`).join(', ')}`
									: ''}
				</div>
			` : ''}

			<!-- Action buttons row -->
			<div style="display:flex; gap:8px; flex-wrap:wrap;">
				<!-- Water & Fertiliser – hidden on harvested -->
				${!pot.harvested ? `
				<button onclick="GrowManager.waterPlant('${group.id}', '${pot.id}')" 
						style="background:#3498db; color:white; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; flex:1;">
					Water (${water}%)
				</button>
				<button onclick="GrowManager.fertiliserPlant('${group.id}', '${pot.id}')" 
						style="background:#44BD32; color:white; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; flex:1;">
					Fertiliser (${ground}%)
				</button>
				` : ''}

				<!-- Plant Seed – empty pots only -->
				${!hasPlant ? `
				<button onclick="GrowManager.plantSeed('${group.id}', '${pot.id}')" style="background:#27ae60; color:white; flex:1;">
					Plant Seed
				</button>
				` : ''}

				<!-- Update Status & Harvest – active plants only -->
				${hasPlant && !pot.harvested ? `
				<button onclick="GrowManager.updatePlant('${group.id}', '${pot.id}')" style="background:#2ecc71; color:black; flex:1;">
					Update Status
				</button>
				<button onclick="GrowManager.harvestPlant('${group.id}', '${pot.id}')" style="background:#FB8607; color:white; flex:1;">
					Harvest
				</button>
				` : ''}

				<!-- History – always for plants with history -->
				${hasPlant ? `
				<button onclick="GrowManager.viewHistory('${group.id}', '${pot.id}')" style="background:#6c5ce7; color:white; flex:1;">
					History
				</button>
				` : ''}

				${hasPlant && pot.plant?.strain ? `
					<button onclick="GrowManager.showStrainRecommendations('${pot.plant.strain.replace(/'/g, "\\'")}')" 
							style="background:#9b59b6; color:white; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; flex:1;">
					  Recommendations for ${pot.plant.strain}
					</button>
				  ` : ''}

				  ${hasPlant && pot.plant?.strain ? `
					<button onclick="GrowManager.showTimelineAnalyzer('${pot.plant.strain.replace(/'/g, "\\'")}')" 
							style="background:#8e44ad; color:white; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; flex:1;">
					  Timeline Analyzer
					</button>
				  ` : ''}

				<!-- Edit & Delete – always -->
				<button onclick="GrowManager.editPot('${group.id}', '${pot.id}')" style="background:#3498db; color:white; flex:1;">
				Edit
				</button>
				<button onclick="GrowManager.deletePot('${group.id}', '${pot.id}')" style="background:#e74c3c; color:white; flex:1;">
				Delete
				</button>
			</div>
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

		// Prepare the update object
		const update = {
			recordedAt: this.editingHistoryIndex !== undefined
				? pot.history[this.editingHistoryIndex].recordedAt  // Preserve original timestamp when editing
				: nowISO,
			ageDisplay: "0h 0m",
			stageName: "Seedling",
			stagePercent: 0,
			healthPercent: 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: Math.round((pot.currentWater + pot.currentGround + 100 + pot.currentLight) / 4),
			notes: `Seed planted – ${sex} (${strain})${notes ? ' – ' + notes : ''} – initial state (Health 100%)`,
			entryType: "seed-planted"
		};

		// Update the plant object
		pot.plant = {
			strain,
			sex,
			plantedAt: this.editingHistoryIndex !== undefined
				? pot.plant.plantedAt  // Keep original planting time when editing
				: nowISO,
			notes,
			currentStage: "Seedling",
			stagePercent: 0,
			healthPercent: 100
		};

		// Save to history
		if (this.editingHistoryIndex !== undefined && this.editingHistoryIndex >= 0) {
			// Editing existing entry
			pot.history[this.editingHistoryIndex] = update;
			this.editingHistoryIndex = undefined; // Reset flag
		} else {
			// New planting
			if (!pot.history) pot.history = [];
			pot.history.push(update);
		}

		App.save("growGroups");
		this.cancelPlantModal();
		this.renderPots();

		// Optional: refresh history modal if it was open
		if (document.getElementById("historyModal").style.display === "flex") {
			this.viewHistory(this.currentGroupId, this.currentPotId);
		}
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
			notes: document.getElementById("updateNotes").value.trim(),
			entryType: "status-update"  // ← NEW
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
					? `${entry.harvestBuds}g @ ${entry.harvestQuality}% (${entry.harvestStrain || '—'})`
					: (entry.harvestType === "Male" && entry.harvestSeeds
						? `${entry.harvestTotalSeeds || 0} seeds total<br>${entry.harvestSeeds.map(s => `${s.count} × ${s.strain}`).join(', ')}`
						: '—')
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
		this.currentGroupId = groupId;
		this.currentPotId = potId;
		this.editingHistoryIndex = index;

		const type = entry.entryType;

		if (type === "harvest") {
			// Open harvest modal
			document.getElementById("harvestModalTitle").textContent = `Edit Harvest Entry #${index + 1}`;

			const harvestTime = new Date(entry.recordedAt).toLocaleString([], {
				year: 'numeric', month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit'
			});
			document.getElementById("harvestPotInfo").textContent = `Fixed time: ${harvestTime}`;

			if (entry.harvestType === "Female" || entry.harvestBuds !== undefined) {
				document.getElementById("femaleHarvest").style.display = "block";
				document.getElementById("maleHarvest").style.display = "none";
				document.getElementById("harvestBuds").value = entry.harvestBuds || "";
				document.getElementById("harvestQuality").value = entry.harvestQuality || "";
			} else {
				document.getElementById("femaleHarvest").style.display = "none";
				document.getElementById("maleHarvest").style.display = "block";
				// For multiple seeds: clear and reload rows
				document.getElementById("seedList").innerHTML = "";
				if (entry.harvestSeeds && entry.harvestSeeds.length > 0) {
					entry.harvestSeeds.forEach(s => addSeedRow(s.strain, s.count));
				} else {
					addSeedRow(entry.harvestSeedsStrain || "", entry.harvestSeedsCount || "");
				}
			}

			document.getElementById("harvestNotes").value = entry.notes || "";

			document.getElementById("harvestModal").style.display = "flex";
		} else if (type === "seed-planted") {
			// Open plant seed modal (pre-filled)
			document.getElementById("plantModalTitle").textContent = `Edit Seed Planting #${index + 1}`;
			document.getElementById("plantStrain").value = pot.plant?.strain || "";
			document.getElementById("plantNotes").value = entry.notes || "";

			if (pot.plant?.sex === "Female") {
				document.querySelector('input[name="plantSex"][value="Female"]').checked = true;
			} else {
				document.querySelector('input[name="plantSex"][value="Male"]').checked = true;
			}

			document.getElementById("plantSeedModal").style.display = "flex";
		} else if (type === "pot-created") {
			// Simple read-only modal or alert
			alert(`This is the initial "Pot Created" entry.\n\nTime: ${new Date(entry.recordedAt).toLocaleString()}\nNotes: ${entry.notes}\n\nWater: ${entry.waterPercent}%, Ground: ${entry.groundPercent}%, Light: ${entry.lightPercent}%\n\nYou can only edit notes if needed (via update modal), but core prep values are fixed.`);
			// Or open update modal with limited fields
			// document.getElementById("updateNotes").value = entry.notes || "";
			// ... open update modal with read-only other fields ...
		} else {
			// Default: status update
			document.getElementById("updateModalTitle").textContent = `Edit Status Update #${index + 1}`;

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

			document.getElementById("updatePlantModal").style.display = "flex";
		}
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
			// If editing an existing harvest entry
			if (this.editingHistoryIndex !== undefined) {
				const entry = pot.history[this.editingHistoryIndex];
				const seeds = entry.harvestSeeds || [{ strain: entry.harvestSeedsStrain || "", count: entry.harvestSeedsCount || "" }];
				this.loadExistingSeeds(seeds);
			} else {
				this.loadExistingSeeds(); // new harvest → one empty row
			}
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
		if (!pot || !pot.plant) return alert("No plant found to harvest");

		const now = new Date();
		const planted = new Date(pot.plant.plantedAt);
		const ageMs = now - planted;
		const totalHours = Math.floor(ageMs / (1000 * 60 * 60));
		const remainingMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
		const ageDisplay = `${totalHours}h ${remainingMinutes}m`;

		// Get latest status (safe fallback)
		const latest = pot.history?.length ? pot.history[pot.history.length - 1] : {
			stageName: pot.plant.currentStage || "Flowering",
			stagePercent: pot.plant.stagePercent || 100,
			healthPercent: pot.plant.healthPercent || 100,
			waterPercent: pot.currentWater || 0,
			groundPercent: pot.currentGround || 0,
			lightPercent: pot.currentLight || 0,
			overallPercent: 0
		};

		// Final frozen values at harvest
		const finalWater = pot.currentWater ?? latest.waterPercent ?? 0;
		const finalGround = pot.currentGround ?? latest.groundPercent ?? 0;
		const finalLight = pot.currentLight ?? latest.lightPercent ?? 0;
		const finalHealth = latest.healthPercent ?? 100;
		const finalOverall = Math.round((finalWater + finalGround + finalHealth + finalLight) / 4);

		let harvestUpdate = {
			recordedAt: this.editingHistoryIndex !== undefined
				? pot.history[this.editingHistoryIndex].recordedAt
				: now.toISOString(),
			ageDisplay,
			stageName: "Harvested",
			stagePercent: 100,
			healthPercent: finalHealth,
			waterPercent: finalWater,
			groundPercent: finalGround,
			lightPercent: finalLight,
			overallPercent: finalOverall,
			notes: document.getElementById("harvestNotes").value.trim() || "Harvest completed",
			entryType: "harvest"  // ← NEW
		};

		let seeds = [];
		let totalSeeds = 0;

		if (pot.plant.sex === "Female") {
			const buds = parseFloat(document.getElementById("harvestBuds").value) || 0;
			const quality = parseFloat(document.getElementById("harvestQuality").value) || 0;
			if (buds <= 0) return alert("Enter a positive bud amount");

			harvestUpdate.harvestType = "Female";
			harvestUpdate.harvestBuds = buds;
			harvestUpdate.harvestQuality = quality;
			harvestUpdate.harvestStrain = pot.plant.strain;
		} else {
			// Male: collect multiple strains
			const seedRows = document.querySelectorAll('#seedList > div');
			seeds = [];
			totalSeeds = 0;

			seedRows.forEach(row => {
				const strain = row.querySelector('.seedStrain').value.trim();
				const count = parseInt(row.querySelector('.seedCount').value) || 0;
				if (strain && count > 0) {
					seeds.push({ strain, count });
					totalSeeds += count;
				}
			});

			if (seeds.length === 0) return alert("Add at least one seed strain with count > 0");

			harvestUpdate.harvestType = "Male";
			harvestUpdate.harvestSeeds = seeds;
			harvestUpdate.harvestTotalSeeds = totalSeeds;
		}

		// Save to history
		if (this.editingHistoryIndex !== undefined && this.editingHistoryIndex >= 0) {
			pot.history[this.editingHistoryIndex] = harvestUpdate;
			this.editingHistoryIndex = undefined;
		} else {
			if (!pot.history) pot.history = [];
			pot.history.push(harvestUpdate);
		}

		// Freeze values on pot for card display
		pot.currentWater = finalWater;
		pot.currentGround = finalGround;
		pot.currentLight = finalLight;

		// Update harvested status
		pot.harvested = true;
		pot.harvest = {
			date: harvestUpdate.recordedAt,
			type: pot.plant.sex,
			ageAtHarvest: ageDisplay,
			finalWater,
			finalGround,
			finalLight,
			finalOverall,
			finalHealth,
			...(pot.plant.sex === "Female" ? {
				buds: harvestUpdate.harvestBuds,
				quality: harvestUpdate.harvestQuality,
				strain: harvestUpdate.harvestStrain || pot.plant.strain
			} : {
				seeds,
				seedTotal: totalSeeds
			}),
			notes: harvestUpdate.notes
		};

		console.log("Harvest freeze:", {
			finalWater, finalGround, finalLight, finalOverall,
			potCurrent: { water: pot.currentWater, ground: pot.currentGround, light: pot.currentLight }
		  });

		App.save("growGroups");
		this.cancelHarvestModal();
		this.renderPots();

		// Refresh history if open
		if (document.getElementById("historyModal").style.display === "flex") {
			this.viewHistory(this.currentGroupId, this.currentPotId);
		}

		alert(`Harvest ${this.editingHistoryIndex !== undefined ? 'updated' : 'completed'}!`);
	  },

	

	// Call this when opening male harvest
	loadExistingSeeds(seeds = []) {
		document.getElementById("seedList").innerHTML = "";
		if (seeds.length === 0) {
			addSeedRow(); // at least one empty row
		} else {
			seeds.forEach(s => addSeedRow(s.strain, s.count));
		}
	},

	closeStrainRecModal() {
		document.getElementById("strainRecommendationsModal").style.display = "none";
	},

	analyzeStrainRecommendations(strain) {
		if (!strain) return "No strain provided.";

		const harvestedPots = [];
		App.state.growGroups.forEach(group => {
			group.pots.forEach(pot => {
				if (pot.plant?.strain?.toLowerCase() === strain.toLowerCase() &&
					pot.harvested &&
					pot.harvest?.quality >= 70) {
					harvestedPots.push(pot);
				}
			});
		});

		if (harvestedPots.length === 0) {
			return "No harvested pots found for this strain yet with quality ≥70%. Log some successful grows first!";
		}

		// Sort by quality descending
		harvestedPots.sort((a, b) => (b.harvest.quality || 0) - (a.harvest.quality || 0));

		const topPots = harvestedPots.slice(0, Math.min(5, harvestedPots.length)); // top 5 max

		// Average quality
		const avgQuality = topPots.reduce((sum, p) => sum + (p.harvest.quality || 0), 0) / topPots.length;

		// Average yield per day
		let totalYieldPerDay = 0;
		topPots.forEach(pot => {
			const planted = new Date(pot.plant.plantedAt);
			const harvested = new Date(pot.harvest.date);
			const days = Math.max((harvested - planted) / (1000 * 60 * 60 * 24), 1); // avoid div by zero
			totalYieldPerDay += (pot.harvest.buds || 0) / days;
		});
		const avgYieldPerDay = totalYieldPerDay / topPots.length;

		// Prep range suggestions from initial values in top pots
		const prepWaters = topPots.map(p => p.initialWater || p.currentWater || 0).filter(v => v > 0);
		const prepGrounds = topPots.map(p => p.initialGround || p.currentGround || 0).filter(v => v > 0);

		const minWater = prepWaters.length ? Math.min(...prepWaters) : 70;
		const maxWater = prepWaters.length ? Math.max(...prepWaters) : 95;
		const minGround = prepGrounds.length ? Math.min(...prepGrounds) : 60;
		const maxGround = prepGrounds.length ? Math.max(...prepGrounds) : 90;

		return {
			topPots: topPots.length,
			avgQuality: avgQuality.toFixed(1),
			avgYieldPerDay: avgYieldPerDay.toFixed(1),
			suggestedPrepWater: `${Math.round(minWater)}–${Math.round(maxWater)}%`,
			suggestedPrepGround: `${Math.round(minGround)}–${Math.round(maxGround)}%`,
			waterAdvice: "Re-water when water drops to 65–70% to avoid stress (based on pots that stayed mostly above 70%).",
			groundAdvice: "Add fertiliser when ground approaches 60–65% (best pots kept ground 80–100% most of the time)."
		};
	  },

	showStrainRecommendations(strain) {
		if (!strain) return alert("No strain selected");

		const analysis = this.analyzeStrainRecommendations(strain);

		let html = `<strong>Recommendations for ${strain}</strong><br><br>`;

		if (typeof analysis === 'string') {
			html += `<p style="color:#e74c3c;">${analysis}</p>`;
		} else {
			html += `<p>Based on <strong>${analysis.topPots}</strong> high-quality harvests:</p>`;
			html += `<ul style="margin:10px 0; padding-left:20px;">`;
			html += `<li>Average quality: <strong>${analysis.avgQuality}%</strong></li>`;
			html += `<li>Average yield per day: <strong>${analysis.avgYieldPerDay}g</strong></li>`;
			html += `</ul>`;

			html += `<p><strong>Preparation suggestions:</strong></p>`;
			html += `<ul style="margin:10px 0; padding-left:20px;">`;
			html += `<li>Start Water: <strong>${analysis.suggestedPrepWater}</strong> (high buffer helps prevent early drops)</li>`;
			html += `<li>Start Ground: <strong>${analysis.suggestedPrepGround}</strong> (add fertiliser early if lower)</li>`;
			html += `</ul>`;

			html += `<p><strong>During grow advice:</strong></p>`;
			html += `<ul style="margin:10px 0; padding-left:20px;">`;
			html += `<li><strong>Water:</strong> ${analysis.waterAdvice}</li>`;
			html += `<li><strong>Ground / Fertiliser:</strong> ${analysis.groundAdvice}</li>`;
			html += `</ul>`;

			html += `<p style="color:#888; font-size:0.9em; margin-top:20px;">These are derived from your top-performing pots. More high-quality harvests = better accuracy.</p>`;
		}

		document.getElementById("strainRecTitle").textContent = `Recommendations for ${strain}`;
		document.getElementById("strainRecContent").innerHTML = html;

		document.getElementById("strainRecommendationsModal").style.display = "flex";
	  },

	analyzeStrainTimeline(strain) {
		const harvestedPots = [];
		App.state.growGroups.forEach(g => {
			g.pots.forEach(p => {
				if (p.plant?.strain?.toLowerCase() === strain.toLowerCase() &&
					p.harvested &&
					p.harvest?.quality >= 70 &&
					p.history?.length >= 3) {
					harvestedPots.push(p);
				}
			});
		});

		if (harvestedPots.length < 2) {
			return "Not enough high-quality harvested pots with history for this strain (need ≥2 with quality ≥70%).";
		}

		// Collect timeline + action points
		const points = [];
		const waterActions = [];
		const fertActions = [];

		harvestedPots.forEach(pot => {
			pot.history.forEach(entry => {
				if (entry.ageDisplay && entry.waterPercent !== undefined) {
					const hours = parseFloat(entry.ageDisplay.split('h')[0]) || 0;
					const minutes = parseFloat(entry.ageDisplay.split('m')[0].trim().replace('m', '')) || 0;
					const totalHours = hours + minutes / 60;

					points.push({
						hours: totalHours,
						water: entry.waterPercent,
						ground: entry.groundPercent || 0
					});

					const notesLower = (entry.notes || "").toLowerCase();
					if (notesLower.includes("water") || notesLower.includes("bottle") || notesLower.includes("+25%")) {
						waterActions.push({
							hours: totalHours,
							waterBefore: entry.waterPercent,
							note: entry.notes
						});
					}

					if (notesLower.includes("fertilis") || (notesLower.includes("added") && notesLower.includes("ground"))) {
						fertActions.push({
							hours: totalHours,
							groundBefore: entry.groundPercent,
							note: entry.notes
						});
					}
				}
			});
		});

		if (points.length < 5) {
			return "Not enough detailed history entries to analyze timeline.";
		}

		const maxHours = Math.max(...points.map(p => p.hours), 4);  // ← moved here

		// Bucket logic...
		const buckets = [ /* your buckets */];

		const timeline = buckets.map(bucket => {
			const inBucket = points.filter(p => p.hours >= bucket.min && p.hours < bucket.max);
			if (inBucket.length === 0) return null;

			const avgWater = inBucket.reduce((sum, p) => sum + p.water, 0) / inBucket.length;
			const avgGround = inBucket.reduce((sum, p) => sum + p.ground, 0) / inBucket.length;

			const waterColor = avgWater >= 70 ? '#2ecc71' : (avgWater >= 60 ? '#f39c12' : '#e74c3c');
			const groundColor = avgGround >= 70 ? '#2ecc71' : (avgGround >= 60 ? '#f39c12' : '#e74c3c');

			return {
				bucket: bucket.label,
				avgWater: Math.round(avgWater),
				avgGround: Math.round(avgGround),
				waterColor,
				groundColor
			};
		}).filter(Boolean);

		const waterSummary = waterActions.length > 0
			? `Water typically added around ${Math.round((waterActions.reduce((sum, a) => sum + a.hours, 0) / waterActions.length) * 10) / 10} hours, when water was ~${Math.round(waterActions.reduce((sum, a) => sum + (a.waterBefore || 0), 0) / waterActions.length)}%.`
			: "No clear watering events detected.";

		const fertSummary = fertActions.length > 0
			? `Fertiliser typically added around ${Math.round((fertActions.reduce((sum, a) => sum + a.hours, 0) / fertActions.length) * 10) / 10} hours, when ground was ~${Math.round(fertActions.reduce((sum, a) => sum + (a.groundBefore || 0), 0) / fertActions.length)}%.`
			: "No clear fertiliser events detected.";

		return {
			potCount: harvestedPots.length,
			timeline,
			waterSummary,
			fertSummary,
			waterActions,
			fertActions,
			maxHours   // ← NEW: return this for visualization
		};
	  },

	showStrainRecommendations(strain) {
		if (!strain) return alert("No strain selected");

		const analysis = this.analyzeStrainRecommendations(strain);

		// Simple modal or alert for now
		let message = `Recommendations for ${strain}\n\n`;

		if (typeof analysis === 'string') {
			message += analysis; // e.g. "No harvested pots found..."
		} else {
			message += `Based on ${analysis.topPots} high-quality harvests:\n\n`;
			message += `Average quality: ${analysis.avgQuality}%\n`;
			message += `Average yield per day: ${analysis.avgYieldPerDay}g\n\n`;
			message += `Prep suggestions:\n`;
			message += `- Water: ${analysis.suggestedPrepWater || '70–95%'} (start high to buffer drops)\n`;
			message += `- Ground: ${analysis.suggestedPrepGround || '60–90%'} (add fertiliser early)\n\n`;
			message += `Water advice: ${analysis.waterAdvice || 'Re-water at 65–70% to avoid stress'}\n`;
			message += `Ground/fertiliser advice: ${analysis.groundAdvice || 'Add when <65%, aim 60–100%'}`;
		}

		alert(message); // Replace with nice modal later
	  },

	closeTimelineModal() {
		document.getElementById("timelineAnalyzerModal").style.display = "none";
	},

	showTimelineAnalyzer(strain) {
		if (!strain) return alert("No strain selected");

		const analysis = this.analyzeStrainTimeline(strain);

		let html = `<strong>Timeline Analyzer for ${strain}</strong><br><br>`;

		if (typeof analysis !== 'string') {
			// Table + summaries (this is the missing part)
			document.getElementById("timelineTableSection").innerHTML = `
			<p>Based on <strong>${analysis.potCount}</strong> high-quality pots:</p>

			<table style="width:100%; border-collapse:collapse; margin:15px 0; font-size:14px;">
				<thead>
				<tr style="background:#222; color:#fff;">
					<th style="padding:10px; border:1px solid #444; text-align:left;">Age Bucket</th>
					<th style="padding:10px; border:1px solid #444; text-align:center;">Avg Water %</th>
					<th style="padding:10px; border:1px solid #444; text-align:center;">Avg Ground %</th>
				</tr>
				</thead>
				<tbody>
				${analysis.timeline.map(row => `
					<tr style="border-bottom:1px solid #333;">
					<td style="padding:10px; border:1px solid #444;">${row.bucket}</td>
					<td style="padding:10px; border:1px solid #444; text-align:center; color:${row.waterColor};">${row.avgWater}%</td>
					<td style="padding:10px; border:1px solid #444; text-align:center; color:${row.groundColor};">${row.avgGround}%</td>
					</tr>
				`).join('')}
				</tbody>
			</table>

			<p style="margin-top:20px;"><strong>Watering timing summary:</strong><br>${analysis.waterSummary}</p>
			<p><strong>Fertiliser timing summary:</strong><br>${analysis.fertSummary}</p>

			<p style="color:#888; font-size:0.9em; margin-top:20px;">
				Color key: 
				<span style="color:#2ecc71;">Green</span> = good range, 
				<span style="color:#f39c12;">Orange</span> = watch zone, 
				<span style="color:#e74c3c;">Red</span> = low/risk
			</p>
			`;

			// Timeline visualization - improved
			const timelineDiv = document.getElementById("actionTimeline");
			timelineDiv.innerHTML = '';
			timelineDiv.style.position = 'relative';
			timelineDiv.style.height = '180px'; // taller to fit lines + labels

			const maxHours = analysis.maxHours || 4;
			const scale = 100 / maxHours; // % width per hour

			// 1. Water trend line (blue stepped line)
			let waterPoints = '';
			let groundPoints = '';
			analysis.timeline.forEach((bucket, i) => {
				const x = ((bucket.bucket.split('–')[0].trim() * 1 + bucket.bucket.split('–')[1].trim() * 1) / 2) * scale; // midpoint of bucket
				const waterY = 120 - (bucket.avgWater * 1.2); // invert Y so higher % = higher on graph
				const groundY = 120 - (bucket.avgGround * 1.2);

				if (i === 0) {
					waterPoints += `M ${x} ${waterY}`;
					groundPoints += `M ${x} ${groundY}`;
				} else {
					waterPoints += ` L ${x} ${waterY}`;
					groundPoints += ` L ${x} ${groundY}`;
				}
			});

			// 2. Initial pot marker (at 0h)
			const initialWater = analysis.timeline[0]?.avgWater || 90; // fallback
			const initialGround = analysis.timeline[0]?.avgGround || 90;
			const initialMarker = `
			  <div style="position:absolute; bottom:120px; left:0%; transform:translateX(-50%); z-index:5;">
				<div style="width:18px; height:18px; background:#ecf0f1; border-radius:50%; border:3px solid #bdc3c7; cursor:help;"
					 title="Initial pot setup\nWater: ${initialWater}%\nGround: ${initialGround}%">
				</div>
				<div style="position:absolute; top:-35px; left:50%; transform:translateX(-50%); font-size:11px; color:#ecf0f1;">
				  Start
				</div>
			  </div>
			`;

			// 3. Action markers (water higher, fert lower)
			let markers = '';
			analysis.waterActions.forEach(action => {
				const left = (action.hours * scale);
				markers += `
				<div class="timeline-tooltip" style="position:absolute; bottom:100px; left:${left}%; transform:translateX(-50%); z-index:10;">
				  <div class="dot" style="background:#3498db; width:16px; height:16px;"></div>
				  <span class="tooltip-text">
					Water added<br>
					${action.hours.toFixed(1)} h<br>
					(~${Math.round(action.hours)}h ${Math.round((action.hours % 1) * 60)}m)<br>
					${action.note || 'Water event'}
				  </span>
				</div>
			  `;
			});

			analysis.fertActions.forEach(action => {
				const left = (action.hours * scale);
				markers += `
				<div class="timeline-tooltip" style="position:absolute; bottom:70px; left:${left}%; transform:translateX(-50%); z-index:10;">
				  <div class="dot" style="background:#44bd32; width:16px; height:16px;"></div>
				  <span class="tooltip-text">
					Fertiliser added<br>
					${action.hours.toFixed(1)} h<br>
					(~${Math.round(action.hours)}h ${Math.round((action.hours % 1) * 60)}m)<br>
					${action.note || 'Fertiliser event'}
				  </span>
				</div>
			  `;
			});

			// 4. Age labels at bottom
			let labels = '';
			for (let h = 0; h <= Math.ceil(maxHours); h += 0.5) { // finer steps
				const left = (h * scale);
				labels += `
				<div style="position:absolute; bottom:-30px; left:${left}%; transform:translateX(-50%); font-size:10px; color:#888;">
				  ${h}h
				</div>
			  `;
			}

			// 5. Combine everything
			timelineDiv.innerHTML = `
			  <!-- Water trend line -->
			  <svg style="position:absolute; top:0; left:0; width:100%; height:100%;" viewBox="0 0 100 120" preserveAspectRatio="none">
				<path d="${waterPoints}" fill="none" stroke="#3498db" stroke-width="3" opacity="0.8"/>
				<path d="${groundPoints}" fill="none" stroke="#44bd32" stroke-width="3" opacity="0.8"/>
			  </svg>
		  
			  ${initialMarker}
			  ${markers}
			  ${labels}
		  
			  <!-- Baseline -->
			  <div style="position:absolute; bottom:0; left:0; right:0; height:2px; background:#555;"></div>
			`;
		  }

		document.getElementById("timelineModalTitle").textContent = `Timeline Analyzer: ${strain}`;
		document.getElementById("timelineAnalyzerModal").style.display = "flex";
	  },
};

function addSeedRow(existingStrain = "", existingCount = "") {
	const list = document.getElementById("seedList");
	const row = document.createElement("div");
	row.style.cssText = "display:flex; gap:10px; margin:8px 0; align-items:center;";
	row.innerHTML = `
	  <input type="text" class="seedStrain" value="${existingStrain}" placeholder="Strain name" style="flex:1; padding:8px;" />
	  <input type="number" class="seedCount" value="${existingCount}" min="0" step="1" placeholder="Count" style="width:120px; padding:8px;" />
	  <button type="button" onclick="this.parentElement.remove()" style="background:#e74c3c; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">×</button>
	`;
	list.appendChild(row);
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