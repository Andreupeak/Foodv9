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
    chatHistory: [] 
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// --- NUTRIENT DEFINITIONS ---
const MICRO_GROUPS = {
    'Breakdown': ['sugar', 'fiber', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat', 'trans_fat', 'cholesterol'],
    'Electrolytes & Stimulants': ['sodium', 'potassium', 'caffeine', 'water'],
    'Vitamins': ['vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k', 'thiamin', 'riboflavin', 'niacin', 'vitamin_b6', 'folic_acid', 'vitamin_b12', 'biotin', 'pantothenic_acid'],
    'Minerals': ['calcium', 'magnesium', 'iron', 'zinc', 'phosphorus', 'iodine', 'selenium', 'chloride', 'manganese', 'copper', 'chromium', 'molybdenum']
};

// FIX: Flatten keys for export and saving
const ALL_MICROS = Object.values(MICRO_GROUPS).flat();

// --- INIT ---
function init() {
    renderDate();
    renderMeals();
    renderDashboard();
    renderManualInputs(); 
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
                            <div class="text-[10px] text-slate-500">
                                ${log.qty}${log.unit} 
                                ${log.micros && log.micros.caffeine > 0 ? `<i class="fa-solid fa-mug-hot ml-1 text-yellow-600"></i>` : ''}
                            </div>
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

// --- SWITCH VIEW ---
window.switchView = function(viewName) {
    document.getElementById('view-diary').classList.add('hidden');
    document.getElementById('view-stats').classList.add('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.replace('text-emerald-400', 'text-slate-500'));
    
    if (viewName === 'diary') {
        document.getElementById('view-diary').classList.remove('hidden');
        document.querySelector('button[onclick="switchView(\'diary\')"]').classList.replace('text-slate-500', 'text-emerald-400');
    } else if (viewName === 'stats') {
        document.getElementById('view-stats').classList.remove('hidden');
        document.querySelector('button[onclick="switchView(\'stats\')"]').classList.replace('text-slate-500', 'text-emerald-400');
    }
};

// --- ASK AI COACH ---
window.setCoachQuery = (txt) => {
    document.getElementById('coachInput').value = txt;
    askCoach();
};

window.askCoach = async function() {
    const input = document.getElementById('coachInput');
    const query = input.value.trim();
    if(!query) return;

    const container = document.getElementById('coachChatContainer');
    container.innerHTML += `<div class="bg-slate-800 p-3 rounded-xl rounded-tr-none mb-2 ml-10 text-right text-sm">${query}</div>`;
    input.value = '';
    
    const loadingId = 'loading-' + Date.now();
    container.innerHTML += `<div id="${loadingId}" class="bg-slate-900 border border-slate-800 p-3 rounded-xl rounded-tl-none mb-2 mr-10 text-sm text-slate-400"><i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> Thinking...</div>`;
    container.scrollTop = container.scrollHeight;

    try {
        const res = await fetch('/api/ask-coach', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                query, 
                logs: state.logs, 
                user: state.user 
            })
        });
        const data = await res.json();
        document.getElementById(loadingId).remove();
        const htmlContent = marked.parse(data.answer);
        container.innerHTML += `<div class="bg-slate-900 border border-slate-800 p-3 rounded-xl rounded-tl-none mb-2 mr-2 text-sm text-slate-200 prose prose-invert max-w-none">${htmlContent}</div>`;
        container.scrollTop = container.scrollHeight;

    } catch(e) {
        document.getElementById(loadingId).innerHTML = "Error contacting coach.";
    }
};

// --- MANUAL EDITING SETUP (Dynamic Inputs for Create & Edit) ---
function renderManualInputs() {
    // 1. Populate Edit Modal (All Micros)
    const editContainer = document.getElementById('manualMicrosContainer');
    if (editContainer) {
        editContainer.innerHTML = '';
        const vitMins = [...MICRO_GROUPS['Vitamins'], ...MICRO_GROUPS['Minerals']];
        vitMins.forEach(k => {
            editContainer.innerHTML += `
                <div>
                    <label class="text-[9px] text-slate-500 capitalize">${k.replace(/_/g, ' ')}</label>
                    <input id="ov_${k}" class="input-dark text-sm" type="number">
                </div>
            `;
        });
    }

    // 2. Populate Create Tab (All Micros)
    const createContainer = document.getElementById('createMicrosContainer');
    if (createContainer) {
        createContainer.innerHTML = '';
        ALL_MICROS.forEach(k => {
             createContainer.innerHTML += `
                <div>
                    <label class="text-[9px] text-slate-500 capitalize">${k.replace(/_/g, ' ')}</label>
                    <input id="man_${k}" class="input-dark text-sm" type="number">
                </div>
            `;
        });
    }
}

