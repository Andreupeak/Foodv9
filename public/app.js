// --- STATE ---
const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { 
        weight: 70, height: 175, age: 30, gender: 'male', activity: 1.375, goal: 0,
        kcal: 2000, p: 150, c: 250, f: 70 
    },
    favorites: JSON.parse(localStorage.getItem('foodlog_favs')) || [],
    currentDate: new Date().toISOString().split('T')[0],
    selectedMeal: 'Breakfast',
    tempFood: null,
    activeTab: 'search' 
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const MICRO_KEYS = [
    'vitamin_a', 'thiamin', 'riboflavin', 'vitamin_b6', 'vitamin_b12',
    'biotin', 'folic_acid', 'niacin', 'pantothenic_acid', 'vitamin_c',
    'vitamin_d', 'vitamin_e', 'vitamin_k', 'calcium', 'magnesium',
    'zinc', 'chromium', 'molybdenum', 'iodine', 'selenium',
    'phosphorus', 'manganese', 'iron', 'copper'
];

// --- INIT ---
function init() {
    renderDate();
    renderMeals();
    renderDashboard();
    renderProfileValues();
}

// --- RENDERERS ---
function renderDate() {
    const d = new Date(state.currentDate);
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('currentDateDisplay').innerText = state.currentDate === today ? 'Today' : d.toDateString();
}

function renderMeals() {
    const container = document.getElementById('mealsContainer');
    container.innerHTML = '';
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);

    MEALS.forEach(meal => {
        const mealLogs = dayLogs.filter(l => l.meal === meal);
        const mealCals = mealLogs.reduce((acc, curr) => acc + (curr.calories || 0), 0);

        let html = `
            <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-slate-200">${meal}</h3>
                    <span class="text-xs text-slate-500 font-mono">${Math.round(mealCals)} kcal</span>
                </div>
                <div class="space-y-3">
        `;

        if(mealLogs.length === 0) {
            html += `<div class="text-xs text-slate-600 italic py-2">No food logged</div>`;
        } else {
            mealLogs.forEach(log => {
                html += `
                    <div onclick="editExistingLog('${log.id}')" class="flex justify-between items-center border-b border-slate-800 pb-2 last:border-0 cursor-pointer active:opacity-70">
                        <div>
                            <div class="font-medium text-slate-200 text-sm">${log.name}</div>
                            <div class="text-xs text-slate-500">${log.qty}${log.unit}</div>
                        </div>
                        <div class="text-xs text-emerald-500 font-medium">${Math.round(log.calories)}</div>
                    </div>
                `;
            });
        }

        html += `
                </div>
                <button onclick="openAddModal('${meal}')" class="mt-3 w-full py-2.5 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 rounded-xl hover:bg-emerald-900/50 transition">
                    + Add Food
                </button>
            </div>
        `;
        container.innerHTML += html;
    });
}

function renderDashboard() {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const totals = dayLogs.reduce((acc, curr) => ({
        kcal: acc.kcal + (curr.calories || 0),
        p: acc.p + (curr.protein || 0),
        c: acc.c + (curr.carbs || 0),
        f: acc.f + (curr.fat || 0)
    }), { kcal: 0, p: 0, c: 0, f: 0 });

    const remaining = Math.round(state.user.kcal - totals.kcal);
    const percent = Math.min((totals.kcal / state.user.kcal) * 100, 100);
    
    document.getElementById('calRemaining').innerText = remaining;
    document.getElementById('calCircle').style.setProperty('--percent', `${percent}%`);
    document.getElementById('calCircle').style.setProperty('--color', remaining < 0 ? '#ef4444' : '#34d399');

    updateBar('carb', totals.c, state.user.c);
    updateBar('prot', totals.p, state.user.p);
    updateBar('fat', totals.f, state.user.f);
}

function updateBar(type, val, max) {
    const pct = Math.min((val / max) * 100, 100);
    document.getElementById(`${type}Val`).innerText = `${Math.round(val)}/${Math.round(max)}g`;
    document.getElementById(`${type}Bar`).style.width = `${pct}%`;
}

