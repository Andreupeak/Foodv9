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
    'vitamin_a', 'thiamin', 'riboflavin', 'vitamin_b6', 'vitamin_b12', 'biotin', 
    'folic_acid', 'niacin', 'pantothenic_acid', 'vitamin_c', 'vitamin_d', 'vitamin_e', 
    'vitamin_k', 'calcium', 'magnesium', 'zinc', 'chromium', 'molybdenum', 'iodine', 
    'selenium', 'phosphorus', 'manganese', 'iron', 'copper'
];

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
                <div class="space-y-3">`;

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
                    </div>`;
            });
        }
        html += `</div>
                <button onclick="openAddModal('${meal}')" class="mt-3 w-full py-2.5 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 rounded-xl hover:bg-emerald-900/50 transition">
                    + Add Food
                </button>
            </div>`;
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

    const target = state.user.manualKcal ? state.user.kcal : state.user.kcal;
    const remaining = Math.round(target - totals.kcal);
    const percent = Math.min((totals.kcal / target) * 100, 100);
    
    document.getElementById('calRemaining').innerText = remaining;
    document.getElementById('calCircle').style.setProperty('--percent', `${percent}%`);
    document.getElementById('calCircle').style.setProperty('--color', remaining < 0 ? '#ef4444' : '#34d399');

    updateBar('carb', totals.c, state.user.manualCarb || state.user.c);
    updateBar('prot', totals.p, state.user.manualProt || state.user.p);
    updateBar('fat', totals.f, state.user.manualFat || state.user.f);
}

function updateBar(type, val, max) {
    const pct = Math.min((val / max) * 100, 100);
    document.getElementById(`${type}Val`).innerText = `${Math.round(val)}/${Math.round(max)}g`;
    document.getElementById(`${type}Bar`).style.width = `${pct}%`;
}

// --- MODALS ---
window.openAddModal = (meal) => {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    setSearchMode('search');
};

window.setSearchMode = (mode) => {
    state.activeTab = mode;
    const views = ['search', 'analyze', 'create', 'favs'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const tab = document.getElementById(`tab-${v}`);
        if(v === mode) {
            el.classList.remove('hidden'); el.classList.add('flex');
            tab.className = "text-emerald-400 border-b-2 border-emerald-400 pb-1 whitespace-nowrap";
        } else {
            el.classList.add('hidden'); el.classList.remove('flex');
            tab.className = "text-slate-400 pb-1 whitespace-nowrap";
        }
    });
    if(mode === 'search') setTimeout(() => document.getElementById('searchInput').focus(), 100);
    if(mode === 'favs') renderFavorites();
};

