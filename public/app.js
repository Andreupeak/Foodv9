const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { 
        kcal: 2000, p: 150, c: 250, f: 70 
    },
    favorites: JSON.parse(localStorage.getItem('foodlog_favs')) || [],
    workoutPlan: JSON.parse(localStorage.getItem('foodlog_workout')) || null,
    currentDate: new Date().toISOString().split('T')[0],
    selectedMeal: 'Breakfast',
    tempFood: null
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function init() {
    renderDate();
    renderMeals();
    renderDashboard();
    renderProfileValues();
    renderWorkoutPlan();
}

// --- TAB SWITCHING ---
window.switchTab = function(targetId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if(btn.dataset.target === targetId) btn.classList.add('text-emerald-400');
        else btn.classList.remove('text-emerald-400');
    });

    const fab = document.getElementById('fabAdd');
    if(targetId === 'view-diary') fab.style.display = 'flex';
    else fab.style.display = 'none';
};

// --- RENDERERS ---
function renderDate() {
    const d = new Date(state.currentDate);
    document.getElementById('headerDate').innerText = d.toDateString();
}

function renderMeals() {
    const container = document.getElementById('mealsContainer');
    container.innerHTML = '';
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);

    MEALS.forEach(meal => {
        const mealLogs = dayLogs.filter(l => l.meal === meal);
        const mealCals = mealLogs.reduce((acc, c) => acc + (c.calories || 0), 0);
        let html = `<div class="bg-slate-900 rounded-2xl border border-slate-800 p-4"><div class="flex justify-between items-center mb-3"><h3 class="font-bold text-slate-200">${meal}</h3><span class="text-xs text-slate-500 font-mono">${Math.round(mealCals)} kcal</span></div><div class="space-y-3">`;
        
        if(!mealLogs.length) html += `<div class="text-xs text-slate-600 italic py-2">Empty</div>`;
        else mealLogs.forEach(l => {
            html += `<div onclick="editExistingLog('${l.id}')" class="flex justify-between items-center border-b border-slate-800 pb-2 last:border-0 cursor-pointer"><div><div class="font-medium text-slate-200 text-sm">${l.name}</div><div class="text-xs text-slate-500">${l.qty}${l.unit}</div></div><div class="text-xs text-emerald-500">${Math.round(l.calories)}</div></div>`;
        });
        html += `</div><button onclick="openAddModal('${meal}')" class="mt-3 w-full py-2 text-xs font-bold uppercase text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 rounded-xl">+ Add</button></div>`;
        container.innerHTML += html;
    });
}

function renderDashboard() {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const totals = dayLogs.reduce((acc, c) => ({ kcal: acc.kcal + c.calories, p: acc.p + c.protein, c: acc.c + c.carbs, f: acc.f + c.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
    
    const rem = Math.round(state.user.kcal - totals.kcal);
    document.getElementById('calRemaining').innerText = rem;
    const pct = Math.min((totals.kcal / state.user.kcal) * 100, 100);
    document.getElementById('calCircle').style.setProperty('--percent', `${pct}%`);
    document.getElementById('calCircle').style.setProperty('--color', rem < 0 ? '#ef4444' : '#34d399');

    ['carb', 'prot', 'fat'].forEach(k => {
        const key = k === 'prot' ? 'p' : k === 'carb' ? 'c' : 'f';
        const val = totals[key];
        const max = state.user[key];
        document.getElementById(`${k}Val`).innerText = `${Math.round(val)}/${Math.round(max)}g`;
        document.getElementById(`${k}Bar`).style.width = `${Math.min((val/max)*100, 100)}%`;
    });
}

// --- MANUAL GOALS ---
function renderProfileValues() {
    // Fill Manual Inputs with current state
    document.getElementById('manualKcal').value = Math.round(state.user.kcal);
    document.getElementById('manualProt').value = Math.round(state.user.p);
    document.getElementById('manualCarb').value = Math.round(state.user.c);
    document.getElementById('manualFat').value = Math.round(state.user.f);
}

window.saveManualGoals = function() {
    state.user.kcal = parseFloat(document.getElementById('manualKcal').value) || 2000;
    state.user.p = parseFloat(document.getElementById('manualProt').value) || 150;
    state.user.c = parseFloat(document.getElementById('manualCarb').value) || 250;
    state.user.f = parseFloat(document.getElementById('manualFat').value) || 70;
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    renderDashboard();
    closeProfile();
    alert("Manual targets saved!");
};

window.calculateGoals = function() {
    const w = parseFloat(document.getElementById('pWeight').value);
    const h = parseFloat(document.getElementById('pHeight').value);
    const a = parseFloat(document.getElementById('pAge').value);
    const act = parseFloat(document.getElementById('pActivity').value);
    const goal = parseFloat(document.getElementById('pGoal').value);
    
    if(!w || !h || !a) return alert("Fill all fields");

    let bmr = (10 * w) + (6.25 * h) - (5 * a) + 5; // Simplified male base
    const tdee = bmr * act;
    const kcal = tdee + goal;
    
    // Auto update state
    state.user = { 
        kcal, 
        p: (kcal*0.3)/4, 
        c: (kcal*0.35)/4, 
        f: (kcal*0.35)/9 
    };
    renderProfileValues(); // Update manual inputs to reflect calc
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    alert("Calculated! You can adjust values below if needed.");
};

// --- TEXT PARSER ---
window.parseTextIngredients = async function() {
    const text = document.getElementById('multiInput').value;
    if(!text) return;
    
    try {
        const res = await fetch('/api/parse-ingredients', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text })
        });
        const items = await res.json();
        
        items.forEach(item => {
            state.logs.push({
                id: Math.random().toString(36).substr(2, 9),
                date: state.currentDate,
                meal: state.selectedMeal,
                name: item.name,
                qty: item.qty, unit: item.unit,
                calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
                baseCalories: item.calories, // Approximate base as total for now
                baseProtein: item.protein, baseCarbs: item.carbs, baseFat: item.fat,
                micros: {}
            });
        });
        localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
        closeAddModal();
        renderMeals();
        renderDashboard();
        alert(`Added ${items.length} items!`);
    } catch(e) {
        alert("Failed to parse");
    }
};