// --- FIX: RESTORED Create Manual Item Function ---
window.saveManualItem = function() {
    const name = document.getElementById('manName').value;
    if(!name) return alert("Name required");

    const qty = parseFloat(document.getElementById('manQty').value) || 100;
    const unit = document.getElementById('manUnit').value || 'g';

    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;

    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty; 

    // Calculate base values (per 100g/unit)
    const baseCal = getVal('manKcal') / factor;
    const baseP = getVal('manProt') / factor;
    const baseC = getVal('manCarb') / factor;
    const baseF = getVal('manFat') / factor;

    const micros = {};
    ALL_MICROS.forEach(key => {
        micros[key] = getVal(`man_${key}`) / factor;
    });

    const item = {
        name, qty, unit,
        baseCalories: baseCal, baseProtein: baseP, baseCarbs: baseC, baseFat: baseF,
        micros, source: 'Manual'
    };

    prepFoodForEdit(item, true);
};


// --- EDIT LOGIC ---
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
    stopScanner();
    const factor = item.base_qty ? (item.base_qty === 100 && (item.unit === 'g'|| item.unit==='ml') ? 1 : item.base_qty) : 1;

    state.tempFood = {
        ...item,
        isNew,
        baseCalories: item.baseCalories || (item.calories / factor),
        baseProtein: item.baseProtein || (item.protein / factor),
        baseCarbs: item.baseCarbs || (item.carbs / factor),
        baseFat: item.baseFat || (item.fat / factor),
        micros: item.micros || {} // FIX: Safe Access
    };

    const isFav = state.favorites.some(f => f.name === state.tempFood.name);
    const favBtn = document.getElementById('addToFavBtn');
    favBtn.innerHTML = isFav ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';
    favBtn.onclick = () => toggleFavorite();

    document.getElementById('editMeal').value = item.meal || state.selectedMeal;
    document.getElementById('btnDeleteLog').classList.toggle('hidden', isNew);

    document.getElementById('advancedEditToggle').checked = false;
    toggleAdvancedEdit();

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
document.getElementById('advancedEditToggle').addEventListener('change', toggleAdvancedEdit);

function toggleAdvancedEdit() {
    const isAdvanced = document.getElementById('advancedEditToggle').checked;
    const displayDiv = document.getElementById('displayMacros');
    const manualDiv = document.getElementById('manualMacros');

    if (isAdvanced) {
        displayDiv.classList.add('hidden');
        manualDiv.classList.remove('hidden');
        
        const qty = parseFloat(document.getElementById('editQty').value) || 0;
        const unit = document.getElementById('editUnit').value;
        const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;

        document.getElementById('ov_kcal').value = Math.round(state.tempFood.baseCalories * factor);
        document.getElementById('ov_protein').value = Math.round(state.tempFood.baseProtein * factor);
        document.getElementById('ov_carbs').value = Math.round(state.tempFood.baseCarbs * factor);
        document.getElementById('ov_fat').value = Math.round(state.tempFood.baseFat * factor);

        // FIX: Safe Access to micros
        const safeMicros = state.tempFood.micros || {};
        ALL_MICROS.forEach(k => {
             const el = document.getElementById(`ov_${k}`);
             if(el) {
                 const baseVal = safeMicros[k] || 0;
                 el.value = parseFloat((baseVal * factor).toFixed(2));
             }
        });

    } else {
        displayDiv.classList.remove('hidden');
        manualDiv.classList.add('hidden');
    }
}

function updateEditPreview() {
    const qty = parseFloat(document.getElementById('editQty').value) || 0;
    const unit = document.getElementById('editUnit').value;
    const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;

    document.getElementById('editKcal').innerText = Math.round(state.tempFood.baseCalories * factor);
    document.getElementById('editProt').innerText = Math.round(state.tempFood.baseProtein * factor);
    document.getElementById('editCarbs').innerText = Math.round(state.tempFood.baseCarbs * factor);
    document.getElementById('editFat').innerText = Math.round(state.tempFood.baseFat * factor);
    
    if(document.getElementById('advancedEditToggle').checked) {
         document.getElementById('ov_kcal').value = Math.round(state.tempFood.baseCalories * factor);
         document.getElementById('ov_protein').value = Math.round(state.tempFood.baseProtein * factor);
         document.getElementById('ov_carbs').value = Math.round(state.tempFood.baseCarbs * factor);
         document.getElementById('ov_fat').value = Math.round(state.tempFood.baseFat * factor);
         
         const safeMicros = state.tempFood.micros || {};
         ALL_MICROS.forEach(k => {
             const el = document.getElementById(`ov_${k}`);
             if(el) {
                 const baseVal = safeMicros[k] || 0;
                 el.value = parseFloat((baseVal * factor).toFixed(2));
             }
         });
    }
}

