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
    activeTab: 'search',
    mainView: 'diary' // 'diary' or 'coach'
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const MICRO_KEYS = [
    // Macro Details
    'sugars', 'fiber', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat',
    // Minerals / Electrolytes
    'sodium', 'potassium', 'chloride', 'calcium', 'magnesium', 'zinc',
    'chromium', 'molybdenum', 'iodine', 'selenium', 'phosphorus', 'manganese', 'iron', 'copper',
    // Vitamins
    'vitamin_a', 'thiamin', 'riboflavin', 'vitamin_b6', 'vitamin_b12',
    'biotin', 'folic_acid', 'niacin', 'pantothenic_acid', 'vitamin_c',
    'vitamin_d', 'vitamin_e', 'vitamin_k',
    // Other
    'caffeine', 'water'
];

// Standard RDI Values (Approx for Adults)
const RDI_VALUES = {
    sugars: 50, // g (Added sugar limit)
    fiber: 30, // g
    saturated_fat: 20, // g
    sodium: 2300, // mg
    potassium: 3500, // mg
    chloride: 2300, // mg
    calcium: 1000, // mg
    magnesium: 400, // mg
    zinc: 11, // mg
    iron: 14, // mg
    phosphorus: 700, // mg
    iodine: 150, // µg
    selenium: 55, // µg
    copper: 1, // mg
    manganese: 2.3, // mg
    chromium: 35, // µg
    molybdenum: 45, // µg
    vitamin_a: 900, // µg
    vitamin_c: 90, // mg
    vitamin_d: 20, // µg
    vitamin_e: 15, // mg
    vitamin_k: 120, // µg
    thiamin: 1.2, // mg
    riboflavin: 1.3, // mg
    niacin: 16, // mg
    vitamin_b6: 1.7, // mg
    folic_acid: 400, // µg
    vitamin_b12: 2.4, // µg
    biotin: 30, // µg
    pantothenic_acid: 5, // mg
    caffeine: 400, // mg (Safe limit)
    water: 2500 // g
};

// --- INIT ---
function init() {
    renderDate();
    renderMeals();
    renderDashboard();
    renderProfileValues();
    setupEditListeners();
}

// --- NAVIGATION ---
window.switchMainView = function (view) {
    state.mainView = view;

    // UI Toggles
    document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'diary');
    document.getElementById('view-coach').classList.toggle('hidden', view !== 'coach');
    document.getElementById('view-coach').classList.toggle('flex', view === 'coach');

    // Nav Active State
    document.getElementById('nav-diary').classList.toggle('text-emerald-400', view === 'diary');
    document.getElementById('nav-diary').classList.toggle('text-slate-500', view !== 'diary');

    document.getElementById('nav-coach').classList.toggle('text-emerald-400', view === 'coach');
    document.getElementById('nav-coach').classList.toggle('text-slate-500', view !== 'coach');

    // Add button visibility
    document.getElementById('mainAddBtn').classList.toggle('hidden', view === 'coach');
};

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

        if (mealLogs.length === 0) {
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

    // Calculate Total Cost
    const totalCost = dayLogs.reduce((sum, log) => sum + (log.cost || 0), 0);
    const costEl = document.getElementById('dailyCost');
    if (costEl) costEl.innerText = totalCost.toFixed(2);

    const totals = dayLogs.reduce((acc, curr) => ({
        kcal: acc.kcal + (curr.calories || 0),
        p: acc.p + (curr.protein || 0),
        c: acc.c + (curr.carbs || 0),
        f: acc.f + (curr.fat || 0)
    }), { kcal: 0, p: 0, c: 0, f: 0 });

    const remaining = Math.round(state.user.kcal - totals.kcal);
    const percent = Math.min((totals.kcal / state.user.kcal) * 100, 100);
    const eaten = Math.round(totals.kcal);

    document.getElementById('calRemaining').innerText = remaining;
    document.getElementById('calEaten').innerText = eaten;
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
        if (el && state.user[key]) el.value = state.user[key];
    });

    if (state.user.manualKcal) document.getElementById('manualKcal').value = state.user.manualKcal;
    if (state.user.manualProt) document.getElementById('manualProt').value = state.user.manualProt;
    if (state.user.manualCarb) document.getElementById('manualCarb').value = state.user.manualCarb;
    if (state.user.manualFat) document.getElementById('manualFat').value = state.user.manualFat;
}

