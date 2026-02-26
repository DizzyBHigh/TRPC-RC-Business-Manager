// =============================================
// DISTILLING / MOONSHINE PRODUCTION MODULE
// =============================================

const Distilling = {
	// Local mirror of App.state.distillingRecipes
	recipes: [],
	runs: [],
	pendingRecipeId: null,
	// Current active run (null if none)
	activeRun: null,

	// Constants
	YEAST_TYPES: ["Bread", "Distillers", "Champagne", "Turbo"],
	WATER_TYPES: ["Distilled", "Normal"],
	WEATHER_TYPES: ["Sunny", "Cloudy", "Raining", "Thunder"],
	DISTILL_TYPES: [
		{ name: "Single", abv: 40, yield: 100 },
		{ name: "Double", abv: 60, yield: 85 },
		{ name: "Triple", abv: 80, yield: 70 }
	],

	BASE_INGREDIENTS: {
		"Brown Sugar": "Rum",
		"Cane Sugar": "Rum",
		"Molasses": "Rum",
		"Honey": "Mead",
		"Rice": "Saki"
	},

	YEAST_MODIFIERS: {
		"Bread": { quality: 0.70, timeMultiplier: 1.20 },
		"Distillers": { quality: 0.90, timeMultiplier: 1.00 },
		"Champagne": { quality: 0.95, timeMultiplier: 0.90 },
		"Turbo": { quality: 0.85, timeMultiplier: 0.70 }
	},

	// Initialize — load from App.state
	init() {
		this.recipes = App.state?.distillingRecipes || [];
		this.runs = App.state?.distillingRuns || [];
		console.log(`Loaded ${this.recipes.length} recipes, ${this.runs.length} runs`);
		this.renderRecipeList?.();
		this.renderRunsList?.();  // if you have this method
	},

	// Create and save new mash recipe
	createMashRecipe() {
		const name = document.getElementById('recipeName').value.trim() || "Unnamed Mash";
		const ingredient = document.getElementById('mainIngredient').value;
		const amount = parseFloat(document.getElementById('ingredientAmount').value) || 0;
		const waterType = document.getElementById('waterType').value;
		const waterAmount = parseFloat(document.getElementById('waterAmount').value) || 0;
		const yeast = document.getElementById('yeastType').value;
		const expectedBottles = parseInt(document.getElementById('expectedBottles').value) || 0;

		if (!ingredient || amount <= 0) {
			document.getElementById('mashFeedback').innerHTML =
				'<span style="color:#f66;">Select ingredient and enter amount.</span>';
			return;
		}

		const finalProduct = this.BASE_INGREDIENTS[ingredient] || "Unknown";

		const newRecipe = {
			id: Date.now(),
			name,
			ingredient,
			amount,
			waterType,
			waterAmount,
			yeast,
			expectedBottles,
			finalProduct,
			created: new Date().toISOString()
		};

		// Add to local array
		this.recipes.push(newRecipe);

		// Update App.state
		if (!App.state.distillingRecipes) App.state.distillingRecipes = [];
		App.state.distillingRecipes = JSON.parse(JSON.stringify(this.recipes)); // deep copy to avoid reference issues

		// Save to Firebase using the real save function
		console.log("Saving distillingRecipes to Firebase...");
		App.save("distillingRecipes")
			.then(() => {
				console.log("Firebase save SUCCESS for distillingRecipes");
				document.getElementById('mashFeedback').innerHTML =
					`<strong style="color:#0f8;">Saved to Firebase:</strong> ${name} (${amount}×${ingredient} → ${finalProduct})`;

				document.getElementById('mashForm').reset();
				this.renderRecipeList?.();
			})
			.catch(err => {
				console.error("Firebase save FAILED:", err);
				document.getElementById('mashFeedback').innerHTML =
					'<span style="color:#f66;">Failed to save — check console / login</span>';
			});
	},

	// Render saved recipes list (optional)
	renderRecipeList() {
		const container = document.getElementById('mash-recipe-list');
		if (!container) return;

		let html = '<h4>Saved Mash Recipes</h4>';
		if (this.recipes.length === 0) {
			html += '<p style="color:#888;">No recipes saved yet.</p>';
		} else {
			html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">';
			this.recipes.forEach(r => {
				html += `
					<div style="background:#000; padding:12px; border-radius:8px; border:1px solid #444;">
						<strong style="color:#0ff;">${r.name}</strong><br>
						<small>${r.amount} × ${r.ingredient} → ${r.finalProduct}</small><br>
						<small>Water: ${r.waterAmount} bottles (${r.waterType}) | ${r.yeast}</small><br>
						<small>Est. Bottles: ${r.expectedBottles || '—'}</small>
						<div style="margin-top:12px;">
						<button onclick="console.log('Button clicked for recipe ID:', ${r.id}); Distilling.showStartRunModal(${r.id})" 
						style="background:#0af; color:#000; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">
					Start Run
				</button>
						</div>
					</div>`;
			});
			html += '</div>';
		}
		container.innerHTML = html;
	},
	
	// Start a new mash run

	// Show modal to confirm starting a run
	showStartRunModal(recipeId) {
		const recipe = this.recipes.find(r => r.id === recipeId);
		if (!recipe) return;

		this.pendingRecipeId = recipeId;

		document.getElementById('modalRecipeName').textContent = recipe.name;
		document.getElementById('modalRecipeDetails').innerHTML = `
        ${recipe.amount} × ${recipe.ingredient} → ${recipe.finalProduct}<br>
        Yeast: ${recipe.yeast} | Water: ${recipe.waterAmount} bottles (${recipe.waterType})<br>
        Est. Bottles: ${recipe.expectedBottles || '—'}
    `;

		document.getElementById('startRunModal').style.display = 'flex';
	},

	cancelStartRun() {
		this.pendingRecipeId = null;
		document.getElementById('startRunModal').style.display = 'none';
	},

	confirmStartRun() {
		if (!this.pendingRecipeId) return;

		const recipe = this.recipes.find(r => r.id === this.pendingRecipeId);
		if (!recipe) return;

		const newRun = {
			id: Date.now(),
			recipeId: recipe.id,
			recipeName: recipe.name,
			startTime: new Date().toISOString(),
			fermentationLogs: [],
			distillationType: null,
			collectionRecords: [],
			status: "fermenting",
			notes: ""
		};

		// Ensure runs exists
		if (!this.runs) this.runs = [];

		this.runs.push(newRun);

		App.state.distillingRuns = JSON.parse(JSON.stringify(this.runs));

		App.save("distillingRuns").then(() => {
			console.log("Run started from recipe:", recipe.name);
			document.getElementById('startRunModal').style.display = 'none';
			this.pendingRecipeId = null;
			this.renderAll?.();
			alert("Run started successfully!");
		}).catch(err => {
			console.error("Failed to start run:", err);
			alert("Failed to start run");
		});
	},

	startRun(mashRecipe) {
		this.activeRun = {
			mashRecipe,
			startTime: new Date(),
			fermentationLogs: [],
			distillationType: null,
			collectionRecords: [],
			status: "fermenting" // "fermenting", "distilling", "completed"
		};
		this.save();
		this.renderActiveRun();
	},

	renderRunsList() {
		const container = document.getElementById('distilling-runs-list');
		if (!container) return;

		let html = '<h4 style="color:#0ff; margin-bottom:16px;">Distilling Runs</h4>';

		if (this.runs.length === 0) {
			html += '<p style="color:#888; text-align:center;">No runs in progress or completed yet.</p>';
		} else {
			html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">';

			this.runs.forEach(run => {
				const statusColor =
					run.status === "fermenting" ? "#ff9800" :
						run.status === "distilling" ? "#0f8" :
							run.status === "completed" ? "#888" :
								run.status === "cancelled" ? "#f66" : "#777";

				const progress = run.fermentationLogs.length > 0
					? run.fermentationLogs[run.fermentationLogs.length - 1].progress
					: 0;

				html += `
					<div style="background:#000; padding:16px; border-radius:12px; border:1px solid #444; box-shadow:0 2px 8px rgba(0,0,0,0.5);">
						<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
							<strong style="color:#0ff; font-size:16px;">${run.recipeName}</strong>
							<span style="background:${statusColor}; color:#000; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:bold;">
								${run.status.toUpperCase()}
							</span>
						</div>
	
						<small style="color:#aaa; display:block; margin-bottom:8px;">
							Started: ${new Date(run.startTime).toLocaleString()}
						</small>
	
						${run.status === "fermenting" ? `
							<div style="margin:12px 0; padding:8px; background:#111; border-radius:8px;">
								<div style="color:#ff9800; font-weight:bold;">Fermenting • ${progress}%</div>
								${run.fermentationLogs.length > 0 ? `
									<small>Last log: ${run.fermentationLogs[run.fermentationLogs.length - 1].timeRemaining}</small>
								` : '<small>No logs yet</small>'}
							</div>
						` : ''}
	
						${run.distillationType ? `
							<div style="margin:8px 0; color:#0f8;">
								Distillation: ${run.distillationType.name} (${run.distillationType.abv}% ABV)
							</div>
						` : ''}
	
						${run.collectionRecords.length > 0 ? `
							<div style="margin:8px 0; color:#0af;">
								Collected: ${run.collectionRecords.length} batch(es)
							</div>
						` : ''}
	
						<!-- Action buttons -->
						<div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px;">
							${run.status === "fermenting" ? `
								<button onclick="Distilling.showLogModal(${run.id})" 
										style="background:#ff9800; color:#000; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
									+ Add Log
								</button>
								<button onclick="Distilling.showFinishFermentationModal(${run.id})" 
										style="background:#0f8; color:#000; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
									Finish Fermentation
								</button>
							` : ''}
	
							${run.status === "distilling" ? `
								<button onclick="Distilling.showCollectModal(${run.id})" 
										style="background:#0af; color:#000; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
									Collect Batch
								</button>
							` : ''}
	
							${run.status !== "completed" && run.status !== "cancelled" ? `
								<button onclick="Distilling.cancelRun(${run.id})" 
										style="background:#f66; color:#fff; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
									Cancel Run
								</button>
							` : ''}
	
							${run.status === "cancelled" ? `
								<button onclick="Distilling.deleteCancelledRun(${run.id})" 
										style="background:#900; color:#fff; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
									Delete Run
								</button>
							` : ''}
	
							<button onclick="Distilling.viewRunDetails(${run.id})" 
									style="background:#444; color:#fff; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
								Details
							</button>
						</div>
					</div>`;
			});

			html += '</div>';
		}

		container.innerHTML = html;
	},

	deleteCancelledRun(runId) {
		if (!confirm("Permanently delete this cancelled run? This cannot be undone.")) return;

		this.runs = this.runs.filter(r => r.id !== runId);

		App.state.distillingRuns = JSON.parse(JSON.stringify(this.runs));

		App.save("distillingRuns").then(() => {
			console.log("Cancelled run deleted:", runId);
			this.renderRunsList();
			alert("Run deleted successfully.");
		}).catch(err => {
			console.error("Failed to delete run:", err);
			alert("Failed to delete run — check console");
		});
	},

	// Track which run we're logging for
	currentLogRunId: null,

	showLogModal(runId) {
		this.currentLogRunId = runId;

		const run = this.runs.find(r => r.id === runId);
		if (!run) return;

		document.getElementById('logRunName').textContent = `Run: ${run.recipeName}`;

		const now = new Date();
		document.getElementById('logTimestamp').value = now.toLocaleString();
		document.getElementById('logDayNight').value = now.getHours() >= 6 && now.getHours() < 20 ? "Day" : "Night";

		// Default values
		document.getElementById('logBurnRate').value = 50;
		document.getElementById('logLowTemp').value = "25.5";
		document.getElementById('logHighTemp').value = "25.9"; // initial +0.4
		document.getElementById('logProgress').value = "0";
		document.getElementById('logTimeRemaining').value = "12 hrs";

		// Auto-sync: High = Low + 0.4 whenever Low changes
		const lowTempInput = document.getElementById('logLowTemp');
		const highTempInput = document.getElementById('logHighTemp');

		lowTempInput.oninput = () => {
			const low = parseFloat(lowTempInput.value);
			if (!isNaN(low)) {
				const newHigh = (low + 0.4).toFixed(1);
				highTempInput.value = newHigh;  // always update when low changes
			}
		};

		// Initial sync
		lowTempInput.dispatchEvent(new Event('input'));

		document.getElementById('fermentLogModal').style.display = 'flex';
	},

	hideFermentModal() {
		this.currentLogRunId = null;
		document.getElementById('fermentLogModal').style.display = 'none';
	},

	saveFermentLog() {
		if (!this.currentLogRunId) return;

		const burnRate = parseInt(document.getElementById('logBurnRate').value) || 0;
		const lowTemp = parseFloat(document.getElementById('logLowTemp').value) || 0;
		const highTemp = parseFloat(document.getElementById('logHighTemp').value) || 0;
		const progress = parseFloat(document.getElementById('logProgress').value) || 0;
		const timeRemaining = document.getElementById('logTimeRemaining').value.trim();

		// Optional: validate temps
		if (highTemp <= lowTemp) {
			alert("High temp should be greater than low temp.");
			return;
		}

		this.addFermentationLog(
			this.currentLogRunId,
			burnRate,
			lowTemp,
			highTemp,
			progress,
			timeRemaining
		);

		this.hideFermentModal();
		alert("Log saved!");
	},


addFermentationLog(runId, burnRate, lowTemp, highTemp, progress, timeRemaining) {
	const run = this.runs.find(r => r.id === runId);
	if (!run || run.status !== "fermenting") {
		console.warn("Cannot add log: run not found or not fermenting");
		return;
	}

	// Create log entry
	const entry = {
		timestamp: new Date().toISOString(),
		isDay: new Date().getHours() >= 6 && new Date().getHours() < 20,
		weather: document.getElementById('logWeather')?.value || "Sunny",
		burnRate: Number(burnRate),
		lowTemp: Number(lowTemp),
		highTemp: Number(highTemp),
		progress: Number(progress),
		timeRemaining: timeRemaining || "Unknown"
	};

	// Add to the run's logs array
	if (!run.fermentationLogs) run.fermentationLogs = [];
	run.fermentationLogs.push(entry);

	console.log("Log added to run", runId, ":", entry);

	// Update global App.state (deep copy to prevent reference issues)
	App.state.distillingRuns = JSON.parse(JSON.stringify(this.runs));

	// Save to Firebase – this is the critical missing part
	console.log("Saving distillingRuns to Firebase after log addition...");
	App.save("distillingRuns")
		.then(() => {
			console.log("Log saved to Firebase successfully!");
			this.renderRunsList();  // refresh the UI
		})
		.catch(err => {
			console.error("Failed to save log to Firebase:", err);
			alert("Failed to save log – check console for details");
		});
},

	showFinishFermentationModal(runId) {
		const type = prompt("Choose distillation type:\n1=Single\n2=Double\n3=Triple");
		if (type) {
			const types = ["Single", "Double", "Triple"];
			this.finishFermentation(runId, types[parseInt(type) - 1]);
		}
	},

	showCollectModal(runId) {
		// TODO: Open proper form for quality, bottles, xp
		const quality = prompt("Quality (0-100):");
		const bottles = prompt("Bottles:");
		const xp = prompt("XP gained:");
		if (quality && bottles) {
			this.addCollectionRecord(runId, "Rum", quality, bottles, xp);
		}
	},

	cancelRun(runId) {
		if (confirm("Cancel this run?")) {
			const run = this.runs.find(r => r.id === runId);
			if (run) {
				run.status = "cancelled";
				App.state.distillingRuns = JSON.parse(JSON.stringify(this.runs));
				App.save("distillingRuns").then(() => this.renderAll());
			}
		}
	},

	viewRunDetails(runId) {
		const run = this.runs.find(r => r.id === runId);
		if (run) {
			alert(`Run: ${run.recipeName}\nStatus: ${run.status}\nStarted: ${new Date(run.startTime).toLocaleString()}\nLogs: ${run.fermentationLogs.length}\nCollections: ${run.collectionRecords.length}`);
		}
	},

	// Add a fermentation log entry
	addFermentationLog(burnRate, lowTemp, highTemp, progress, timeRemaining) {
		if (!this.activeRun || this.activeRun.status !== "fermenting") return;

		const entry = {
			timestamp: new Date(),
			isDay: this.isDayTime(),
			weather: this.getCurrentWeather(), // you'd need real logic or manual select
			burnRate,
			lowTemp,
			highTemp,
			progress: Math.min(100, progress), // cap at 100 or allow over?
			timeRemaining
		};

		this.activeRun.fermentationLogs.push(entry);
		this.save();
		this.renderActiveRun();
	},

	// Finish fermentation and choose distillation type
	finishFermentation(distillationTypeName) {
		if (!this.activeRun || this.activeRun.status !== "fermenting") return;

		const type = this.DISTILL_TYPES.find(t => t.name === distillationTypeName);
		if (!type) return;

		this.activeRun.distillationType = type;
		this.activeRun.status = "distilling";
		this.save();
		this.renderActiveRun();
	},

	// Complete run with collection data
	completeRun(product, quality, bottles, xp) {
		if (!this.activeRun || this.activeRun.status !== "distilling") return;

		this.activeRun.collectionRecords.push({
			timestamp: new Date(),
			product,
			quality,
			bottles,
			xp
		});

		this.activeRun.status = "completed";
		this.activeRun.endTime = new Date();
		this.save();

		// Move to history if you want
		// this.history.push(this.activeRun);
		this.activeRun = null;
		this.renderActiveRun();
	},

	// Helpers (stub — replace with real logic if needed)
	isDayTime() { return new Date().getHours() >= 6 && new Date().getHours() < 20; },
	getCurrentWeather() { return "Sunny"; }, // placeholder — could come from user input or API


	// UI rendering (stub — call this after changes)
	renderActiveRun() {
		const container = document.getElementById("distilling-active");
		if (!container) return;

		if (!this.activeRun) {
			container.innerHTML = `<button onclick="Distilling.startNewRun()">Start New Mash Run</button>`;
			return;
		}

		// Build HTML for active run...
		let html = `<h3>Active Run: ${this.activeRun.mashRecipe.name}</h3>`;
		html += `<p>Status: ${this.activeRun.status}</p>`;

		if (this.activeRun.status === "fermenting") {
			html += `<table><thead><tr><th>Time</th><th>Weather</th><th>Burn Rate</th><th>Temp Range</th><th>Progress</th><th>Remaining</th></tr></thead><tbody>`;
			this.activeRun.fermentationLogs.forEach(log => {
				html += `<tr><td>${log.timestamp.toLocaleString()}</td><td>${log.isDay ? "Day" : "Night"} - ${log.weather}</td><td>${log.burnRate}</td><td>${log.lowTemp}–${log.highTemp}</td><td>${log.progress}%</td><td>${log.timeRemaining}</td></tr>`;
			});
			html += `</tbody></table>`;
			html += `<button onclick="Distilling.addLogManually()">Add Log Entry</button>`;
		}

		// ... add more for distillation/completion ...
		container.innerHTML = html;
	},

	renderAll() {
		this.renderRecipeList?.();
		this.renderRunsList?.();
	}

};
document.addEventListener('DOMContentLoaded', () => {
	Distilling.init();
});
// Initialize on load
Distilling.load();
Distilling.renderActiveRun();
Distilling.loadRecipes();
Distilling.renderRecipeList();
Distilling.renderRunsList();