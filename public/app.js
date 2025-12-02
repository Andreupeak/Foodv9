const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { kcal: 2000, p: 150, c: 250, f: 70 },
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
    renderWorkoutPlan();
}

// --- SCANNER FIX ---
let html5QrcodeScanner = null;

window.startScanner = function() {
    const container = document.getElementById('scanner-container');
    container.classList.remove('hidden');
    
    if (html5QrcodeScanner) {
        // Already running
        return;
    }

    html5QrcodeScanner = new Html5Qrcode("scanner-container");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrcodeScanner.start({ facingMode: "environment" }, config, (decodedText) => {
        // Success
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
            container.classList.add('hidden');
            performSearch(decodedText, 'barcode');
        });
    }).catch(err => {
        console.error(err);
        container.classList.add('hidden');
        alert("Camera error. Please ensure permissions are granted.");
    });
};

// --- SEARCH & VISION ---
async function performSearch(query, mode = 'text') {
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = '<div class="text-center text-slate-500 mt-4">Searching...</div>';
    
    try {
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query, mode })
        });
        const data = await res.json();
        
        if (data.error || data.length === 0) {
            resDiv.innerHTML = '<div class="text-center text-slate-500">No results found.</div>';
        } else {
            // If barcode or single result, open edit immediately
            if (mode === 'barcode' && data.length > 0) {
                prepFoodForEdit(data[0], true);
                return;
            }
            
            // List results
            window.lastSearch = data;
            resDiv.innerHTML = data.map((item, i) => `
                <div onclick="selectSearchItem(${i})" class="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center cursor-pointer mb-2">
                    <div><div class="font-bold">${item.name}</div><div class="text-xs text-slate-500">${Math.round(item.calories)} kcal</div></div>
                    <div class="text-emerald-400">+</div>
                </div>
            `).join('');
        }
    } catch (e) {
        resDiv.innerHTML = 'Error';
    }
}

window.selectSearchItem = (index) => prepFoodForEdit(window.lastSearch[index], true);

window.triggerVision = (type) => document.getElementById(type === 'camera' ? 'visionCam' : 'visionGal').click();

window.handleVision = async function(input) {
    if (!input.files[0]) return;
    document.getElementById('searchResults').innerHTML = '<div class="text-center mt-10">AI Analyzing...</div>';
    
    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const res = await fetch('/api/vision', { method: 'POST', body: formData });
        const data = await res.json();
        
        // Prepare AI Result for Editing
        const weight = data.estimated_weight_g || 100;
        const factor = weight / 100;
        
        const food = {
            name: data.name,
            qty: weight,
            unit: 'g',
            calories: data.calories, // AI returns total for portion
            protein: data.protein,
            carbs: data.carbs,
            fat: data.fat,
            // Back-calc base
            baseCalories: data.calories / factor,
            baseProtein: data.protein / factor,
            baseCarbs: data.carbs / factor,
            baseFat: data.fat / factor,
            micros: data.micros || {},
            source: 'AI Vision'
        };
        
        prepFoodForEdit(food, true);
        
    } catch (e) {
        alert("Vision failed");
    }
};

// --- EDIT & FAVORITES ---
function prepFoodForEdit(item, isNew) {
    state.tempFood = { 
        ...item, 
        isNew,
        baseCalories: item.baseCalories || (item.calories / (item.qty/100||1)),
        baseProtein: item.baseProtein || (item.protein / (item.qty/100||1)),
        baseCarbs: item.baseCarbs || (item.carbs / (item.qty/100||1)),
        baseFat: item.baseFat || (item.fat / (item.qty/100||1))
    };
    
    // Check Fav Status
    const isFav = state.favorites.some(f => f.name === item.name);
    const btn = document.getElementById('addToFavBtn');
    btn.innerHTML = isFav ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';
    
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editName').innerText = item.name;
    document.getElementById('editQty').value = item.qty || 100;
    updateEdit();
}

document.getElementById('editQty').addEventListener('input', updateEdit);
document.getElementById('editUnit').addEventListener('change', updateEdit);

function updateEdit() {
    const qty = parseFloat(document.getElementById('editQty').value) || 0;
    const unit = document.getElementById('editUnit').value;
    const f = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
    
    document.getElementById('editKcal').innerText = Math.round(state.tempFood.baseCalories * f);
    document.getElementById('editProt').innerText = Math.round(state.tempFood.baseProtein * f);
    document.getElementById('editCarb').innerText = Math.round(state.tempFood.baseCarbs * f);
    document.getElementById('editFat').innerText = Math.round(state.tempFood.baseFat * f);
}