// --- GOAL CALCULATOR & PROFILE ---
function renderProfileValues() {
    ['Weight', 'Height', 'Age', 'Gender', 'Activity', 'Goal'].forEach(k => {
        const key = k.toLowerCase();
        const el = document.getElementById(`p${k}`);
        if(el && state.user[key]) el.value = state.user[key];
    });

    if(state.user.manualKcal) document.getElementById('manualKcal').value = state.user.manualKcal;
    if(state.user.manualProt) document.getElementById('manualProt').value = state.user.manualProt;
    if(state.user.manualCarb) document.getElementById('manualCarb').value = state.user.manualCarb;
    if(state.user.manualFat) document.getElementById('manualFat').value = state.user.manualFat;
}

window.calculateGoals = function() {
    const w = parseFloat(document.getElementById('pWeight').value);
    const h = parseFloat(document.getElementById('pHeight').value);
    const a = parseFloat(document.getElementById('pAge').value);
    const g = document.getElementById('pGender').value;
    const act = parseFloat(document.getElementById('pActivity').value);
    const goalOffset = parseFloat(document.getElementById('pGoal').value);

    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr += (g === 'male' ? 5 : -161);

    const tdee = bmr * act;
    const targetKcal = tdee + goalOffset;

    const p = (targetKcal * 0.30) / 4;
    const c = (targetKcal * 0.35) / 4;
    const f = (targetKcal * 0.35) / 9;

    state.user = { 
        weight: w, height: h, age: a, gender: g, activity: act, goal: goalOffset, 
        kcal: targetKcal, p, c, f,
        manualKcal: null, manualProt: null, manualCarb: null, manualFat: null
    };
    
    saveUserAndRefresh();
    alert("Goals automatically calculated!");
};

window.saveManualGoals = function() {
    const mKcal = parseFloat(document.getElementById('manualKcal').value);
    const mProt = parseFloat(document.getElementById('manualProt').value);
    const mCarb = parseFloat(document.getElementById('manualCarb').value);
    const mFat = parseFloat(document.getElementById('manualFat').value);

    if(mKcal) state.user.kcal = mKcal;
    if(mProt) state.user.p = mProt;
    if(mCarb) state.user.c = mCarb;
    if(mFat) state.user.f = mFat;

    state.user.manualKcal = mKcal;
    state.user.manualProt = mProt;
    state.user.manualCarb = mCarb;
    state.user.manualFat = mFat;

    saveUserAndRefresh();
    alert("Manual goals saved!");
};

function saveUserAndRefresh() {
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    renderProfileValues();
    renderDashboard();
    closeProfile();
}

// --- ADD / SEARCH / ANALYZE / CREATE / FAVORITES ---
window.openAddModal = function(meal) {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    setSearchMode('search');
};

window.setSearchMode = function(mode) {
    state.activeTab = mode;
    const views = ['search', 'analyze', 'create', 'favs'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const tab = document.getElementById(`tab-${v}`);
        if(v === mode) {
            el.classList.remove('hidden');
            el.classList.add('flex');
            tab.className = "text-emerald-400 border-b-2 border-emerald-400 pb-1 whitespace-nowrap";
        } else {
            el.classList.add('hidden');
            el.classList.remove('flex');
            tab.className = "text-slate-400 pb-1 whitespace-nowrap";
        }
    });
    if(mode === 'search') setTimeout(() => document.getElementById('searchInput').focus(), 100);
    if(mode === 'favs') renderFavorites();
};

// Search Logic
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(e.target.value), 600);
});

