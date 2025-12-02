// --- STATE ---
const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { kcal: 2000, p: 150, c: 250, f: 70 },
    currentDate: new Date().toISOString().split('T')[0],
    selectedMeal: 'Breakfast',
    tempFood: null // Holds the food currently being edited/added
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// --- INIT ---
function init() {
    renderDate();
    renderMeals();
    renderDashboard();
    setupEventListeners();
}

function setupEventListeners() {
    // Dynamic calculation listeners in Edit Modal
    document.getElementById('editQty').addEventListener('input', updateEditPreview);
    document.getElementById('editUnit').addEventListener('change', updateEditPreview);
    
    // Search Debounce
    let timeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => performSearch(e.target.value), 600);
    });
}

// --- RENDER ---
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
            <div class="bg-white rounded-xl shadow-sm p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-gray-700">${meal}</h3>
                    <span class="text-sm text-gray-400">${Math.round(mealCals)} kcal</span>
                </div>
                <div class="space-y-3">
        `;

        if(mealLogs.length === 0) {
            html += `<div class="text-sm text-gray-300 italic">No food logged</div>`;
        } else {
            mealLogs.forEach(log => {
                // We pass the ID to openEditModal, NOT the object string (avoids bugs)
                html += `
                    <div onclick="openEditModal('${log.id}', true)" class="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0 cursor-pointer active:bg-gray-50">
                        <div>
                            <div class="font-medium text-gray-800">${log.name}</div>
                            <div class="text-xs text-gray-400">${log.qty}${log.unit} • ${Math.round(log.calories)} kcal</div>
                        </div>
                        <div class="text-xs text-gray-300">P:${Math.round(log.protein)}</div>
                    </div>
                `;
            });
        }

        html += `
                </div>
                <button onclick="openAddModal('${meal}')" class="mt-3 w-full py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100">
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

    const remaining = state.user.kcal - totals.kcal;
    const percent = Math.min((totals.kcal / state.user.kcal) * 100, 100);
    
    document.getElementById('calRemaining').innerText = Math.round(remaining);
    document.getElementById('calCircle').style.setProperty('--percent', `${percent}%`);
    document.getElementById('calCircle').style.setProperty('--color', remaining < 0 ? '#ef4444' : '#10b981');

    updateBar('carb', totals.c, state.user.c);
    updateBar('prot', totals.p, state.user.p);
    updateBar('fat', totals.f, state.user.f);
}

function updateBar(type, val, max) {
    const pct = Math.min((val / max) * 100, 100);
    document.getElementById(`${type}Val`).innerText = `${Math.round(val)}/${max}g`;
    document.getElementById(`${type}Bar`).style.width = `${pct}%`;
}

// --- ADD / EDIT LOGIC ---

// 1. Open Add Modal
function openAddModal(meal) {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    // Reset search
    document.getElementById('searchResults').innerHTML = '<div class="text-center text-gray-400 mt-10">Search, Scan or Paste</div>';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchInput').focus();
}

// 2. Search API
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
        
        if(data.error) {
            resDiv.innerHTML = '<div class="text-center text-gray-400">No results found</div>';
        } else {
            const results = Array.isArray(data) ? data : [data];
            window.lastSearchResults = results; // Store globally to access in onclick

            resDiv.innerHTML = results.map((item, index) => `
                <div onclick="selectFoodFromSearch(${index})" class="flex justify-between items-center p-3 bg-white border border-gray-100 shadow-sm rounded-xl cursor-pointer hover:border-emerald-500 transition mb-2">
                    <div>
                        <div class="font-bold text-gray-700">${item.name}</div>
                        <div class="text-xs text-gray-400">per 100g: ${Math.round(item.calories)} kcal</div>
                        <div class="text-[10px] text-gray-300 uppercase">${item.source}</div>
                    </div>
                    <button class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">+</button>
                </div>
            `).join('');
        }
    } catch (e) {
        resDiv.innerHTML = '<div class="text-red-400 text-center">Error</div>';
    }
}

// 3. Select Item -> Open Edit Modal (PRE-POPULATED)
function selectFoodFromSearch(index) {
    const item = window.lastSearchResults[index];
    
    // Normalize data structure for tempFood
    state.tempFood = {
        name: item.name,
        // Store BASE values (per 100g) so we can scale them
        baseCalories: (item.calories / (item.base_qty || 100)) * 100,
        baseProtein: (item.protein / (item.base_qty || 100)) * 100,
        baseCarbs: (item.carbs / (item.base_qty || 100)) * 100,
        baseFat: (item.fat / (item.base_qty || 100)) * 100,
        source: item.source,
        isNew: true
    };

    openEditModal(null, false);
}