window.calculateGoals = function () {
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

window.saveManualGoals = function () {
    const mKcal = parseFloat(document.getElementById('manualKcal').value);
    const mProt = parseFloat(document.getElementById('manualProt').value);
    const mCarb = parseFloat(document.getElementById('manualCarb').value);
    const mFat = parseFloat(document.getElementById('manualFat').value);

    if (mKcal) state.user.kcal = mKcal;
    if (mProt) state.user.p = mProt;
    if (mCarb) state.user.c = mCarb;
    if (mFat) state.user.f = mFat;

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
window.openAddModal = function (meal) {
    if (meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    setSearchMode('search');
};

window.setSearchMode = function (mode) {
    // Stop scanner if leaving search tab
    if (state.activeTab === 'search' && mode !== 'search') {
        stopScanner();
    }

    state.activeTab = mode;
    const views = ['search', 'analyze', 'create', 'favs'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const tab = document.getElementById(`tab-${v}`);
        if (v === mode) {
            el.classList.remove('hidden');
            el.classList.add('flex');
            tab.className = "text-emerald-400 border-b-2 border-emerald-400 pb-1 whitespace-nowrap";
        } else {
            el.classList.add('hidden');
            el.classList.remove('flex');
            tab.className = "text-slate-400 pb-1 whitespace-nowrap";
        }
    });
    if (mode === 'search') setTimeout(() => document.getElementById('searchInput').focus(), 100);
    if (mode === 'favs') renderFavorites();
};

// Search Logic
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(e.target.value), 600); // Back to 600ms for stability
});

async function performSearch(query) {
    if (query.length < 2) return;
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> searching database...</div>';

    try {
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, mode: 'text' })
        });
        const data = await res.json();

        if (!data || data.error || data.length === 0) {
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
window.analyzeIngredients = async function () {
    const input = document.getElementById('analyzeInput').value;
    if (!input) return alert("Please enter ingredients");

    const resDiv = document.getElementById('analyzeResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> analyzing...</div>';

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: input })
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);
        if (!data.items || data.items.length === 0) throw new Error("No items identified");

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

window.selectAnalyzedItem = function (index) {
    const item = window.lastAnalyzedItems[index];
    if (!item.base_qty) item.base_qty = item.qty;
    prepFoodForEdit(item, true);
};