// --- WORKOUTS ---
window.updateRecoveryLabel = (val) => {
    document.getElementById('recoveryVal').innerText = val + '%';
    document.getElementById('recoveryVal').style.color = val < 40 ? '#ef4444' : val > 70 ? '#34d399' : '#facc15';
};

window.openWorkoutGenModal = () => document.getElementById('workoutModal').classList.remove('translate-y-full');

window.generateWorkoutPlan = async function() {
    const recovery = document.getElementById('recoverySlider').value;
    const type = document.getElementById('wType').value;
    const days = document.getElementById('wDays').value;
    const equip = document.getElementById('wEquip').value;
    
    document.getElementById('workoutModal').classList.add('translate-y-full');
    document.getElementById('workoutPlanDisplay').innerHTML = '<div class="text-center p-10"><i class="fa-solid fa-dumbbell fa-bounce text-emerald-500 text-3xl"></i><br>Generating Routine...</div>';

    try {
        const res = await fetch('/api/plan-workout', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ type, days, recovery, equipment: equip })
        });
        const plan = await res.json();
        state.workoutPlan = plan;
        localStorage.setItem('foodlog_workout', JSON.stringify(plan));
        renderWorkoutPlan();
    } catch(e) {
        alert("Error generating plan");
    }
};

function renderWorkoutPlan() {
    const div = document.getElementById('workoutPlanDisplay');
    if(!state.workoutPlan) return;
    
    div.innerHTML = state.workoutPlan.map(day => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 class="font-bold text-emerald-400 mb-2">${day.day}</h3>
            <div class="space-y-2">
                ${day.exercises.map(ex => `
                    <div class="flex justify-between items-start text-sm border-l-2 border-slate-700 pl-3">
                        <div>
                            <div class="text-slate-200 font-medium">${ex.name}</div>
                            <div class="text-xs text-slate-500">${ex.note || ''}</div>
                        </div>
                        <div class="text-slate-400 font-mono">${ex.sets}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// --- STANDARD ADD/EDIT/SEARCH (Refined from previous) ---
window.openAddModal = (meal) => {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    document.getElementById('searchInput').focus();
    renderFavs();
};

window.setSearchMode = (mode) => {
    ['search', 'text', 'favs'].forEach(m => {
        document.getElementById(`view-${m}`).classList.add('hidden');
        document.getElementById(`view-${m}`).classList.remove('flex');
        document.getElementById(`tab-${m}`).className = "text-slate-400 pb-1";
    });
    document.getElementById(`view-${mode}`).classList.remove('hidden');
    document.getElementById(`view-${mode}`).classList.add('flex');
    document.getElementById(`tab-${mode}`).className = "text-emerald-400 border-b-2 border-emerald-400 pb-1";
};

// Listeners
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(window.st);
    window.st = setTimeout(() => doSearch(e.target.value), 600);
});

async function doSearch(q) {
    if(q.length < 2) return;
    const div = document.getElementById('searchResults');
    div.innerHTML = '<div class="text-center text-slate-500 mt-4">Searching...</div>';
    try {
        const res = await fetch('/api/search', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ query: q, mode: 'text' })
        });
        const data = await res.json();
        window.lastSearch = data;
        div.innerHTML = data.map((item, i) => `
            <div onclick="prepEdit(window.lastSearch[${i}], true)" class="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center cursor-pointer">
                <div><div class="font-bold">${item.name}</div><div class="text-xs text-slate-500">${item.source}</div></div>
                <div class="text-emerald-400">+</div>
            </div>
        `).join('');
    } catch(e) { div.innerHTML = 'Error'; }
}

window.prepEdit = (item, isNew) => {
    state.tempFood = { ...item, isNew, baseCalories: item.calories/(item.base_qty||100)*100, baseProtein: item.protein/(item.base_qty||100)*100, baseCarbs: item.carbs/(item.base_qty||100)*100, baseFat: item.fat/(item.base_qty||100)*100 };
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editName').innerText = item.name;
    document.getElementById('editQty').value = 100;
    updateEdit();
};

document.getElementById('editQty').addEventListener('input', updateEdit);
document.getElementById('editUnit').addEventListener('change', updateEdit);

function updateEdit() {
    const qty = parseFloat(document.getElementById('editQty').value)||0;
    const unit = document.getElementById('editUnit').value;
    const f = (unit==='g'||unit==='ml') ? qty/100 : qty;
    document.getElementById('editKcal').innerText = Math.round(state.tempFood.baseCalories*f);
    document.getElementById('editProt').innerText = Math.round(state.tempFood.baseProtein*f);
    document.getElementById('editCarb').innerText = Math.round(state.tempFood.baseCarbs*f);
    document.getElementById('editFat').innerText = Math.round(state.tempFood.baseFat*f);
}

window.saveLog = () => {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const f = (unit==='g'||unit==='ml') ? qty/100 : qty;
    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2,9) : state.tempFood.id,
        date: state.currentDate, meal: state.selectedMeal, name: state.tempFood.name, qty, unit,
        calories: state.tempFood.baseCalories*f, protein: state.tempFood.baseProtein*f, carbs: state.tempFood.baseCarbs*f, fat: state.tempFood.baseFat*f,
        baseCalories: state.tempFood.baseCalories, baseProtein: state.tempFood.baseProtein, baseCarbs: state.tempFood.baseCarbs, baseFat: state.tempFood.baseFat,
        micros: state.tempFood.micros
    };
    if(state.tempFood.isNew) state.logs.push(log);
    else state.logs[state.logs.findIndex(l=>l.id===log.id)] = log;
    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('addModal').classList.add('translate-y-full');
    renderMeals(); renderDashboard();
};

window.editExistingLog = (id) => {
    const log = state.logs.find(l => l.id === id);
    if(log) prepEdit(log, false);
};

// Utils
window.openProfile = () => document.getElementById('profileModal').classList.remove('translate-y-full');
window.closeProfile = () => document.getElementById('profileModal').classList.add('translate-y-full');
window.closeAddModal = () => document.getElementById('addModal').classList.add('translate-y-full');
window.closeEditModal = () => document.getElementById('editModal').classList.add('hidden');
window.openMicros = () => {
    document.getElementById('microsModal').classList.remove('hidden');
    // Simple Micros Aggregation
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const m = { vitamin_a:0, vitamin_c:0, calcium:0, iron:0 };
    dayLogs.forEach(l => { if(l.micros) Object.keys(l.micros).forEach(k => m[k] = (m[k]||0) + (l.micros[k] * ((l.unit==='g'||l.unit==='ml')?l.qty/100:l.qty))); });
    document.getElementById('microList').innerHTML = Object.keys(m).map(k => `<div class="flex justify-between p-2 border-b border-slate-800 text-slate-300"><span>${k.replace('_',' ')}</span><span>${Math.round(m[k])}</span></div>`).join('');
};

function renderFavs() {
    document.getElementById('favList').innerHTML = state.favorites.map(f => `<div onclick="prepEdit(window.state.favorites.find(x=>x.name==='${f.name}'), true)" class="bg-slate-900 p-3 rounded border border-slate-800">${f.name}</div>`).join('');
}

// Init
init();
