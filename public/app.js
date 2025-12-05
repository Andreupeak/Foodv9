// --- CONFIG & LISTS ---
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

[cite_start]// Categorized Nutrient Keys for Loops [cite: 1]
const NUTRIENT_GROUPS = {
    details: ['sugar', 'fiber', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat', 'sodium', 'potassium', 'chloride', 'caffeine', 'water'],
    vitamins: ['vitamin_a', 'thiamin', 'riboflavin', 'vitamin_b6', 'vitamin_b12', 'biotin', 'folic_acid', 'niacin', 'pantothenic_acid', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k'],
    minerals: ['calcium', 'magnesium', 'zinc', 'chromium', 'molybdenum', 'iodine', 'selenium', 'phosphorus', 'manganese', 'iron', 'copper']
};

// Flattened list for calculations
const ALL_NUTRIENTS = [...NUTRIENT_GROUPS.details, ...NUTRIENT_GROUPS.vitamins, ...NUTRIENT_GROUPS.minerals];

const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { kcal: 2000, p: 150, c: 250, f: 70 },
    favorites: JSON.parse(localStorage.getItem('foodlog_favs')) || [],
    currentDate: new Date().toISOString().split('T')[0],
    selectedMeal: 'Breakfast',
    tempFood: null,
    activeTab: 'search',
    mainView: 'diary' // diary vs coach
};

// --- INIT ---
function init() {
    renderDate();
    renderMeals();
    renderDashboard();
    // Pre-build Edit Modal Inputs
    buildEditModalInputs();
}

// --- NAVIGATION ---
window.switchMainView = function(view) {
    state.mainView = view;
    if(view === 'diary') {
        document.getElementById('main-view').classList.remove('hidden');
        document.getElementById('view-coach').classList.add('hidden');
    } else {
        document.getElementById('main-view').classList.add('hidden');
        document.getElementById('view-coach').classList.remove('hidden');
        document.getElementById('view-coach').classList.add('flex');
    }
    // Update Nav Icons opacity/color
    document.querySelectorAll('.nav-item').forEach(btn => {
        if(btn.innerText.toLowerCase().includes(view)) btn.classList.add('text-emerald-400');
        else btn.classList.remove('text-emerald-400');
    });
};

// --- MANUAL BARCODE ---
window.toggleManualBarcode = function() {
    const el = document.getElementById('manualBarcodeInput');
    el.classList.toggle('hidden');
    if(!el.classList.contains('hidden')) document.getElementById('pasteBarcode').focus();
};

window.searchManualBarcode = function() {
    const code = document.getElementById('pasteBarcode').value;
    if(code) {
        document.getElementById('searchInput').value = code;
        fetch('/api/search', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ query: code, mode: 'barcode' })
        }).then(r => r.json()).then(data => {
            if(data.length > 0) prepFoodForEdit(data[0], true);
            else alert("Not found");
        });
    }
};

[cite_start]// --- AI COACH [cite: 6] ---
window.askCoach = async function() {
    const input = document.getElementById('coachInput');
    const query = input.value;
    if(!query) return;

    // Add user message to UI
    const chat = document.getElementById('coachChat');
    chat.innerHTML += `<div class="bg-emerald-900/30 p-3 rounded-xl rounded-tr-none border border-emerald-900 ml-auto max-w-[80%] text-sm text-white">${query}</div>`;
    input.value = '';
    chat.scrollTop = chat.scrollHeight;

    // Get last 7 days history
    const history = state.logs.filter(l => {
        const d = new Date(l.date);
        const now = new Date();
        return (now - d) / (1000 * 60 * 60 * 24) < 7;
    });

    try {
        chat.innerHTML += `<div id="coachLoading" class="text-xs text-slate-500 italic">Coach is thinking...</div>`;
        const res = await fetch('/api/coach', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ history, query })
        });
        const data = await res.json();
        
        document.getElementById('coachLoading').remove();
        // Simple formatter for markdown-like bolding
        const fmt = data.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
        
        chat.innerHTML += `<div class="bg-slate-900 p-3 rounded-xl rounded-tl-none border border-slate-800 text-sm text-slate-300 mr-auto max-w-[90%]">${fmt}</div>`;
        chat.scrollTop = chat.scrollHeight;
    } catch(e) {
        document.getElementById('coachLoading').innerHTML = "Error contacting coach.";
    }
};

[cite_start]// --- EXTENDED EDIT MODAL LOGIC [cite: 4] ---
function buildEditModalInputs() {
    // Dynamically build the inputs for vitamins/minerals so index.html isn't huge
    const createInput = (key) => `
        <div>
            <label class="text-[10px] text-slate-500 capitalize">${key.replace(/_/g, ' ')}</label>
            <input id="val_${key}" class="input-dark" type="number" placeholder="0">
        </div>`;

    document.getElementById('editVitaminsContainer').innerHTML = NUTRIENT_GROUPS.vitamins.map(createInput).join('');
    document.getElementById('editMineralsContainer').innerHTML = NUTRIENT_GROUPS.minerals.map(createInput).join('');
}

