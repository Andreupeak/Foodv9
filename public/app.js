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
    tempFood: null
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

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

// --- GOAL CALCULATOR ---
function renderProfileValues() {
    ['Weight', 'Height', 'Age', 'Gender', 'Activity', 'Goal'].forEach(k => {
        const key = k.toLowerCase();
        const el = document.getElementById(`p${k}`);
        if(el && state.user[key]) el.value = state.user[key];
    });
    document.getElementById('targetKcal').innerText = Math.round(state.user.kcal);
    document.getElementById('targetProt').innerText = Math.round(state.user.p) + 'g';
    document.getElementById('targetCarb').innerText = Math.round(state.user.c) + 'g';
    document.getElementById('targetFat').innerText = Math.round(state.user.f) + 'g';
}

window.calculateGoals = function() {
    const w = parseFloat(document.getElementById('pWeight').value);
    const h = parseFloat(document.getElementById('pHeight').value);
    const a = parseFloat(document.getElementById('pAge').value);
    const g = document.getElementById('pGender').value;
    const act = parseFloat(document.getElementById('pActivity').value);
    const goalOffset = parseFloat(document.getElementById('pGoal').value);

    // Mifflin-St Jeor Equation
    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr += (g === 'male' ? 5 : -161);

    const tdee = bmr * act;
    const targetKcal = tdee + goalOffset;

    // Macro Split (Moderate: 30% P, 35% C, 35% F) - adjustable in future
    const p = (targetKcal * 0.30) / 4;
    const c = (targetKcal * 0.35) / 4;
    const f = (targetKcal * 0.35) / 9;

    state.user = { weight: w, height: h, age: a, gender: g, activity: act, goal: goalOffset, kcal: targetKcal, p, c, f };
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    
    renderProfileValues();
    renderDashboard();
    closeProfile();
    alert("Goals updated!");
};

// --- ADD / SEARCH / FAVORITES ---
window.openAddModal = function(meal) {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchInput').focus();
    renderFavorites();
};