async function performSearch(query) {
    if(query.length < 2) return;
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> searching...</div>';
    
    try {
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query, mode: 'text' })
        });
        const data = await res.json();
        
        if(!data || data.error || data.length === 0) {
            resDiv.innerHTML = '<div class="text-center text-slate-500">No results found.</div>';
        } else {
            window.lastSearchResults = data;
            resDiv.innerHTML = data.map((item, index) => `
                <div onclick="selectFoodFromSearch(${index})" class="flex justify-between items-center p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer hover:border-emerald-500 transition">
                    <div>
                        <div class="font-bold text-slate-200">${item.name}</div>
                        <div class="text-xs text-slate-500">${item.brand ? item.brand + ' • ' : ''}100g: ${Math.round(item.calories)} kcal</div>
                        <div class="text-[10px] text-emerald-600 uppercase font-bold">${item.source}</div>
                    </div>
                    <button class="w-8 h-8 rounded-full bg-emerald-900 text-emerald-400 flex items-center justify-center border border-emerald-800">+</button>
                </div>
            `).join('');
        }
    } catch (e) {
        resDiv.innerHTML = '<div class="text-red-400 text-center">Error</div>';
    }
}

// --- ANALYZE INGREDIENTS ---
window.analyzeIngredients = async function() {
    const input = document.getElementById('analyzeInput').value;
    if(!input) return alert("Please enter ingredients");

    const resDiv = document.getElementById('analyzeResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> analyzing...</div>';

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: input })
        });
        const data = await res.json();

        if(data.error) throw new Error(data.error);
        if(!data.items || data.items.length === 0) throw new Error("No items identified");

        window.lastAnalyzedItems = data.items;

        resDiv.innerHTML = data.items.map((item, idx) => `
            <div onclick="selectAnalyzedItem(${idx})" class="p-3 bg-slate-800 rounded-xl border border-slate-700 cursor-pointer hover:border-emerald-500 transition mb-2">
                <div class="flex justify-between">
                    <div class="font-bold text-white mb-1">${item.name}</div>
                    <div class="text-xs text-slate-400">${item.qty}${item.unit}</div>
                </div>
                <div class="grid grid-cols-4 text-center text-xs">
                    <div class="bg-slate-900 p-1 rounded">
                        <div class="text-slate-500">Kcal</div>
                        <div>${Math.round(item.calories)}</div>
                    </div>
                    <div class="bg-slate-900 p-1 rounded">
                        <div class="text-slate-500">P</div>
                        <div class="text-red-400">${Math.round(item.protein)}</div>
                    </div>
                    <div class="bg-slate-900 p-1 rounded">
                        <div class="text-slate-500">C</div>
                        <div class="text-blue-400">${Math.round(item.carbs)}</div>
                    </div>
                    <div class="bg-slate-900 p-1 rounded">
                        <div class="text-slate-500">F</div>
                        <div class="text-yellow-400">${Math.round(item.fat)}</div>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        resDiv.innerHTML = '<div class="text-red-400 text-center">Analysis Failed</div>';
    }
};

window.selectAnalyzedItem = function(index) {
    const item = window.lastAnalyzedItems[index];
    if(!item.base_qty) item.base_qty = item.qty; 
    prepFoodForEdit(item, true);
};

// --- CREATE MANUAL ITEM ---
window.saveManualItem = function() {
    const name = document.getElementById('manName').value;
    if(!name) return alert("Name required");

    const qty = parseFloat(document.getElementById('manQty').value) || 100;
    const unit = document.getElementById('manUnit').value || 'g';

    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;

    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty; 

    const baseCal = getVal('manKcal') / factor;
    const baseP = getVal('manProt') / factor;
    const baseC = getVal('manCarb') / factor;
    const baseF = getVal('manFat') / factor;

    const micros = {};
    MICRO_KEYS.forEach(key => {
        micros[key] = getVal(`man_${key}`) / factor;
    });

    const item = {
        name, qty, unit,
        baseCalories: baseCal, baseProtein: baseP, baseCarbs: baseC, baseFat: baseF,
        micros, source: 'Manual'
    };

    prepFoodForEdit(item, true);
};

window.selectFoodFromSearch = function(index) {
    const item = window.lastSearchResults[index];
    prepFoodForEdit(item, true);
};

window.editExistingLog = function(id) {
    const log = state.logs.find(l => l.id === id);
    if(log) {
        if(!log.baseCalories) {
            const factor = (log.unit === 'g' || log.unit === 'ml') ? (log.qty / 100) : log.qty;
            log.baseCalories = log.calories / factor;
            log.baseProtein = log.protein / factor;
            log.baseCarbs = log.carbs / factor;
            log.baseFat = log.fat / factor;
        }
        prepFoodForEdit(log, false);
    }
};

function prepFoodForEdit(item, isNew) {
    const factor = item.base_qty ? (item.base_qty === 100 && (item.unit === 'g'|| item.unit==='ml') ? 1 : item.base_qty) : 1;

    state.tempFood = {
        ...item,
        isNew,
        baseCalories: item.baseCalories || (item.calories / factor),
        baseProtein: item.baseProtein || (item.protein / factor),
        baseCarbs: item.baseCarbs || (item.carbs / factor),
        baseFat: item.baseFat || (item.fat / factor),
        micros: item.micros || {}
    };

    const isFav = state.favorites.some(f => f.name === state.tempFood.name);
    const favBtn = document.getElementById('addToFavBtn');
    favBtn.innerHTML = isFav ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';
    favBtn.onclick = () => toggleFavorite();

    // Set Meal Dropdown
    const mealSelect = document.getElementById('editMeal');
    mealSelect.value = item.meal || state.selectedMeal;

    // Toggle Delete Button
    document.getElementById('btnDeleteLog').classList.toggle('hidden', isNew);

    openEditModal();
}

function openEditModal() {
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editName').innerText = state.tempFood.name;
    document.getElementById('editSource').innerText = state.tempFood.source || 'Database';
    document.getElementById('editQty').value = state.tempFood.qty || 100;
    document.getElementById('editUnit').value = state.tempFood.unit || 'g';
    updateEditPreview();
}

document.getElementById('editQty').addEventListener('input', updateEditPreview);
document.getElementById('editUnit').addEventListener('change', updateEditPreview);

function updateEditPreview() {
    const qty = parseFloat(document.getElementById('editQty').value) || 0;
    const unit = document.getElementById('editUnit').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;

    document.getElementById('editKcal').innerText = Math.round(state.tempFood.baseCalories * factor);
    document.getElementById('editProt').innerText = Math.round(state.tempFood.baseProtein * factor);
    document.getElementById('editCarbs').innerText = Math.round(state.tempFood.baseCarbs * factor);
    document.getElementById('editFat').innerText = Math.round(state.tempFood.baseFat * factor);
}


window.saveLog = function() {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const meal = document.getElementById('editMeal').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
    
    state.selectedMeal = meal;
    

    // GENERATE CORRECT TIMESTAMP
    // We take the currently selected date (state.currentDate)
    const logDate = new Date(state.currentDate);
    const now = new Date();
    
    // We keep the current "Wall Clock" time (hours/min/sec) to preserve the order of entry,
    // but we force the Year/Month/Day to match the selected date.
    logDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    
    // Add random milliseconds to ensure uniqueness
    logDate.setMilliseconds(logDate.getMilliseconds() + Math.floor(Math.random() * 999));
    
    const uniqueTimestamp = logDate.toISOString();

    now.setMilliseconds(now.getMilliseconds() + Math.floor(Math.random() * 999));
    const uniqueTimestamp = now.toISOString();

    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
        // Use existing timestamp if editing, otherwise use new unique one
        timestamp: (state.tempFood.isNew || !state.tempFood.timestamp) ? uniqueTimestamp : state.tempFood.timestamp,
        meal: meal,
        name: state.tempFood.name,
        qty, unit,
        calories: state.tempFood.baseCalories * factor,
        protein: state.tempFood.baseProtein * factor,
        carbs: state.tempFood.baseCarbs * factor,
        fat: state.tempFood.baseFat * factor,
        micros: state.tempFood.micros, 
        baseCalories: state.tempFood.baseCalories,
        baseProtein: state.tempFood.baseProtein,
        baseCarbs: state.tempFood.baseCarbs,
        baseFat: state.tempFood.baseFat
    };

    if (state.tempFood.isNew) {
        state.logs.push(log);
    } else {
        const idx = state.logs.findIndex(l => l.id === log.id);
        if (idx !== -1) {
            // Keep original timestamp to prevent duplicating edits in Health
            if (state.logs[idx].timestamp) log.timestamp = state.logs[idx].timestamp;
            state.logs[idx] = log;
        }
    }

    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    closeEditModal();
    
    if (state.activeTab !== 'analyze') {
        document.getElementById('addModal').classList.add('translate-y-full');
    }
    
    init();
};


window.deleteLog = function() {
    if (!state.tempFood || state.tempFood.isNew) return;
    if (confirm("Delete this item?")) {
        const idx = state.logs.findIndex(l => l.id === state.tempFood.id);
        if (idx !== -1) {
            state.logs.splice(idx, 1);
            localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
        }
        closeEditModal();
        init();
    }
};

// --- FAVORITES ---
function toggleFavorite() {
    const existingIdx = state.favorites.findIndex(f => f.name === state.tempFood.name);
    if (existingIdx !== -1) {
        state.favorites.splice(existingIdx, 1);
        document.getElementById('addToFavBtn').innerHTML = '<i class="fa-regular fa-heart"></i>';
    } else {
        // Save current edited state as favorite preference (including meal category)
        const meal = document.getElementById('editMeal').value;
        const favItem = { ...state.tempFood, meal }; 
        state.favorites.push(favItem);
        document.getElementById('addToFavBtn').innerHTML = '<i class="fa-solid fa-heart text-red-500"></i>';
    }
    localStorage.setItem('foodlog_favs', JSON.stringify(state.favorites));
    renderFavorites();
}

function renderFavorites() {
    const list = document.getElementById('favList');
    list.innerHTML = state.favorites.map((item, index) => `
        <div onclick="selectFav(${index})" class="flex justify-between items-center p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer">
            <div>
                <div class="font-bold text-slate-200">${item.name}</div>
                <div class="text-xs text-slate-500">${Math.round(item.baseCalories)} kcal / 100g</div>
            </div>
            <button class="w-8 h-8 rounded-full bg-emerald-900 text-emerald-400 flex items-center justify-center">+</button>
        </div>
    `).join('');
}

window.selectFav = function(index) {
    prepFoodForEdit(state.favorites[index], true);
};

// --- MICROS ---
window.openMicros = function() {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const micros = {};
    
    dayLogs.forEach(log => {
        if(log.micros) {
            const factor = (log.unit === 'g' || log.unit === 'ml') ? (log.qty / 100) : log.qty;
            Object.keys(log.micros).forEach(key => {
                micros[key] = (micros[key] || 0) + (log.micros[key] * factor);
            });
        }
    });

    const rdi = {
        vitamin_a: 800, thiamin: 1.1, riboflavin: 1.4, vitamin_b6: 1.4, vitamin_b12: 2.5,
        biotin: 50, folic_acid: 200, niacin: 16, pantothenic_acid: 6, vitamin_c: 80,
        vitamin_d: 5, vitamin_e: 12, vitamin_k: 75, calcium: 800, magnesium: 375,
        zinc: 10, chromium: 40, molybdenum: 50, iodine: 150, selenium: 55,
        phosphorus: 700, manganese: 2, iron: 14, copper: 1
    };

    const labels = {
        vitamin_a: 'Vit A (µg)', thiamin: 'B1 Thiamin (mg)', riboflavin: 'B2 Riboflavin (mg)',
        vitamin_b6: 'Vit B6 (mg)', vitamin_b12: 'Vit B12 (µg)', biotin: 'Biotin (µg)',
        folic_acid: 'Folic Acid (µg)', niacin: 'Niacin (mg)', pantothenic_acid: 'Pantothenic (mg)',
        vitamin_c: 'Vit C (mg)', vitamin_d: 'Vit D3 (µg)', vitamin_e: 'Vit E (mg)',
        vitamin_k: 'Vit K1 (µg)', calcium: 'Calcium (mg)', magnesium: 'Magnesium (mg)',
        zinc: 'Zinc (mg)', chromium: 'Chromium (µg)', molybdenum: 'Molybdenum (µg)',
        iodine: 'Iodine (µg)', selenium: 'Selenium (µg)', phosphorus: 'Phosphorus (mg)',
        manganese: 'Manganese (mg)', iron: 'Iron (mg)', copper: 'Copper (mg)'
    };

    document.getElementById('microList').innerHTML = MICRO_KEYS.map(key => {
        const val = micros[key] || 0;
        const target = rdi[key] || 1;
        const pct = Math.round((val / target) * 100);
        return `
            <div class="flex justify-between items-center bg-slate-800 p-2 rounded-lg">
                <span class="text-slate-400 text-xs">${labels[key] || key}</span>
                <div class="text-right">
                    <div class="text-white font-bold text-sm">${Math.round(val * 10) / 10}</div>
                    <div class="text-[10px] ${pct >= 100 ? 'text-emerald-400' : 'text-blue-400'}">${pct}%</div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('microsModal').classList.remove('hidden');
};

