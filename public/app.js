const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { kcal: 2000, p: 150, c: 250, f: 70 },
    favorites: JSON.parse(localStorage.getItem('foodlog_favs')) || [],
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
}

// --- SCANNER FIX (Uses Html5Qrcode class reliably) ---
let html5QrCode;

window.startScanner = function() {
    document.getElementById('scanner-wrapper').style.display = 'block';
    
    if (html5QrCode) return; // Prevent double init
    
    html5QrCode = new Html5Qrcode("scanner-container");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
        // Success
        stopScanner();
        performSearch(decodedText, 'barcode');
    }).catch(err => {
        alert("Camera permission denied or error.");
        stopScanner();
    });
};

window.stopScanner = function() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            document.getElementById('scanner-wrapper').style.display = 'none';
        }).catch(() => {
            html5QrCode = null;
            document.getElementById('scanner-wrapper').style.display = 'none';
        });
    } else {
        document.getElementById('scanner-wrapper').style.display = 'none';
    }
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
            if (mode === 'barcode' && data.length > 0) {
                prepFoodForEdit(data[0], true);
                return;
            }
            window.lastSearch = data;
            resDiv.innerHTML = data.map((item, i) => `
                <div onclick="selectSearchItem(${i})" class="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center cursor-pointer mb-2">
                    <div><div class="font-bold">${item.name}</div><div class="text-xs text-slate-500">${Math.round(item.calories)} kcal</div></div>
                    <div class="text-emerald-400">+</div>
                </div>
            `).join('');
        }
    } catch (e) { resDiv.innerHTML = 'Error'; }
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
            // Back-calc base for dynamic editing
            baseCalories: data.calories / factor,
            baseProtein: data.protein / factor,
            baseCarbs: data.carbs / factor,
            baseFat: data.fat / factor,
            micros: data.micros || {},
            source: 'AI Vision'
        };
        prepFoodForEdit(food, true);
    } catch (e) { alert("Vision failed"); }
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
    const btn = document.getElementById('addToFavBtn');
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
        btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
    } else {
        state.favorites.push(state.tempFood);
        btn.innerHTML = '<i class="fa-solid fa-heart text-red-500"></i>';
    }
    localStorage.setItem('foodlog_favs', JSON.stringify(state.favorites));
    if (document.getElementById('view-favs').style.display !== 'none') renderFavs();
};

window.renderFavs = () => {
    document.getElementById('favList').innerHTML = state.favorites.map((f, i) => `
        <div onclick="selectFav(${i})" class="bg-slate-900 p-3 rounded border border-slate-800 flex justify-between cursor-pointer">
            <span>${f.name}</span><span class="text-emerald-400">+</span>
        </div>
    `).join('');
};

window.selectFav = (i) => prepFoodForEdit(state.favorites[i], true);

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
    stopScanner();
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
window.closeAddModal = () => { document.getElementById('addModal').classList.add('translate-y-full'); stopScanner(); };
window.setSearchMode = (mode) => {
    ['search','text','favs'].forEach(m => document.getElementById(`view-${m}`).classList.add('hidden'));
    document.getElementById(`view-${mode}`).classList.remove('hidden');
    if(mode==='favs') renderFavs();
    if(mode==='search') document.getElementById('searchInput').focus();
};
window.changeDate = (o) => {
    const d = new Date(state.currentDate); d.setDate(d.getDate()+o); state.currentDate=d.toISOString().split('T')[0]; init();
};
window.renderProfileValues = () => {
    document.getElementById('manualKcal').value = Math.round(state.user.kcal);
    document.getElementById('manualProt').value = Math.round(state.user.p);
    document.getElementById('manualCarb').value = Math.round(state.user.c);
    document.getElementById('manualFat').value = Math.round(state.user.f);
};
window.saveManualGoals = () => {
    state.user.kcal = parseFloat(document.getElementById('manualKcal').value)||2000;
    state.user.p = parseFloat(document.getElementById('manualProt').value)||150;
    state.user.c = parseFloat(document.getElementById('manualCarb').value)||250;
    state.user.f = parseFloat(document.getElementById('manualFat').value)||70;
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    renderDashboard(); closeProfile();
};
window.calculateGoals = () => {
    const w = parseFloat(document.getElementById('pWeight').value), h = parseFloat(document.getElementById('pHeight').value), a = parseFloat(document.getElementById('pAge').value), act = parseFloat(document.getElementById('pActivity').value), g = parseFloat(document.getElementById('pGoal').value);
    if(!w) return;
    const bmr = (10*w)+(6.25*h)-(5*a)+5; 
    const kcal = (bmr*act)+g;
    state.user = { kcal, p: (kcal*0.3)/4, c: (kcal*0.35)/4, f: (kcal*0.35)/9 };
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
    renderProfileValues(); renderDashboard(); closeProfile();
};
window.openProfile = () => document.getElementById('profileModal').classList.remove('translate-y-full');
window.closeProfile = () => document.getElementById('profileModal').classList.add('translate-y-full');
window.closeEditModal = () => document.getElementById('editModal').classList.add('hidden');
window.openMicros = () => {
    document.getElementById('microsModal').classList.remove('hidden');
    const logs = state.logs.filter(l=>l.date===state.currentDate);
    const m={};
    logs.forEach(l=>{ if(l.micros) Object.keys(l.micros).forEach(k=> m[k]=(m[k]||0)+(l.micros[k]*((l.unit==='g'||l.unit==='ml')?l.qty/100:l.qty))); });
    document.getElementById('microList').innerHTML = Object.keys(m).length ? Object.keys(m).map(k=>`<div class="flex justify-between border-b border-slate-800 py-2 text-slate-300"><span>${k.replace('_',' ')}</span><span>${Math.round(m[k])}</span></div>`).join('') : '<div class="text-center text-slate-500">No data</div>';
};
window.switchTab = (id) => {
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('fabAdd').style.display = id === 'view-diary' ? 'flex' : 'none';
};
window.generateMealPlan = async () => {
    const ing = document.getElementById('plannerInput').value;
    if(!ing) return;
    try {
        const res = await fetch('/api/plan-meal', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ingredients:ing})});
        const data = await res.json();
        document.getElementById('planTitle').innerText = data.mealName;
        document.getElementById('planRecipe').innerText = data.recipe;
        document.getElementById('planGrocery').innerHTML = data.groceryList.map(s=>`<li>${s}</li>`).join('');
        document.getElementById('plannerResult').classList.remove('hidden');
    } catch(e){}
};
window.editExistingLog = (id) => { const l=state.logs.find(x=>x.id===id); if(l) prepFoodForEdit(l, false); };

// Init listeners
document.getElementById('searchInput').addEventListener('input', (e) => { clearTimeout(window.st); window.st=setTimeout(()=>performSearch(e.target.value), 600); });
init();