// 4. Open Edit Modal (Handles both New and Existing)
function openEditModal(logId, isExisting) {
    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');

    if (isExisting) {
        const log = state.logs.find(l => l.id === logId);
        state.tempFood = { ...log, isNew: false };
        
        // If it's an existing log, we need to reverse-engineer base nutrition if not stored
        // But for new logs we store 'baseCalories'. For old compatibility:
        if(!state.tempFood.baseCalories) {
            const factor = state.tempFood.unit === 'g' || state.tempFood.unit === 'ml' ? (state.tempFood.qty/100) : state.tempFood.qty;
            state.tempFood.baseCalories = state.tempFood.calories / factor;
            state.tempFood.baseProtein = state.tempFood.protein / factor;
            state.tempFood.baseCarbs = state.tempFood.carbs / factor;
            state.tempFood.baseFat = state.tempFood.fat / factor;
        }
    }

    // Populate UI
    document.getElementById('editName').innerText = state.tempFood.name;
    document.getElementById('editQty').value = state.tempFood.qty || 100;
    document.getElementById('editUnit').value = state.tempFood.unit || 'g';
    
    // Setup Save Button
    const btn = document.getElementById('saveEditBtn');
    btn.innerText = isExisting ? 'Update Log' : 'Add to Diary';
    btn.onclick = () => saveLog();
    
    // If existing, add delete button option (optional, simplified here)
    
    updateEditPreview();
}

// 5. Update Preview (The Magic Math)
function updateEditPreview() {
    const qty = parseFloat(document.getElementById('editQty').value) || 0;
    const unit = document.getElementById('editUnit').value;
    
    let factor = 1;
    
    if (unit === 'g' || unit === 'ml') {
        factor = qty / 100;
    } else {
        // portion
        factor = qty; 
    }

    const cals = state.tempFood.baseCalories * factor;
    const p = state.tempFood.baseProtein * factor;
    const c = state.tempFood.baseCarbs * factor;
    const f = state.tempFood.baseFat * factor;

    document.getElementById('editKcal').innerText = Math.round(cals);
    document.getElementById('editProt').innerText = Math.round(p);
    document.getElementById('editCarbs').innerText = Math.round(c);
    document.getElementById('editFat').innerText = Math.round(f);
}

// 6. Save Log
function saveLog() {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    
    // Calculate final values to store
    let factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
    
    const finalLog = {
        id: state.tempFood.id || Math.random().toString(36).substr(2, 9),
        date: state.currentDate,
        meal: state.selectedMeal,
        name: state.tempFood.name,
        qty: qty,
        unit: unit,
        // Store calculated values
        calories: state.tempFood.baseCalories * factor,
        protein: state.tempFood.baseProtein * factor,
        carbs: state.tempFood.baseCarbs * factor,
        fat: state.tempFood.baseFat * factor,
        // Store base values for future editing
        baseCalories: state.tempFood.baseCalories,
        baseProtein: state.tempFood.baseProtein,
        baseCarbs: state.tempFood.baseCarbs,
        baseFat: state.tempFood.baseFat
    };

    if (state.tempFood.isNew) {
        state.logs.push(finalLog);
    } else {
        const idx = state.logs.findIndex(l => l.id === finalLog.id);
        if (idx !== -1) state.logs[idx] = finalLog;
    }

    saveState();
    closeEditModal();
    closeAddModal();
    init(); // Refresh UI
}

// --- MULTI INGREDIENT PARSER ---
async function parseIngredients() {
    const text = document.getElementById('multiInput').value;
    if (!text) return;

    const resDiv = document.getElementById('multiResults');
    resDiv.innerHTML = '<div class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> AI Analyzing...</div>';

    try {
        const res = await fetch('/api/parse-ingredients', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text })
        });
        const items = await res.json();
        
        // Render checkboxes
        resDiv.innerHTML = items.map((item, i) => `
            <div class="flex items-center gap-3 p-3 bg-white rounded-lg border">
                <input type="checkbox" checked id="chk-${i}" class="w-5 h-5 text-emerald-500 rounded">
                <div class="flex-1">
                    <div class="font-bold">${item.name}</div>
                    <div class="text-xs text-gray-500">${item.qty} ${item.unit} • ${item.calories} kcal</div>
                </div>
            </div>
        `).join('') + `<button onclick="addMultiItems(${JSON.stringify(items).replace(/"/g, '&quot;')})" class="w-full mt-3 py-2 bg-emerald-600 text-white rounded-lg font-bold">Add Selected</button>`;
        
        // Note: we passed the object string above for simplicity in this specific "multi" helper, 
        // but normally we'd use global state.
        window.tempMultiItems = items;
    } catch (e) {
        resDiv.innerHTML = 'Error parsing';
    }
}