// --- CREATE MANUAL ITEM ---
window.saveManualItem = function () {
    const name = document.getElementById('manName').value;
    if (!name) return alert("Name required");

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

window.selectFoodFromSearch = function (index) {
    const item = window.lastSearchResults[index];
    prepFoodForEdit(item, true);
};


window.editExistingLog = function (id) {
    const log = state.logs.find(l => l.id === id);
    if (log) {
        // Calculate the scaling factor that was used for this log
        // (e.g., if 30g was logged, factor is 0.3)
        const factor = (log.unit === 'g' || log.unit === 'ml') ? (log.qty / 100) : log.qty;
        const safeFactor = factor === 0 ? 1 : factor;

        // Create a copy of the micros converted back to BASE values (per 100g/unit)
        // This prevents the "double multiplication" bug
        const baseMicros = {};
        if (log.micros) {
            Object.keys(log.micros).forEach(key => {
                baseMicros[key] = log.micros[key] / safeFactor;
            });
        }

        // Prepare a normalized object for the editor
        // We use the Base Macros/Micros so the editor math works correctly
        const editItem = {
            ...log,
            micros: baseMicros,
            // Ensure we use Base Macros. If legacy log didn't save them, reverse-calc them.
            baseCalories: log.baseCalories || (log.calories / safeFactor),
            baseProtein: log.baseProtein || (log.protein / safeFactor),
            baseCarbs: log.baseCarbs || (log.carbs / safeFactor),
            baseFat: log.baseFat || (log.fat / safeFactor),

            // Normalize cost to base unit as well
            cost: log.cost ? (log.cost / safeFactor) : 0
        };

        prepFoodForEdit(editItem, false);
    }
};


function prepFoodForEdit(item, isNew) {
    // Stop scanner if user selects a food
    stopScanner();

    const factor = item.base_qty ? (item.base_qty === 100 && (item.unit === 'g' || item.unit === 'ml') ? 1 : item.base_qty) : 1;

    state.tempFood = {
        ...item,
        isNew,
        baseCalories: item.baseCalories || (item.calories / factor),
        baseProtein: item.baseProtein || (item.protein / factor),
        baseCarbs: item.baseCarbs || (item.carbs / factor),
        baseFat: item.baseFat || (item.fat / factor),
        micros: item.micros || {},
        // NEW: Cost initialization
        cost: item.cost || 0,
        pkgPrice: item.pkgPrice || null,
        pkgWeight: item.pkgWeight || null
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

    // Hide micros by default
    document.getElementById('editMicrosArea').classList.add('hidden');

    openEditModal();
}

function openEditModal() {
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editName').innerText = state.tempFood.name;
    document.getElementById('editSource').innerText = state.tempFood.source || 'Database';
    document.getElementById('editQty').value = state.tempFood.qty || 100;
    document.getElementById('editUnit').value = state.tempFood.unit || 'g';

    // NEW: Set cost values
    document.getElementById('editCost').value = state.tempFood.cost ? state.tempFood.cost.toFixed(2) : '';
    document.getElementById('editPkgPrice').value = state.tempFood.pkgPrice || '';
    document.getElementById('editPkgWeight').value = state.tempFood.pkgWeight || '';

    updateEditPreview();
}

document.getElementById('editQty').addEventListener('input', updateEditPreview);
document.getElementById('editUnit').addEventListener('change', updateEditPreview);

function updateEditPreview() {
    const qty = parseFloat(document.getElementById('editQty').value) || 0;
    const unit = document.getElementById('editUnit').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;

    const activeId = document.activeElement.id;

    if (!['editKcal', 'editProt', 'editCarbs', 'editFat'].includes(activeId)) {
        document.getElementById('editKcal').value = Math.round(state.tempFood.baseCalories * factor);
        document.getElementById('editProt').value = Math.round(state.tempFood.baseProtein * factor * 10) / 10;
        document.getElementById('editCarbs').value = Math.round(state.tempFood.baseCarbs * factor * 10) / 10;
        document.getElementById('editFat').value = Math.round(state.tempFood.baseFat * factor * 10) / 10;
    }

    // NEW: Hybrid Cost Calculation Logic
    const pkgPrice = parseFloat(document.getElementById('editPkgPrice').value);
    const pkgWeight = parseFloat(document.getElementById('editPkgWeight').value);

    // Only auto-calculate if user is NOT manually typing in the final cost box
    if (activeId !== 'editCost') {
        if (pkgPrice && pkgWeight && pkgWeight > 0) {
            // Bulk Calculation: (Price / Weight) * CurrentQty
            const calculatedCost = (pkgPrice / pkgWeight) * qty;
            document.getElementById('editCost').value = calculatedCost.toFixed(2);
        }
    }

    // Update Micros
    MICRO_KEYS.forEach(key => {
        if (activeId !== `edit_${key}`) {
            const val = (state.tempFood.micros[key] || 0) * factor;
            document.getElementById(`edit_${key}`).value = val > 0 ? (Math.round(val * 100) / 100) : '';
        }
    });
}

function setupEditListeners() {
    const updateBase = (key, val) => {
        const qty = parseFloat(document.getElementById('editQty').value) || 0;
        const unit = document.getElementById('editUnit').value;
        const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
        if (factor === 0) return;

        state.tempFood[key] = parseFloat(val) / factor;
    };

    const updateMicroBase = (key, val) => {
        const qty = parseFloat(document.getElementById('editQty').value) || 0;
        const unit = document.getElementById('editUnit').value;
        const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
        if (factor === 0) return;

        if (!state.tempFood.micros) state.tempFood.micros = {};
        state.tempFood.micros[key] = parseFloat(val) / factor;
    };

    document.getElementById('editKcal').addEventListener('input', (e) => updateBase('baseCalories', e.target.value));
    document.getElementById('editProt').addEventListener('input', (e) => updateBase('baseProtein', e.target.value));
    document.getElementById('editCarbs').addEventListener('input', (e) => updateBase('baseCarbs', e.target.value));
    document.getElementById('editFat').addEventListener('input', (e) => updateBase('baseFat', e.target.value));

    // NEW: Cost Listeners
    // If user types in Package Price or Weight -> Recalculate Total Cost
    ['editPkgPrice', 'editPkgWeight'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateEditPreview);
    });

    MICRO_KEYS.forEach(key => {
        const el = document.getElementById(`edit_${key}`);
        if (el) {
            el.addEventListener('input', (e) => updateMicroBase(key, e.target.value));
        }
    });
}