// --- ANALYZE ITEMIZATION ---
window.analyzeIngredients = async () => {
    const input = document.getElementById('analyzeInput').value;
    if(!input) return alert("Enter ingredients");
    const resDiv = document.getElementById('analyzeResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> analyzing...</div>';

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: input })
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        
        window.lastAnalyzedItems = data.items || [];
        resDiv.innerHTML = window.lastAnalyzedItems.map((item, idx) => `
            <div onclick="selectAnalyzedItem(${idx})" class="p-3 bg-slate-800 rounded-xl border border-slate-700 cursor-pointer hover:border-emerald-500 transition mb-2">
                <div class="flex justify-between">
                    <div class="font-bold text-white mb-1">${item.name}</div>
                    <div class="text-xs text-slate-400">${item.qty}${item.unit}</div>
                </div>
                <div class="grid grid-cols-4 text-center text-xs">
                    <div class="bg-slate-900 p-1 rounded text-slate-500">Kcal <span class="text-white block">${Math.round(item.calories)}</span></div>
                    <div class="bg-slate-900 p-1 rounded text-slate-500">P <span class="text-red-400 block">${Math.round(item.protein)}</span></div>
                    <div class="bg-slate-900 p-1 rounded text-slate-500">C <span class="text-blue-400 block">${Math.round(item.carbs)}</span></div>
                    <div class="bg-slate-900 p-1 rounded text-slate-500">F <span class="text-yellow-400 block">${Math.round(item.fat)}</span></div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        resDiv.innerHTML = '<div class="text-red-400 text-center">Failed</div>';
    }
};

window.selectAnalyzedItem = (index) => {
    const item = window.lastAnalyzedItems[index];
    if(!item.base_qty) item.base_qty = item.qty; 
    prepFoodForEdit(item, true);
};

// --- EDIT & SAVE ---
function prepFoodForEdit(item, isNew) {
    const factor = (item.base_qty && item.base_qty !== 0) ? item.base_qty : 1;
    const isPer100 = (item.unit === 'g' || item.unit === 'ml') && item.base_qty === 100;
    const normFactor = isPer100 ? 1 : factor;

    state.tempFood = {
        ...item,
        isNew,
        baseCalories: item.baseCalories || (item.calories / normFactor),
        baseProtein: item.baseProtein || (item.protein / normFactor),
        baseCarbs: item.baseCarbs || (item.carbs / normFactor),
        baseFat: item.baseFat || (item.fat / normFactor),
        micros: item.micros || {}
    };

    const isFav = state.favorites.some(f => f.name === state.tempFood.name);
    document.getElementById('addToFavBtn').innerHTML = isFav ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';
    document.getElementById('addToFavBtn').onclick = () => toggleFavorite();

    document.getElementById('editMeal').value = item.meal || state.selectedMeal;
    document.getElementById('editName').innerText = state.tempFood.name;
    document.getElementById('editSource').innerText = state.tempFood.source || 'Database';
    document.getElementById('editQty').value = state.tempFood.qty || 100;
    document.getElementById('editUnit').value = state.tempFood.unit || 'g';
    
    document.getElementById('btnDeleteLog').classList.toggle('hidden', isNew);
    
    document.getElementById('editModal').classList.remove('hidden');
    updateEditPreview();
}

window.saveLog = () => {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const meal = document.getElementById('editMeal').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
    
    state.selectedMeal = meal;

    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
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
        if (idx !== -1) state.logs[idx] = log;
    }

    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    document.getElementById('editModal').classList.add('hidden');
    if (state.activeTab !== 'analyze') {
        document.getElementById('addModal').classList.add('translate-y-full');
    }
    init();
};

window.deleteLog = () => {
    if(confirm("Delete this item?")) {
        const idx = state.logs.findIndex(l => l.id === state.tempFood.id);
        if (idx !== -1) {
            state.logs.splice(idx, 1);
            localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
        }
        document.getElementById('editModal').classList.add('hidden');
        init();
    }
};

window.saveManualItem = () => {
    const name = document.getElementById('manName').value;
    if(!name) return alert("Name required");
    const qty = parseFloat(document.getElementById('manQty').value) || 100;
    const unit = document.getElementById('manUnit').value || 'g';
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty; 

    const micros = {};
    MICRO_KEYS.forEach(k => micros[k] = getVal(`man_${k}`) / factor);

    const item = {
        name, qty, unit,
        baseCalories: getVal('manKcal') / factor,
        baseProtein: getVal('manProt') / factor,
        baseCarbs: getVal('manCarb') / factor,
        baseFat: getVal('manFat') / factor,
        micros, source: 'Manual'
    };
    prepFoodForEdit(item, true);
};

// --- EXPORT / IMPORT HEALTH ---
window.openExportModal = () => document.getElementById('exportModal').classList.remove('hidden');

window.exportHealthData = () => {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    
    // Init all totals
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    MICRO_KEYS.forEach(k => totals[k] = 0);

    dayLogs.forEach(log => {
        totals.calories += (log.calories || 0);
        totals.protein += (log.protein || 0);
        totals.carbs += (log.carbs || 0);
        totals.fat += (log.fat || 0);

        if(log.micros) {
            // Ensure we apply the correct portion factor to micros
            const factor = (log.unit === 'g' || log.unit === 'ml') ? (log.qty / 100) : log.qty;
            MICRO_KEYS.forEach(k => {
                if(log.micros[k]) totals[k] += (log.micros[k] * factor);
            });
        }
    });

    const data = JSON.stringify({
        date: new Date().toISOString(),
        ...totals
    });

    if(navigator.clipboard) {
        navigator.clipboard.writeText(data).then(() => {
            alert("Full data copied! Run the 'Log Food' Shortcut.");
        });
    } else {
        prompt("Copy JSON for Shortcut:", data);
    }
};

// --- SEARCH & MISC ---
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
        const res = await fetch('/api/search', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ query, mode: 'text' }) });
        const data = await res.json();
        if(!data || data.length === 0) resDiv.innerHTML = '<div class="text-center text-slate-500">No results found.</div>';
        else {
            window.lastSearchResults = data;
            resDiv.innerHTML = data.map((item, index) => `
                <div onclick="selectFoodFromSearch(${index})" class="flex justify-between items-center p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer hover:border-emerald-500 transition">
                    <div><div class="font-bold text-slate-200">${item.name}</div><div class="text-xs text-slate-500">100g: ${Math.round(item.calories)} kcal</div></div>
                    <button class="w-8 h-8 rounded-full bg-emerald-900 text-emerald-400 flex items-center justify-center border border-emerald-800">+</button>
                </div>`).join('');
        }
    } catch(e) { resDiv.innerHTML = '<div class="text-red-400 text-center">Error</div>'; }
}

// Helper window functions
window.selectFoodFromSearch = (i) => prepFoodForEdit(window.lastSearchResults[i], true);
window.openProfile = () => {
    document.getElementById('profileModal').classList.remove('translate-y-full');
    renderProfileValues();
};
window.closeProfile = () => document.getElementById('profileModal').classList.add('translate-y-full');
window.closeAddModal = () => document.getElementById('addModal').classList.add('translate-y-full');
window.closeEditModal = () => document.getElementById('editModal').classList.add('hidden');
window.openPlanner = () => document.getElementById('plannerModal').classList.remove('translate-y-full');
window.closePlanner = () => document.getElementById('plannerModal').classList.add('translate-y-full');
window.editQty.addEventListener('input', updateEditPreview);
window.editUnit.addEventListener('change', updateEditPreview);
window.changeDate = (offset) => {
    const d = new Date(state.currentDate); d.setDate(d.getDate() + offset);
    state.currentDate = d.toISOString().split('T')[0]; init();
};
window.calculateGoals = function() {
    const w = parseFloat(document.getElementById('pWeight').value), h = parseFloat(document.getElementById('pHeight').value), a = parseFloat(document.getElementById('pAge').value), g = document.getElementById('pGender').value, act = parseFloat(document.getElementById('pActivity').value), goal = parseFloat(document.getElementById('pGoal').value);
    let bmr = (10 * w) + (6.25 * h) - (5 * a) + (g === 'male' ? 5 : -161);
    const targetKcal = (bmr * act) + goal;
    state.user = { ...state.user, weight: w, height: h, age: a, gender: g, activity: act, goal: goal, kcal: targetKcal, p: (targetKcal * 0.3)/4, c: (targetKcal * 0.35)/4, f: (targetKcal * 0.35)/9 };
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    renderProfileValues(); renderDashboard(); closeProfile();
};
window.saveManualGoals = function() {
    state.user.manualKcal = parseFloat(document.getElementById('manualKcal').value);
    state.user.manualProt = parseFloat(document.getElementById('manualProt').value);
    state.user.manualCarb = parseFloat(document.getElementById('manualCarb').value);
    state.user.manualFat = parseFloat(document.getElementById('manualFat').value);
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    renderProfileValues(); renderDashboard(); closeProfile();
};
window.exportCSV = () => {
    const rows = state.logs.map(l => [l.date, l.meal, l.name, l.qty + l.unit, l.calories]);
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    window.open(encodeURI(csvContent));
};
init();