window.setSearchMode = function(mode) {
    if (mode === 'search') {
        document.getElementById('view-search').classList.remove('hidden');
        document.getElementById('view-search').classList.add('flex');
        document.getElementById('view-favs').classList.add('hidden');
        document.getElementById('view-favs').classList.remove('flex');
        document.getElementById('tab-search').className = "text-emerald-400 border-b-2 border-emerald-400 pb-1";
        document.getElementById('tab-favs').className = "text-slate-400 pb-1";
    } else {
        document.getElementById('view-search').classList.add('hidden');
        document.getElementById('view-search').classList.remove('flex');
        document.getElementById('view-favs').classList.remove('hidden');
        document.getElementById('view-favs').classList.add('flex');
        document.getElementById('tab-favs').className = "text-emerald-400 border-b-2 border-emerald-400 pb-1";
        document.getElementById('tab-search').className = "text-slate-400 pb-1";
    }
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

// Select Item & Edit Logic
window.selectFoodFromSearch = function(index) {
    const item = window.lastSearchResults[index];
    prepFoodForEdit(item, true);
};

window.editExistingLog = function(id) {
    const log = state.logs.find(l => l.id === id);
    if(log) {
        // Recover base values if missing (backward compatibility)
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
    state.tempFood = {
        ...item,
        isNew,
        // Ensure base values exist (from DB or current log)
        baseCalories: item.baseCalories || (item.calories / (item.base_qty || 100)) * 100,
        baseProtein: item.baseProtein || (item.protein / (item.base_qty || 100)) * 100,
        baseCarbs: item.baseCarbs || (item.carbs / (item.base_qty || 100)) * 100,
        baseFat: item.baseFat || (item.fat / (item.base_qty || 100)) * 100,
        micros: item.micros || {}
    };

    // Update Favorites Heart State
    const isFav = state.favorites.some(f => f.name === state.tempFood.name);
    const favBtn = document.getElementById('addToFavBtn');
    favBtn.innerHTML = isFav ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';
    favBtn.onclick = () => toggleFavorite();

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
    
    // If unit is 'portion', factor is just qty. If 'g'/'ml', factor is qty/100
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;

    document.getElementById('editKcal').innerText = Math.round(state.tempFood.baseCalories * factor);
    document.getElementById('editProt').innerText = Math.round(state.tempFood.baseProtein * factor);
    document.getElementById('editCarbs').innerText = Math.round(state.tempFood.baseCarbs * factor);
    document.getElementById('editFat').innerText = Math.round(state.tempFood.baseFat * factor);
}

window.saveLog = function() {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
    
    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
        meal: state.selectedMeal,
        name: state.tempFood.name,
        qty, unit,
        calories: state.tempFood.baseCalories * factor,
        protein: state.tempFood.baseProtein * factor,
        carbs: state.tempFood.baseCarbs * factor,
        fat: state.tempFood.baseFat * factor,
        micros: state.tempFood.micros, // Pass through micros
        // Save bases for future edits
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
    closeEditModal();
    document.getElementById('addModal').classList.add('translate-y-full');
    init();
};

// --- FAVORITES ---
function toggleFavorite() {
    const existingIdx = state.favorites.findIndex(f => f.name === state.tempFood.name);
    if (existingIdx !== -1) {
        state.favorites.splice(existingIdx, 1);
        document.getElementById('addToFavBtn').innerHTML = '<i class="fa-regular fa-heart"></i>';
    } else {
        state.favorites.push(state.tempFood);
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
            // Factor calc logic again
            const factor = (log.unit === 'g' || log.unit === 'ml') ? (log.qty / 100) : log.qty;
            Object.keys(log.micros).forEach(key => {
                micros[key] = (micros[key] || 0) + (log.micros[key] * factor);
            });
        }
    });

    // RDI Defaults (EU roughly)
    const rdi = { vitamin_a: 800, vitamin_c: 80, vitamin_d: 5, calcium: 1000, iron: 14, zinc: 10 };
    const labels = { vitamin_a: 'Vit A (µg)', vitamin_c: 'Vit C (mg)', vitamin_d: 'Vit D (µg)', calcium: 'Calcium (mg)', iron: 'Iron (mg)', zinc: 'Zinc (mg)' };

    document.getElementById('microList').innerHTML = Object.keys(rdi).map(key => {
        const val = micros[key] || 0;
        const pct = Math.round((val / rdi[key]) * 100);
        return `
            <div class="flex justify-between items-center bg-slate-800 p-2 rounded-lg">
                <span class="text-slate-400">${labels[key]}</span>
                <div class="text-right">
                    <div class="text-white font-bold">${Math.round(val)}</div>
                    <div class="text-[10px] ${pct >= 100 ? 'text-emerald-400' : 'text-blue-400'}">${pct}% RDI</div>
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
let html5QrcodeScanner;
window.startScanner = function() {
    document.getElementById('scanner-container').classList.remove('hidden');
    
    // Fix: Clear previous instance if exists
    if(html5QrcodeScanner) { 
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
    }

    html5QrcodeScanner = new Html5Qrcode("scanner-container");
    const config = { fps: 15, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 };
    
    html5QrcodeScanner.start({ facingMode: "environment" }, config, (decodedText) => {
        // Success
        html5QrcodeScanner.stop().then(() => {
            document.getElementById('scanner-container').classList.add('hidden');
            performSearch(decodedText); // Send barcode to search
            // Special flag to tell search endpoint it's a barcode
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
        });
    }, (err) => {
        // console.log(err); // Ignore per-frame errors
    });
};

// --- VISION ---
window.triggerVision = function(type) {
    if (type === 'camera') document.getElementById('visionCam').click();
    else document.getElementById('visionGal').click();
};

window.handleVision = async function(input) {
    if (!input.files[0]) return;
    
    // Show Loading
    document.getElementById('searchResults').innerHTML = '<div class="text-center mt-10"><i class="fa-solid fa-brain fa-bounce text-emerald-500 text-2xl"></i><br>AI is analyzing photo...</div>';

    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const res = await fetch('/api/vision', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.name) {
            // AI returns estimated total, calculate base (per 100g)
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

window.exportCSV = () => {
    const rows = state.logs.map(l => [l.date, l.meal, l.name, l.qty + l.unit, l.calories]);
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    window.open(encodedUri);
};

init();