window.addMultiItems = function() {
    const items = window.tempMultiItems;
    items.forEach((item, i) => {
        if (document.getElementById(`chk-${i}`).checked) {
            state.logs.push({
                id: Math.random().toString(36).substr(2, 9),
                date: state.currentDate,
                meal: state.selectedMeal,
                name: item.name,
                qty: item.qty,
                unit: item.unit,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                // AI returns total, so we approximate base
                baseCalories: item.calories, // Treat as "per portion" effectively if unit is portion
                baseProtein: item.protein,
                baseCarbs: item.carbs,
                baseFat: item.fat
            });
        }
    });
    saveState();
    closeAddModal();
    init();
}

// --- VISION ---
function triggerVision(type) {
    if (type === 'camera') document.getElementById('visionCam').click();
    else document.getElementById('visionGal').click();
}

async function handleVision(input) {
    if (!input.files[0]) return;
    
    // Show Loading
    document.getElementById('searchResults').innerHTML = '<div class="text-center mt-10"><i class="fa-solid fa-brain fa-bounce text-purple-500 text-2xl"></i><br>AI is analyzing photo & portions...</div>';

    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const res = await fetch('/api/vision', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.name) {
            // Transform vision result into tempFood format
            state.tempFood = {
                name: data.name,
                qty: data.estimated_weight_g || 100,
                unit: 'g',
                // Vision returns TOTAL for the estimated weight
                // We need to back-calculate base (per 100g) for the edit modal logic
                baseCalories: (data.calories / data.estimated_weight_g) * 100,
                baseProtein: (data.protein / data.estimated_weight_g) * 100,
                baseCarbs: (data.carbs / data.estimated_weight_g) * 100,
                baseFat: (data.fat / data.estimated_weight_g) * 100,
                source: 'AI Vision',
                isNew: true
            };
            openEditModal(null, false);
        }
    } catch (e) {
        document.getElementById('searchResults').innerHTML = 'Error analyzing image';
    }
}

// --- UTILS ---
function setSearchMode(mode) {
    if(mode === 'single') {
        document.getElementById('mode-single').classList.remove('hidden');
        document.getElementById('mode-single').classList.add('flex');
        document.getElementById('mode-multi').classList.add('hidden');
        document.getElementById('mode-multi').classList.remove('flex');
        document.getElementById('tab-single').classList.add('text-emerald-600', 'border-b-2');
        document.getElementById('tab-single').classList.remove('text-gray-400');
        document.getElementById('tab-multi').classList.remove('text-emerald-600', 'border-b-2');
        document.getElementById('tab-multi').classList.add('text-gray-400');
    } else {
        document.getElementById('mode-single').classList.add('hidden');
        document.getElementById('mode-single').classList.remove('flex');
        document.getElementById('mode-multi').classList.remove('hidden');
        document.getElementById('mode-multi').classList.add('flex');
        document.getElementById('tab-multi').classList.add('text-emerald-600', 'border-b-2');
        document.getElementById('tab-multi').classList.remove('text-gray-400');
        document.getElementById('tab-single').classList.remove('text-emerald-600', 'border-b-2');
        document.getElementById('tab-single').classList.add('text-gray-400');
    }
}

function closeAddModal() {
    document.getElementById('addModal').classList.add('translate-y-full');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

function changeDate(offset) {
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + offset);
    state.currentDate = d.toISOString().split('T')[0];
    init();
}

function saveState() {
    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
}

// --- SCANNER ---
let html5QrcodeScanner;
function startScanner() {
    document.getElementById('scanner-container').classList.remove('hidden');
    if(!html5QrcodeScanner) html5QrcodeScanner = new Html5Qrcode("scanner-container");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess);
}

function stopScanner() {
    if(html5QrcodeScanner) html5QrcodeScanner.stop().then(() => {
        document.getElementById('scanner-container').classList.add('hidden');
    });
}

async function onScanSuccess(decodedText) {
    stopScanner();
    performSearch(decodedText); // Re-use search logic but with barcode mode handled in backend
}

init();