window.saveLog = function () {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const meal = document.getElementById('editMeal').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;

    state.selectedMeal = meal;

    // --- TIMESTAMP FIX ---
    let logTimestamp;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (state.currentDate !== todayStr) {
        const timePart = now.toISOString().split('T')[1];
        logTimestamp = `${state.currentDate}T${timePart}`;
    } else {
        now.setMilliseconds(now.getMilliseconds() + Math.floor(Math.random() * 999));
        logTimestamp = now.toISOString();
    }

    // Read Current Input Values for accuracy
    const currentKcal = parseFloat(document.getElementById('editKcal').value) || 0;
    const currentProt = parseFloat(document.getElementById('editProt').value) || 0;
    const currentCarb = parseFloat(document.getElementById('editCarbs').value) || 0;
    const currentFat = parseFloat(document.getElementById('editFat').value) || 0;

    // NEW: Read Cost Values
    const currentCost = parseFloat(document.getElementById('editCost').value) || 0;
    const pkgPrice = parseFloat(document.getElementById('editPkgPrice').value) || null;
    const pkgWeight = parseFloat(document.getElementById('editPkgWeight').value) || null;

    // Update Micros from Input
    const currentMicros = {};
    MICRO_KEYS.forEach(key => {
        const val = parseFloat(document.getElementById(`edit_${key}`).value);
        if (!isNaN(val)) currentMicros[key] = val;
    });

    const safeFactor = factor === 0 ? 1 : factor;

    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
        timestamp: (state.tempFood.isNew || !state.tempFood.timestamp) ? logTimestamp : state.tempFood.timestamp,
        meal: meal,
        name: state.tempFood.name,
        qty, unit,
        calories: currentKcal,
        protein: currentProt,
        carbs: currentCarb,
        fat: currentFat,
        micros: currentMicros,
        baseCalories: currentKcal / safeFactor,
        baseProtein: currentProt / safeFactor,
        baseCarbs: currentCarb / safeFactor,
        baseFat: currentFat / safeFactor,
        // NEW: Save Cost Data
        cost: currentCost,
        pkgPrice: pkgPrice,
        pkgWeight: pkgWeight
    };

    if (state.tempFood.isNew) {
        state.logs.push(log);
    } else {
        const idx = state.logs.findIndex(l => l.id === log.id);
        if (idx !== -1) {
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


window.deleteLog = function () {
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
        const meal = document.getElementById('editMeal').value;
        // Read current cost values from the edit form
        const currentCost = parseFloat(document.getElementById('editCost').value) || 0;
        const pkgPrice = parseFloat(document.getElementById('editPkgPrice').value) || null;
        const pkgWeight = parseFloat(document.getElementById('editPkgWeight').value) || null;

        const favItem = {
            ...state.tempFood,
            meal,
            cost: currentCost,
            pkgPrice: pkgPrice,
            pkgWeight: pkgWeight
        };
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

window.selectFav = function (index) {
    prepFoodForEdit(state.favorites[index], true);
};

// --- MICROS & DETAILS ---
window.openMicros = function () {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const totals = {};

    // Micros are already scaled when saved, so just sum them directly
    dayLogs.forEach(log => {
        if (log.micros) {
            Object.keys(log.micros).forEach(key => {
                totals[key] = (totals[key] || 0) + (log.micros[key] || 0);
            });
        }
    });

    const groups = {
        'Macro Details': ['sugars', 'fiber', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat'],
        'Minerals': ['sodium', 'potassium', 'calcium', 'magnesium', 'zinc', 'iron', 'phosphorus', 'iodine', 'selenium', 'chloride', 'copper', 'chromium', 'molybdenum', 'manganese'],
        'Vitamins': ['vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k', 'thiamin', 'riboflavin', 'niacin', 'vitamin_b6', 'folic_acid', 'vitamin_b12', 'biotin', 'pantothenic_acid'],
        'Other': ['caffeine', 'water']
    };

    const labels = {
        sugars: 'Sugars (g)', fiber: 'Fiber (g)', saturated_fat: 'Sat. Fat (g)',
        monounsaturated_fat: 'Mono. Fat (g)', polyunsaturated_fat: 'Poly. Fat (g)',
        sodium: 'Sodium (mg)', potassium: 'Potassium (mg)', chloride: 'Chloride (mg)',
        caffeine: 'Caffeine (mg)', water: 'Water (ml/g)',
        vitamin_a: 'Vit A (µg)', thiamin: 'B1 Thiamin (mg)', riboflavin: 'B2 Riboflavin (mg)',
        vitamin_b6: 'Vit B6 (mg)', vitamin_b12: 'Vit B12 (µg)', biotin: 'Biotin (µg)',
        folic_acid: 'Folic Acid (µg)', niacin: 'Niacin (mg)', pantothenic_acid: 'Pantothenic (mg)',
        vitamin_c: 'Vit C (mg)', vitamin_d: 'Vit D3 (µg)', vitamin_e: 'Vit E (mg)',
        vitamin_k: 'Vit K1 (µg)', calcium: 'Calcium (mg)', magnesium: 'Magnesium (mg)',
        zinc: 'Zinc (mg)', chromium: 'Chromium (µg)', molybdenum: 'Molybdenum (µg)',
        iodine: 'Iodine (µg)', selenium: 'Selenium (µg)', phosphorus: 'Phosphorus (mg)',
        manganese: 'Manganese (mg)', iron: 'Iron (mg)', copper: 'Copper (mg)'
    };

    let html = '';

    Object.keys(groups).forEach(groupName => {
        html += `<h4 class="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2 mt-4 first:mt-0">${groupName}</h4>`;
        html += `<div class="space-y-1">`;
        groups[groupName].forEach(key => {
            const val = totals[key] || 0;
            const rdi = RDI_VALUES[key];
            let percentHtml = '';

            if (rdi) {
                const pct = Math.round((val / rdi) * 100);
                percentHtml = `<div class="text-[10px] ${pct >= 100 ? 'text-emerald-400' : 'text-blue-400'}">${pct}%</div>`;
            }

            html += `
                <div class="flex justify-between items-center bg-slate-800 p-2 rounded-lg border border-slate-700">
                    <span class="text-slate-400 text-xs">${labels[key] || key}</span>
                    <div class="text-right">
                        <div class="text-white font-bold text-sm">${Math.round(val * 10) / 10}</div>
                        ${percentHtml}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    });

    document.getElementById('microList').innerHTML = html;
    document.getElementById('microsModal').classList.remove('hidden');
};

// --- MEAL PLANNER ---
window.generateMealPlan = async function () {
    const ingredients = document.getElementById('plannerInput').value;
    if (!ingredients) return alert("Enter ingredients");

    document.getElementById('plannerInput').disabled = true;

    try {
        const res = await fetch('/api/plan-meal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredients })
        });
        const data = await res.json();

        document.getElementById('planTitle').innerText = data.mealName;
        document.getElementById('planRecipe').innerText = data.recipe;
        document.getElementById('planGrocery').innerHTML = data.groceryList.map(i => `<li>${i}</li>`).join('');
        document.getElementById('plannerResult').classList.remove('hidden');
    } catch (e) {
        alert("Failed to generate plan");
    }
    document.getElementById('plannerInput').disabled = false;
};

// --- AI COACH ---
window.askCoach = async function () {
    const input = document.getElementById('coachInput');
    const query = input.value;
    if (!query) return;

    input.value = '';
    const chatArea = document.getElementById('coachChatArea');

    // Add User Message
    chatArea.innerHTML += `
        <div class="flex justify-end mb-4">
            <div class="bg-emerald-600 text-white p-3 rounded-xl rounded-tr-none text-sm max-w-[80%]">
                ${query}
            </div>
        </div>
    `;

    // Add Loading Indicator
    const loadId = Math.random().toString(36);
    chatArea.innerHTML += `
        <div id="${loadId}" class="flex justify-start mb-4">
            <div class="bg-slate-800 text-slate-400 p-3 rounded-xl rounded-tl-none text-sm">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Thinking...
            </div>
        </div>
    `;
    chatArea.scrollTop = chatArea.scrollHeight;

    try {
        const res = await fetch('/api/coach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                logs: state.logs, // Send raw logs (server limits to recent)
                user: state.user
            })
        });
        const data = await res.json();

        // Remove Loader
        document.getElementById(loadId).remove();

        // Render Answer
        let answerHtml = `
            <div class="flex justify-start mb-4 w-full">
                <div class="bg-slate-900 border border-slate-800 text-white p-4 rounded-xl rounded-tl-none text-sm w-full">
                    <div class="prose prose-invert prose-sm mb-3">
                        ${marked.parse(data.answer)}
                    </div>
        `;

        if (data.graphs && data.graphs.length > 0) {
            // Initialize chart storage if not exists
            if (!window.coachCharts) window.coachCharts = [];

            data.graphs.forEach((g, idx) => {
                const canvasId = `chart-${Math.random().toString(36).substr(2)}`;
                answerHtml += `
                    <div class="mt-4 h-64 bg-slate-950 rounded-lg p-2">
                        <canvas id="${canvasId}"></canvas>
                    </div>
                `;
                // Defer chart creation
                setTimeout(() => {
                    const canvas = document.getElementById(canvasId);
                    if (!canvas) return;

                    // Destroy old charts if we have too many (keep last 5)
                    if (window.coachCharts.length >= 5) {
                        const oldChart = window.coachCharts.shift();
                        if (oldChart) oldChart.destroy();
                    }

                    const chart = new Chart(canvas, {
                        type: g.type,
                        data: {
                            labels: g.labels,
                            datasets: g.datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { labels: { color: '#94a3b8' } },
                                title: { display: true, text: g.title, color: '#e2e8f0' }
                            },
                            scales: {
                                y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
                                x: { ticks: { color: '#64748b' }, grid: { display: false } }
                            }
                        }
                    });
                    window.coachCharts.push(chart);
                }, 100);
            });
        }

        answerHtml += `</div></div>`;
        chatArea.innerHTML += answerHtml;

    } catch (e) {
        document.getElementById(loadId).innerHTML = "Error contacting coach.";
    }

    chatArea.scrollTop = chatArea.scrollHeight;
};

// We need a simple markdown parser for the AI text, let's add a basic one or assume simple text
// Since I cannot add libraries easily, I'll use a very simple custom formatter
const marked = {
    parse: (text) => {
        // Escape HTML to prevent XSS
        const escapeHtml = (str) => str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const escaped = escapeHtml(text);
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
            .replace(/\n/g, '<br>') // Newlines
            .replace(/- (.*?)(<br>|$)/g, '• $1$2'); // Bullets
    }
};


// --- PRO SCANNER IMPLEMENTATION (ZXing) ---
let codeReader = null;
let currentStream = null;

window.startScanner = async function () {
    const container = document.getElementById('scanner-container');
    container.classList.remove('hidden');
    container.innerHTML = `
        <video id="video" style="width:100%; height:100%; object-fit:cover;" autoplay muted playsinline></video>
        <div class="absolute inset-0 border-2 border-red-500/50 pointer-events-none" style="top:20%; bottom:20%; left:10%; right:10%;"></div>
        <div class="absolute bottom-2 left-0 right-0 text-center text-xs text-white bg-black/50 p-1">Align barcode in box</div>
    `;

    // 1. Initialize Reader
    if (!codeReader) {
        codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    }

    try {
        // 2. Select Camera (Environment/Back Camera)
        const videoInputDevices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
        const selectedDeviceId = videoInputDevices.find(device => device.label.toLowerCase().includes('back'))?.deviceId
            || videoInputDevices[0].deviceId;

        // 3. Configure Hints
        const hints = new Map();
        const formats = [
            ZXing.BarcodeFormat.EAN_13,
            ZXing.BarcodeFormat.EAN_8,
            ZXing.BarcodeFormat.UPC_A,
            ZXing.BarcodeFormat.UPC_E,
            ZXing.BarcodeFormat.CODE_128
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

        // 4. Start Decoding
        const controls = await codeReader.decodeFromVideoDevice(
            selectedDeviceId,
            'video',
            (result, err, controls) => {
                if (result) {
                    handleScanSuccess(result.text, controls);
                }
            },
            {
                hints: hints,
                timeBetweenScansMillis: 200
            }
        );

        window.activeScannerControls = controls;

        // 5. Apply Focus
        const videoElement = document.getElementById('video');
        if (videoElement && videoElement.srcObject) {
            currentStream = videoElement.srcObject;
            const track = currentStream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();

            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            } else if (capabilities.focusMode && capabilities.focusMode.includes('macro')) {
                await track.applyConstraints({ advanced: [{ focusMode: 'macro' }] });
            }
        }

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="text-red-400 p-4 text-center">Camera Error: ${err.message}<br>Check permissions.</div>`;
    }
};

function handleScanSuccess(text, controls) {
    if (controls) controls.stop();
    stopScanner();

    document.getElementById('searchInput').value = text;

    // Only do barcode search, not text search
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> looking up barcode...</div>';

    fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, mode: 'barcode' })
    }).then(r => r.json()).then(data => {
        if (data && data.length > 0) {
            prepFoodForEdit(data[0], true);
        } else {
            resDiv.innerHTML = '<div class="text-center text-slate-500">Barcode not found. Try text search.</div>';
        }
    }).catch(() => {
        resDiv.innerHTML = '<div class="text-center text-red-500">Network error.</div>';
    });
}

window.stopScanner = function () {
    if (window.activeScannerControls) {
        window.activeScannerControls.stop();
        window.activeScannerControls = null;
    }

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    const container = document.getElementById('scanner-container');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
};

window.manualBarcode = function () {
    const code = prompt("Enter barcode number:");
    if (code) {
        stopScanner();
        document.getElementById('searchInput').value = code;

        // Direct barcode search
        const resDiv = document.getElementById('searchResults');
        resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> checking barcode...</div>';

        fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: code, mode: 'barcode' })
        }).then(r => r.json()).then(data => {
            if (data.length > 0) {
                prepFoodForEdit(data[0], true);
            } else {
                resDiv.innerHTML = '<div class="text-center text-slate-500">Barcode not found in database.</div>';
                // Fallback to text search if barcode fails?
                performSearch(code);
            }
        }).catch(() => {
            resDiv.innerHTML = '<div class="text-center text-red-500">Network Error.</div>';
        });
    }
};

