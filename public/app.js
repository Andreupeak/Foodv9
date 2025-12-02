// --- STATE MANAGEMENT ---
const state = {
    logs: JSON.parse(localStorage.getItem('foodlog_logs')) || [],
    user: JSON.parse(localStorage.getItem('foodlog_user')) || { kcal: 2000, p: 150, c: 250, f: 70 },
    currentDate: new Date().toISOString().split('T')[0],
    selectedMeal: 'Breakfast'
};

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// --- INIT ---
function init() {
    renderDate();
    renderMeals();
    renderDashboard();
}

// --- CORE RENDER FUNCTIONS ---
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
                html += `
                    <div class="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0">
                        <div>
                            <div class="font-medium text-gray-800">${log.name}</div>
                            <div class="text-xs text-gray-400">${log.qty}g • P:${Math.round(log.protein)} C:${Math.round(log.carbs)} F:${Math.round(log.fat)}</div>
                        </div>
                        <button onclick="deleteLog('${log.id}')" class="text-red-300 hover:text-red-500 px-2">×</button>
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

    // Update Circle
    const remaining = state.user.kcal - totals.kcal;
    const percent = Math.min((totals.kcal / state.user.kcal) * 100, 100);
    
    document.getElementById('calRemaining').innerText = Math.round(remaining);
    document.getElementById('calCircle').style.setProperty('--percent', `${percent}%`);
    document.getElementById('calCircle').style.setProperty('--color', remaining < 0 ? '#ef4444' : '#10b981');

    // Update Bars
    updateBar('carb', totals.c, state.user.c);
    updateBar('prot', totals.p, state.user.p);
    updateBar('fat', totals.f, state.user.f);
}

function updateBar(type, val, max) {
    const pct = Math.min((val / max) * 100, 100);
    document.getElementById(`${type}Val`).innerText = `${Math.round(val)}/${max}g`;
    document.getElementById(`${type}Bar`).style.width = `${pct}%`;
}

// --- ACTIONS ---
function changeDate(offset) {
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + offset);
    state.currentDate = d.toISOString().split('T')[0];
    init();
}

function deleteLog(id) {
    if(confirm('Remove entry?')) {
        state.logs = state.logs.filter(l => l.id !== id);
        saveState();
        renderMeals();
        renderDashboard();
    }
}

// --- ADD MODAL & SEARCH ---
function openAddModal(meal) {
    if(meal) state.selectedMeal = meal;
    document.getElementById('addModal').classList.remove('translate-y-full');
    document.getElementById('searchInput').focus();
}

function closeAddModal() {
    document.getElementById('addModal').classList.add('translate-y-full');
    stopScanner();
}

// Debounce search
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
        
        if(data.error) {
            resDiv.innerHTML = '<div class="text-center text-gray-400">No results found</div>';
        } else {
            // Normalized result array
            const results = Array.isArray(data) ? data : [data];
            
            resDiv.innerHTML = results.map(item => `
                <div onclick="addFoodToLog('${escape(JSON.stringify(item))}')" class="flex justify-between items-center p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-emerald-50 transition">
                    <div>
                        <div class="font-bold text-gray-700">${item.name}</div>
                        <div class="text-xs text-gray-400">per 100g: ${Math.round(item.calories)} kcal</div>
                    </div>
                    <button class="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">+</button>
                </div>
            `).join('');
        }
    } catch (e) {
        resDiv.innerHTML = '<div class="text-red-400 text-center">Error searching</div>';
    }
}

function addFoodToLog(itemStr) {
    const item = JSON.parse(unescape(itemStr));
    const qty = prompt(`How many grams of ${item.name}?`, "100");
    if(!qty) return;
    
    const factor = parseFloat(qty) / 100;
    
    state.logs.push({
        id: Math.random().toString(36).substr(2, 9),
        date: state.currentDate,
        meal: state.selectedMeal,
        name: item.name,
        qty: parseFloat(qty),
        calories: item.calories * factor,
        protein: item.protein * factor,
        carbs: item.carbs * factor,
        fat: item.fat * factor
    });
    
    saveState();
    closeAddModal();
    init();
}

// --- SCANNER LOGIC ---
let html5QrcodeScanner;

function startScanner() {
    const container = document.getElementById('scanner-container');
    container.classList.remove('hidden');
    
    if(!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("scanner-container");
    }
    
    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        (errorMessage) => { /* ignore per-frame errors */ }
    ).catch(err => console.error(err));
}

function stopScanner() {
    if(html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            document.getElementById('scanner-container').classList.add('hidden');
        }).catch(err => console.error(err));
    }
}

async function onScanSuccess(decodedText) {
    stopScanner();
    document.getElementById('searchInput').value = decodedText;
    
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = '<div class="text-center mt-4">Searching barcode...</div>';
    
    try {
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: decodedText, mode: 'barcode' })
        });
        const data = await res.json();
        
        if(data.error) {
            resDiv.innerHTML = `<div class="text-center text-red-400">Product not found. <button onclick="performSearch('${decodedText}')" class="text-blue-500 underline">Try text search?</button></div>`;
        } else {
             // Directly prompt to add
             addFoodToLog(escape(JSON.stringify(data)));
        }
    } catch(e) {
        resDiv.innerHTML = 'Error scanning';
    }
}

// --- VISION AI ---
function triggerVision() {
    document.getElementById('visionInput').click();
}

async function handleVisionImage(input) {
    if(!input.files || !input.files[0]) return;
    
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = '<div class="text-center mt-4"><i class="fa-solid fa-brain fa-bounce text-purple-500"></i> AI Analyzing...</div>';
    
    const formData = new FormData();
    formData.append('image', input.files[0]);
    
    try {
        const res = await fetch('/api/vision', { method: 'POST', body: formData });
        const data = await res.json();
        
        if(data.name) {
             // Normalize to 100g format or serving format
             const item = {
                 name: data.name,
                 calories: data.calories,
                 protein: data.protein,
                 carbs: data.carbs,
                 fat: data.fat
             };
             // Since vision returns estimated portion, we treat factor as 1 (or 100%)
             state.logs.push({
                 id: Math.random().toString(36).substr(2, 9),
                 date: state.currentDate,
                 meal: state.selectedMeal,
                 name: item.name + " (AI Scan)",
                 qty: 1, // unit 'serving'
                 calories: item.calories,
                 protein: item.protein,
                 carbs: item.carbs,
                 fat: item.fat
             });
             saveState();
             closeAddModal();
             init();
        }
    } catch (e) {
        resDiv.innerHTML = '<div class="text-center text-red-500">AI Analysis failed</div>';
    }
}

// --- CSV EXPORT ---
function exportCSV() {
    const headers = ['Date', 'Meal', 'Food', 'Quantity(g)', 'Calories', 'Protein', 'Carbs', 'Fat'];
    const rows = state.logs.map(l => [
        l.date, l.meal, `"${l.name}"`, l.qty, 
        Math.round(l.calories), Math.round(l.protein), Math.round(l.carbs), Math.round(l.fat)
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `foodlog_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function saveState() {
    localStorage.setItem('foodlog_logs', JSON.stringify(state.logs));
    localStorage.setItem('foodlog_user', JSON.stringify(state.user));
}

// Start
init();