// --- MEAL PLANNER ---
window.generateMealPlan = async function() {
    const ingredients = document.getElementById('plannerInput').value;
    if(!ingredients) return alert("Enter ingredients");
    
    document.getElementById('plannerInput').disabled = true;
    
    try {
        const res = await fetch('/api/plan-meal', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ingredients })
        });
        const data = await res.json();
        
        document.getElementById('planTitle').innerText = data.mealName;
        document.getElementById('planRecipe').innerText = data.recipe;
        document.getElementById('planGrocery').innerHTML = data.groceryList.map(i => `<li>${i}</li>`).join('');
        document.getElementById('plannerResult').classList.remove('hidden');
    } catch(e) {
        alert("Failed to generate plan");
    }
    document.getElementById('plannerInput').disabled = false;
};

// --- SCANNER FIX ---
let html5QrcodeScanner = null;

window.startScanner = function() {
    const container = document.getElementById('scanner-container');
    container.classList.remove('hidden');
    container.innerHTML = ''; // Clear previous instances

    // Add a close button specifically for the scanner
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.className = "absolute top-2 right-2 z-20 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center";
    closeBtn.onclick = stopScanner;
    container.appendChild(closeBtn);

    if(html5QrcodeScanner) { 
        // Ensure previous instance is cleared
        try { html5QrcodeScanner.clear(); } catch(e){}
    }

    html5QrcodeScanner = new Html5Qrcode("scanner-container");
    
    // Improved Config for Reliability
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 150 }, 
        aspectRatio: 1.0,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
    };
    
    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText) => {
            // Success Callback
            stopScanner(); // Stop camera immediately on success
            performSearch(decodedText);
            
            // Trigger backend search
            fetch('/api/search', {
                 method: 'POST',
                 headers: {'Content-Type': 'application/json'},
                 body: JSON.stringify({ query: decodedText, mode: 'barcode' })
            }).then(r => r.json()).then(data => {
                if(data.length > 0) {
                    prepFoodForEdit(data[0], true);
                } else {
                    alert("Product not found. Try searching by name.");
                }
            });
        }, 
        (errorMessage) => {
            // Parse error, ignore to avoid console spam
        }
    ).catch(err => {
        container.classList.add('hidden');
        alert("Camera error: " + err);
    });
};