window.saveLog = function() {
    const qty = parseFloat(document.getElementById('editQty').value);
    const unit = document.getElementById('editUnit').value;
    const meal = document.getElementById('editMeal').value;
    const isAdvanced = document.getElementById('advancedEditToggle').checked;
    
    let calories, protein, carbs, fat;
    let finalMicros = { ...(state.tempFood.micros || {}) };

    if (isAdvanced) {
        calories = parseFloat(document.getElementById('ov_kcal').value) || 0;
        protein = parseFloat(document.getElementById('ov_protein').value) || 0;
        carbs = parseFloat(document.getElementById('ov_carbs').value) || 0;
        fat = parseFloat(document.getElementById('ov_fat').value) || 0;
        
        ALL_MICROS.forEach(k => {
            const val = parseFloat(document.getElementById(`ov_${k}`).value) || 0;
            finalMicros[k] = val; 
        });
    } else {
        const factor = (unit === 'g' || unit === 'ml') ? qty / 100 : qty;
        calories = state.tempFood.baseCalories * factor;
        protein = state.tempFood.baseProtein * factor;
        carbs = state.tempFood.baseCarbs * factor;
        fat = state.tempFood.baseFat * factor;
        
        Object.keys(finalMicros).forEach(k => {
            finalMicros[k] = (state.tempFood.micros[k] || 0) * factor;
        });
    }
    
    const log = {
        id: state.tempFood.isNew ? Math.random().toString(36).substr(2, 9) : state.tempFood.id,
        date: state.currentDate,
        timestamp: new Date().toISOString(),
        meal,
        name: state.tempFood.name,
        qty, unit,
        calories, protein, carbs, fat,
        micros: finalMicros,
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
    if (state.activeTab !== 'analyze') document.getElementById('addModal').classList.add('translate-y-full');
    init();
};

window.openMicros = function() {
    const dayLogs = state.logs.filter(l => l.date === state.currentDate);
    const totals = {};
    
    ALL_MICROS.forEach(k => totals[k] = 0);
    
    dayLogs.forEach(log => {
        if(log.micros) {
            Object.keys(log.micros).forEach(key => {
                totals[key] = (totals[key] || 0) + (log.micros[key] || 0);
            });
        }
    });

    let html = '';
    
    Object.keys(MICRO_GROUPS).forEach(groupName => {
        html += `<div class="font-bold text-emerald-400 text-xs uppercase tracking-wider mb-2 mt-4 border-b border-slate-700 pb-1">${groupName}</div>`;
        html += `<div class="space-y-1">`;
        
        MICRO_GROUPS[groupName].forEach(key => {
            const val = totals[key] || 0;
            if (val > 0.1 || groupName === 'Breakdown') { 
                html += `
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-slate-400 capitalize">${key.replace(/_/g, ' ')}</span>
                        <span class="text-white font-mono">${Math.round(val*10)/10}</span>
                    </div>
                `;
            }
        });
        html += `</div>`;
    });

    document.getElementById('microList').innerHTML = html;
    document.getElementById('microsModal').classList.remove('hidden');
};

// --- FIX: EXPORT JSON (Re-implemented) ---
window.exportJSON = () => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 30); 

    const recentLogs = state.logs.filter(l => new Date(l.date) >= pastDate);

    const exportData = recentLogs.map((l, index) => {
        const item = {
            date: l.timestamp || l.date, 
            name: l.name,
            calories: Math.round(l.calories),
            protein: Math.round(l.protein * 10) / 10,
            carbs: Math.round(l.carbs * 10) / 10,
            fat: Math.round(l.fat * 10) / 10
        };
        
        // FIX: Use ALL_MICROS constant
        const micros = l.micros || {};
        ALL_MICROS.forEach(key => {
            if (micros[key]) {
                item[key] = Math.round(micros[key] * 100) / 100;
            }
        });

        return item;
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ logs: exportData }));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `foodlog_sync.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Boilerplate
window.closeEditModal = () => document.getElementById('editModal').classList.add('hidden');
window.closeAddModal = () => document.getElementById('addModal').classList.add('translate-y-full');
window.openAddModal = (meal) => {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    setSearchMode('search');
};
window.setSearchMode = (mode) => {
    state.activeTab = mode;
    ['search', 'analyze', 'create', 'favs'].forEach(v => {
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
};

window.handleManualBarcode = () => { /* Add logic if needed */ };
window.triggerVision = () => { document.getElementById('visionGal').click(); };
window.handleVision = () => { /* Add logic if needed */ };
window.deleteLog = () => { /* Add logic if needed */ };

init();