window.prepFoodForEdit = function(item, isNew) {
    if(window.stopScanner) window.stopScanner();

    // Verification Logic: If it's a "Vision" source, the item comes with estimated_weight_g
    // We treat this weight as the default Qty, but allow user to edit it.
    let currentQty = item.qty || 100;
    if(item.estimated_weight_g) currentQty = item.estimated_weight_g;

    // Calculate base values (per 1 unit) to allow scaling
    const factor = (item.unit === 'g' || item.unit === 'ml') ? (item.base_qty || 100) / 100 : 1;
    // Note: If coming from search, item values are usually per 100g. 
    // If coming from Vision, item values are for the WHOLE portion (estimated_weight_g).
    
    // Normalize to "Base per 1 unit (1g or 1 serving)" for the logic
    let baseMult = 1;
    if(item.source === 'AI Vision' || item.source === 'AI Estimate') {
         // Vision/AI returns total values for the specific weight
         baseMult = (item.unit === 'g' && currentQty > 0) ? 1/currentQty : 1; 
    } else {
         // Database returns per 100g usually
         baseMult = 0.01; 
    }

    state.tempFood = {
        ...item,
        isNew,
        // Store base values (per 1g) for scaling
        base: {
            calories: item.calories * baseMult,
            protein: item.protein * baseMult,
            carbs: item.carbs * baseMult,
            fat: item.fat * baseMult,
            nutrients: {}
        }
    };

    // Flatten nutrients into base
    const nuts = item.nutrients || {};
    ALL_NUTRIENTS.forEach(k => {
        state.tempFood.base.nutrients[k] = (nuts[k] || 0) * baseMult;
    });

    openEditModal(currentQty);
};

window.createEmptyLog = function() {
    const emptyItem = {
        name: "New Food", qty: 100, unit: 'g', source: 'Manual',
        calories: 0, protein: 0, carbs: 0, fat: 0, nutrients: {}
    };
    prepFoodForEdit(emptyItem, true);
};

function openEditModal(qtyOverride) {
    const f = state.tempFood;
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editNameVal').value = f.name;
    document.getElementById('editSource').innerText = f.source || 'Manual';
    
    document.getElementById('editQty').value = qtyOverride || f.qty || 100;
    document.getElementById('editUnit').value = f.unit || 'g';
    
    updateEditFields(); // Populate inputs
}

// Recalculate displayed values when Qty changes
document.getElementById('editQty').addEventListener('input', updateEditFields);
document.getElementById('editUnit').addEventListener('change', updateEditFields);

function updateEditFields() {
    const qty = parseFloat(document.getElementById('editQty').value) || 0;
    // For simplicity, assuming g/ml are linear. 
    const totalFactor = qty; 

    const base = state.tempFood.base;
    
    // Set Macros
    document.getElementById('val_calories').value = Math.round(base.calories * totalFactor);
    document.getElementById('val_protein').value = (base.protein * totalFactor).toFixed(1);
    document.getElementById('val_carbs').value = (base.carbs * totalFactor).toFixed(1);
    document.getElementById('val_fat').value = (base.fat * totalFactor).toFixed(1);

    // Set All Nutrients
    ALL_NUTRIENTS.forEach(k => {
        const val = (base.nutrients[k] || 0) * totalFactor;
        const el = document.getElementById(`val_${k}`);
        if(el) el.value = val > 0 ? val.toFixed(1) : ''; // Leave empty if 0 for cleaner look
    });
}

window.saveLog = function() {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const name = document.getElementById('editNameVal').value;
    const meal = document.getElementById('editMeal').value;

    // Re-read values from inputs (allowing user to override calculation)
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;

    const nutrients = {};
    ALL_NUTRIENTS.forEach(k => {
        nutrients[k] = getVal(`val_${k}`);
    });

    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
        timestamp: new Date().toISOString(),
        meal, name, qty, unit,
        calories: getVal('val_calories'),
        protein: getVal('val_protein'),
        carbs: getVal('val_carbs'),
        fat: getVal('val_fat'),
        nutrients: nutrients, // New expanded structure
        // Keep base for future edits if needed, though simpler to just re-calc on edit
        base: state.tempFood.base 
    };

    if (state.tempFood.isNew) state.logs.push(log);
    else {
        const idx = state.logs.findIndex(l => l.id === log.id);
        if (idx !== -1) state.logs[idx] = log;
    }

    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    closeEditModal();
    document.getElementById('addModal').classList.add('translate-y-full');
    init();
};

[cite_start]// --- UPDATED MICROS VIEW [cite: 1] ---
window.openMicros = function() {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const totals = {};

    dayLogs.forEach(log => {
        ALL_NUTRIENTS.forEach(k => {
            const val = log.nutrients ? (log.nutrients[k] || 0) : 0; // Log values are already total
            totals[k] = (totals[k] || 0) + val;
        });
    });

    const renderGroup = (title, keys) => `
        <div class="mb-4">
            <h4 class="text-emerald-400 font-bold mb-2 uppercase text-xs">${title}</h4>
            ${keys.map(k => {
                const val = totals[k] || 0;
                return `<div class="flex justify-between border-b border-slate-800 py-1">
                    <span class="text-slate-400 capitalize">${k.replace(/_/g, ' ')}</span>
                    <span class="text-white">${Math.round(val*10)/10}</span>
                </div>`;
            }).join('')}
        </div>
    `;

    let html = '';
    html += renderGroup('Details (g/mg)', NUTRIENT_GROUPS.details);
    html += renderGroup('Vitamins', NUTRIENT_GROUPS.vitamins);
    html += renderGroup('Minerals', NUTRIENT_GROUPS.minerals);

    document.getElementById('microList').innerHTML = html;
    document.getElementById('microsModal').classList.remove('hidden');
};

// ... keep existing utils (closeAddModal, closeEditModal, etc.) ...
[cite_start]// Ensure `handleVision` calls `prepFoodForEdit(data, true)` to trigger the verification step [cite: 7]
window.handleVision = async function(input) {
    if (!input.files[0]) return;
    document.getElementById('searchResults').innerHTML = '<div class="text-center mt-10">AI analyzing...</div>';

    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const res = await fetch('/api/vision', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.name) {
             // Pass straight to edit for "Verify" step
            prepFoodForEdit({
                ...data,
                source: 'AI Vision'
            }, true);
        }
    } catch (e) {
        alert("Vision failed");
    }
};

init();