window.stopScanner = function() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            document.getElementById('scanner-container').classList.add('hidden');
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error("Failed to stop scanner", err);
            // Force hide if stop fails
            document.getElementById('scanner-container').classList.add('hidden');
            document.getElementById('scanner-container').innerHTML = '';
            html5QrcodeScanner = null;
        });
    } else {
        document.getElementById('scanner-container').classList.add('hidden');
    }
};

// Update closeAddModal to ensure scanner stops
const originalCloseAddModal = window.closeAddModal;
window.closeAddModal = function() {
    stopScanner();
    originalCloseAddModal();
};

// --- VISION ---
window.triggerVision = function(type) {
    if (type === 'camera') document.getElementById('visionCam').click();
    else document.getElementById('visionGal').click();
};

window.handleVision = async function(input) {
    if (!input.files[0]) return;
    document.getElementById('searchResults').innerHTML = '<div class="text-center mt-10"><i class="fa-solid fa-brain fa-bounce text-emerald-500 text-2xl"></i><br>AI is analyzing photo...</div>';

    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const res = await fetch('/api/vision', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.name) {
            const weight = data.estimated_weight_g || 100;
            const factor = weight / 100;
            const food = {
                name: data.name,
                qty: weight,
                unit: 'g',
                source: 'AI Vision',
                baseCalories: data.calories / factor,
                baseProtein: data.protein / factor,
                baseCarbs: data.carbs / factor,
                baseFat: data.fat / factor,
                micros: data.micros || {}
            };
            prepFoodForEdit(food, true);
        }
    } catch (e) {
        document.getElementById('searchResults').innerHTML = 'Error analyzing image';
    }
};