// --- VISION ---
window.triggerVision = function (type) {
    if (type === 'camera') document.getElementById('visionCam').click();
    else document.getElementById('visionGal').click();
};

window.handleVision = async function (input) {
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

window.closeAddModal = () => {
    stopScanner(); // Ensure camera turns off
    document.getElementById('addModal').classList.add('translate-y-full');
};

window.closeEditModal = () => {
    stopScanner(); // Just in case
    document.getElementById('editModal').classList.add('hidden');
};

window.openPlanner = () => document.getElementById('plannerModal').classList.remove('translate-y-full');
window.closePlanner = () => document.getElementById('plannerModal').classList.add('translate-y-full');

window.changeDate = (offset) => {
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + offset);
    state.currentDate = d.toISOString().split('T')[0];
    init();
};

window.exportJSON = () => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 7);

    const recentLogs = state.logs.filter(l => {
        const logDate = new Date(l.date);
        return logDate >= pastDate;
    });

    const exportData = recentLogs.map((l, index) => {
        const factor = (l.unit === 'g' || l.unit === 'ml') ? (l.qty / 100) : l.qty;

        let dateObj;
        if (l.timestamp) {
            dateObj = new Date(l.timestamp);
        } else {
            dateObj = new Date(l.date);
            dateObj.setHours(12, 0, 0, 0);
            dateObj.setSeconds(index % 60);
        }

        const dateString = dateObj.toISOString();

        const item = {
            date: dateString,
            name: l.name,
            calories: Math.round(l.calories),
            protein: Math.round(l.protein * 10) / 10,
            carbs: Math.round(l.carbs * 10) / 10,
            fat: Math.round(l.fat * 10) / 10
        };

        MICRO_KEYS.forEach(key => {
            if (l.micros && l.micros[key]) {
                item[key] = Math.round((l.micros[key] * factor) * 100) / 100;
            }
        });

        return item;
    });

    const finalOutput = { "logs": exportData };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(finalOutput));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `foodlog_sync.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

init();