window.toggleFavorite = function() {
    const idx = state.favorites.findIndex(f => f.name === state.tempFood.name);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
        document.getElementById('addToFavBtn').innerHTML = '<i class="fa-regular fa-heart"></i>';
    } else {
        state.favorites.push(state.tempFood);
        document.getElementById('addToFavBtn').innerHTML = '<i class="fa-solid fa-heart text-red-500"></i>';
    }
    localStorage.setItem('foodlog_favs', JSON.stringify(state.favorites));
    if (document.getElementById('view-favs').style.display !== 'none') renderFavs();
};

// --- WORKOUTS ---
window.generateWorkoutPlan = async function() {
    const recovery = document.getElementById('recoverySlider').value;
    const level = document.getElementById('wLevel').value;
    const activity = document.getElementById('wActivity').value;
    const type = document.getElementById('wType').value;
    const days = document.getElementById('wDays').value;
    const equip = document.getElementById('wEquip').value;
    
    document.getElementById('workoutModal').classList.add('translate-y-full');
    document.getElementById('workoutPlanDisplay').innerHTML = '<div class="text-center p-10">Generating...</div>';

    try {
        const res = await fetch('/api/plan-workout', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ type, days, recovery, equipment: equip, level, activity })
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
    if (!state.workoutPlan) return;
    
    div.innerHTML = state.workoutPlan.map(day => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 class="font-bold text-emerald-400 mb-2">${day.day}</h3>
            <div class="space-y-3">
                ${day.exercises.map(ex => `
                    <div class="flex justify-between items-center text-sm border-l-2 border-slate-700 pl-3">
                        <div>
                            <div class="text-slate-200 font-medium">${ex.name}</div>
                            <div class="text-xs text-slate-500">${ex.sets} • ${ex.form_tip || 'Focus on form'}</div>
                        </div>
                        <a href="[https://www.youtube.com/results?search_query=$](https://www.youtube.com/results?search_query=$){encodeURIComponent(ex.name + ' exercise form')}" target="_blank" class="text-xs bg-slate-800 text-blue-400 px-2 py-1 rounded border border-slate-700">
                            <i class="fa-brands fa-youtube"></i> Watch
                        </a>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// --- STANDARD ---
window.saveLog = function() {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const f = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
    
    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
        meal: state.selectedMeal,
        name: state.tempFood.name,
        qty, unit,
        calories: state.tempFood.baseCalories * f,
        protein: state.tempFood.baseProtein * f,
        carbs: state.tempFood.baseCarbs * f,
        fat: state.tempFood.baseFat * f,
        micros: state.tempFood.micros,
        // Persist bases
        baseCalories: state.tempFood.baseCalories,
        baseProtein: state.tempFood.baseProtein,
        baseCarbs: state.tempFood.baseCarbs,
        baseFat: state.tempFood.baseFat
    };
    
    if (state.tempFood.isNew) state.logs.push(log);
    else state.logs[state.logs.findIndex(l => l.id === log.id)] = log;
    
    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('addModal').classList.add('translate-y-full');
    renderMeals();
    renderDashboard();
};

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
                id: Math.random().toString(36).substr(2,9),
                date: state.currentDate, meal: state.selectedMeal, name: item.name,
                qty: item.qty, unit: item.unit,
                calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
                baseCalories: item.calories, baseProtein: item.protein, baseCarbs: item.carbs, baseFat: item.fat
            });
        });
        localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
        closeAddModal();
        renderMeals();
        renderDashboard();
    } catch(e) { alert("Parsing failed"); }
};

// Utils
window.openAddModal = (meal) => { if(meal) state.selectedMeal = meal; document.getElementById('addModal').classList.remove('translate-y-full'); };
window.closeAddModal = () => { document.getElementById('addModal').classList.add('translate-y-full'); };
window.setSearchMode = (mode) => {
    ['search','text','favs'].forEach(m => document.getElementById(`view-${m}`).classList.add('hidden'));
    document.getElementById(`view-${mode}`).classList.remove('hidden');
    if(mode==='favs') renderFavs();
};
window.renderFavs = () => {
    document.getElementById('favList').innerHTML = state.favorites.map(f => `
        <div onclick="prepFoodForEdit(state.favorites.find(x=>x.name==='${f.name}'), true)" class="bg-slate-900 p-3 rounded border border-slate-800 flex justify-between">
            <span>${f.name}</span><span class="text-emerald-400">+</span>
        </div>
    `).join('');
};
window.changeDate = (o) => {
    const d = new Date(state.currentDate); d.setDate(d.getDate()+o); state.currentDate=d.toISOString().split('T')[0]; init();
};
window.openProfile = () => document.getElementById('profileModal').classList.remove('translate-y-full');
window.closeProfile = () => document.getElementById('profileModal').classList.add('translate-y-full');
window.openMicros = () => document.getElementById('microsModal').classList.remove('hidden');
window.openWorkoutGenModal = () => document.getElementById('workoutModal').classList.remove('translate-y-full');
window.switchTab = (id) => {
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('fabAdd').style.display = id === 'view-diary' ? 'flex' : 'none';
};

init();