// --- UTILS ---
window.openProfile = () => document.getElementById('profileModal').classList.remove('translate-y-full');
window.closeProfile = () => document.getElementById('profileModal').classList.add('translate-y-full');
window.closeAddModal = () => document.getElementById('addModal').classList.add('translate-y-full');
window.closeEditModal = () => document.getElementById('editModal').classList.add('hidden');
window.openPlanner = () => document.getElementById('plannerModal').classList.remove('translate-y-full');
window.closePlanner = () => document.getElementById('plannerModal').classList.add('translate-y-full');

window.changeDate = (offset) => {
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + offset);
    state.currentDate = d.toISOString().split('T')[0];
    init();
};

window.exportJSON = () => {
    // 1. Filter logs (Last 7 days + Today)
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 7); 

    const recentLogs = state.logs.filter(l => {
        const logDate = new Date(l.date);
        return logDate >= pastDate;
    });

    if (recentLogs.length === 0) return alert("No recent logs found.");

    // 2. Prepare the List
    const exportData = recentLogs.map((l, index) => {
        const factor = (l.unit === 'g' || l.unit === 'ml') ? (l.qty / 100) : l.qty;
        
        // Ensure unique ISO timestamp
        let uniqueTime = l.timestamp || `${l.date}T12:00:${String(index % 60).padStart(2, '0')}.000Z`;

        const item = {
            "Date": uniqueTime,
            "Name": l.name,
            
            // Macros
            "Dietary Energy": Math.round(l.calories || 0),
            "Protein": Math.round((l.protein || 0) * 10) / 10,
            "Carbohydrates": Math.round((l.carbs || 0) * 10) / 10,
            "Total Fat": Math.round((l.fat || 0) * 10) / 10,
        };

        // 3. Add Micros (Full List)
        if (l.micros) {
            const m = l.micros;
            const microMap = {
                "Vitamin A": m.vitamin_a,
                "Thiamin": m.thiamin,
                "Riboflavin": m.riboflavin,
                "Niacin": m.niacin,
                "Pantothenic Acid": m.pantothenic_acid,
                "Vitamin B6": m.vitamin_b6,
                "Biotin": m.biotin,
                "Folate": m.folic_acid,
                "Vitamin B12": m.vitamin_b12,
                "Vitamin C": m.vitamin_c,
                "Vitamin D": m.vitamin_d,
                "Vitamin E": m.vitamin_e,
                "Vitamin K": m.vitamin_k,
                "Calcium": m.calcium,
                "Iron": m.iron,
                "Magnesium": m.magnesium,
                "Phosphorus": m.phosphorus,
                "Zinc": m.zinc,
                "Copper": m.copper,
                "Manganese": m.manganese,
                "Selenium": m.selenium,
                "Iodine": m.iodine,
                "Chromium": m.chromium,       // Added back
                "Molybdenum": m.molybdenum    // Added back
            };

            for (const [key, val] of Object.entries(microMap)) {
                if (val > 0) {
                    item[key] = Math.round((val * factor) * 100) / 100;
                }
            }
        }
        return item;
    });

    // 4. Share as Text
    const jsonString = JSON.stringify(exportData, null, 2);

    if (navigator.share) {
        navigator.share({
            title: 'FoodLog Pro Export',
            text: jsonString
        }).catch(console.error);
    } else {
        console.log(jsonString);
        alert("Data logged to console (Desktop mode)");
    }
};


init();
