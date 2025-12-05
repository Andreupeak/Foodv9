import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// --- HELPER: Extract Micros (With Unit Conversion) ---
function extractMicros(n) {
    if (!n) return {};
    
    // Helper to safely get value. OFF API returns nutrients in GRAMS (g).
    // We must convert to mg (x1000) or µg (x1,000,000).
    const get = (key) => n[key] || 0;

    return {
        // --- Macro Details (Keep in Grams) ---
        sugars: get('sugars_100g') || get('sugars_value'),
        fiber: get('fiber_100g') || get('fiber_value'),
        saturated_fat: get('saturated-fat_100g') || get('saturated-fat_value'),
        monounsaturated_fat: get('monounsaturated-fat_100g') || get('monounsaturated-fat_value'),
        polyunsaturated_fat: get('polyunsaturated-fat_100g') || get('polyunsaturated-fat_value'),
        
        // --- Minerals/Electrolytes (Convert g -> mg) ---
        // Target: Milligrams (mg)
        sodium: (get('sodium_100g') || get('sodium_value')) * 1000,
        potassium: (get('potassium_100g') || get('potassium_value')) * 1000,
        chloride: (get('chloride_100g') || get('chloride_value')) * 1000,
        calcium: (get('calcium_100g') || get('calcium_value')) * 1000,
        magnesium: (get('magnesium_100g') || get('magnesium_value')) * 1000,
        zinc: (get('zinc_100g') || get('zinc_value')) * 1000,
        phosphorus: (get('phosphorus_100g') || 0) * 1000,
        iron: (get('iron_100g') || get('iron_value')) * 1000,
        copper: (get('copper_100g') || 0) * 1000,
        manganese: (get('manganese_100g') || 0) * 1000,
        
        // --- Trace Minerals (Convert g -> µg) ---
        // Target: Micrograms (µg)
        iodine: (get('iodine_100g') || 0) * 1e6,
        selenium: (get('selenium_100g') || 0) * 1e6,
        chromium: (get('chromium_100g') || 0) * 1e6,
        molybdenum: (get('molybdenum_100g') || 0) * 1e6,

        // --- Vitamins (Convert g -> mg or µg) ---
        // Target: Micrograms (µg)
        vitamin_a: (get('vitamin-a_100g') || get('vitamin-a_value')) * 1e6,
        vitamin_d: (get('vitamin-d_100g') || get('vitamin-d_value')) * 1e6,
        vitamin_k: (get('vitamin-k_100g') || get('phylloquinone_100g')) * 1e6,
        vitamin_b12: (get('vitamin-b12_100g') || 0) * 1e6,
        biotin: (get('biotin_100g') || get('vitamin-b7_100g')) * 1e6,
        folic_acid: (get('folates_100g') || get('folic-acid_100g') || get('vitamin-b9_100g')) * 1e6,

        // Target: Milligrams (mg)
        thiamin: (get('vitamin-b1_100g') || get('thiamin_100g')) * 1000,
        riboflavin: (get('vitamin-b2_100g') || get('riboflavin_100g')) * 1000,
        vitamin_b6: (get('vitamin-b6_100g') || 0) * 1000,
        niacin: (get('vitamin-pp_100g') || get('niacin_100g')) * 1000,
        pantothenic_acid: (get('pantothenic-acid_100g') || get('vitamin-b5_100g')) * 1000,
        vitamin_c: (get('vitamin-c_100g') || get('vitamin-c_value')) * 1000,
        vitamin_e: (get('vitamin-e_100g') || get('vitamin-e_value')) * 1000,

        // --- Other ---
        // Caffeine is usually tracked in mg. OFF uses g.
        caffeine: (get('caffeine_100g') || get('caffeine_value')) * 1000,
        
        // Water stays in grams
        water: get('water_100g') || get('water_value')
    };
}


// --- API: Search ---
app.post('/api/search', async (req, res) => {
    const { query, mode } = req.body;

    // 1. OPEN FOOD FACTS DATABASE
    try {
        let url;
        // Limit fields to improve speed
        const fields = 'product_name,product_name_de,brands,nutriments,code,_id';
        
        if (mode === 'barcode') {
            url = `https://world.openfoodfacts.org/api/v2/product/${query}.json?fields=${fields}`;
        } else {
            // Use standard search.pl.
            // page_size=10 is standard.
            // We do NOT use complex sorts that might slow down the DB.
            url = `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=${fields}`;
        }

        // CRITICAL: Increased timeout to 15 seconds. 
        // OFF can be slow. We prefer waiting for real data over fallback.
        const response = await axios.get(url, { timeout: 15000 });
        let products = [];

        if (mode === 'barcode' && (response.data.status === 1 || response.data.product)) {
            products = [response.data.product];
        } else if (response.data.products && response.data.products.length > 0) {
            products = response.data.products;
        }

        if (products.length > 0) {
            const results = products.map(p => ({
                name: p.product_name_de || p.product_name || "Unknown Product",
                brand: p.brands || "",
                calories: p.nutriments?.['energy-kcal'] || 0,
                protein: p.nutriments?.proteins || 0,
                carbs: p.nutriments?.carbohydrates || 0,
                fat: p.nutriments?.fat || 0,
                micros: extractMicros(p.nutriments),
                unit: 'g', 
                base_qty: 100,
                source: 'OpenFoodFacts'
            }));
            return res.json(results);
        }
    } catch (e) {
        console.log(`OFF Database connection failed or timed out: ${e.message}`);
        // If it was a barcode scan, we fail immediately so user knows.
        if (mode === 'barcode') {
            return res.status(404).json({ error: 'Barcode not found in database' });
        }
        // For text search, we proceed to AI only if DB actually failed/returned nothing.
    }

    // 2. AI FALLBACK (Only executes if Database returned 0 items or threw an error)
    try {
        console.log(`Product not in DB (or DB error), using AI estimate for: ${query}`);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: `User searched for "${query}". It was not found in the German food database. 
                Return a JSON object for 1 standard serving (or 100g if generic).
                Include name, calories, protein, carbs, fat.
                Also estimate these micros (mg/ug/g where appropriate): 
                [sugars, fiber, saturated_fat, monounsaturated_fat, polyunsaturated_fat, sodium, potassium, chloride, water, caffeine]
                AND [vitamin_a, thiamin, riboflavin, vitamin_b6, vitamin_b12, biotin, folic_acid, niacin, pantothenic_acid, vitamin_c, vitamin_d, vitamin_e, vitamin_k, calcium, magnesium, zinc, chromium, molybdenum, iodine, selenium, phosphorus, manganese, iron, copper].
                Response format: { "name":Str, "base_qty":Num, "unit":Str, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros":{...} }
                Strict JSON only.`
            }]
        });

        const content = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiItem = JSON.parse(content);
        aiItem.source = 'AI Estimate';
        return res.json([aiItem]);

    } catch (e) {
        return res.status(500).json({ error: 'Search failed' });
    }
});

// --- API: Analyze Ingredients (Itemized) ---
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: "You are a nutrition analyzer. Break down the input into individual ingredients with nutrition info."
            }, {
                role: "user",
                content: `Analyze this list: "${text}".
                Return a JSON object containing an array called "items". 
                Each item should represent one ingredient from the list with its nutrition for the specified quantity.
                Include Name, Qty, Unit, Kcal, P, C, F.
                Include "micros" object with estimated: 
                [sugars, fiber, saturated_fat, monounsaturated_fat, polyunsaturated_fat, sodium, potassium, chloride, water, caffeine, vitamin_a, thiamin, riboflavin, vitamin_b6, vitamin_b12, biotin, folic_acid, niacin, pantothenic_acid, vitamin_c, vitamin_d, vitamin_e, vitamin_k, calcium, magnesium, zinc, chromium, molybdenum, iodine, selenium, phosphorus, manganese, iron, copper]
                
                JSON Format: { "items": [ { "name":Str, "qty":Num, "unit":Str, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros":{...} }, ... ] }
                Strict JSON only. No markdown.`
            }]
        });
        const content = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(content);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: Meal Planner ---
app.post('/api/plan-meal', async (req, res) => {
    const { ingredients } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system", 
                content: "You are a meal planner. Create a meal using the provided ingredients. Return strictly JSON."
            }, {
                role: "user",
                content: `I have these ingredients: ${ingredients}.
                Suggest a meal name, a brief recipe, and a grocery list.
                JSON Format: { "mealName": String, "recipe": String, "groceryList": [String, String] }`
            }]
        });
        const content = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: Vision ---
app.post('/api/vision', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image' });
        const base64 = fs.readFileSync(req.file.path).toString('base64');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                    { type: 'text', text: 'Identify food & estimate portion. Return JSON: { "name":Str, "estimated_weight_g":Num, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros": { "sugars":Num, "fiber":Num, "saturated_fat":Num, "monounsaturated_fat":Num, "polyunsaturated_fat":Num, "sodium":Num, "potassium":Num, "chloride":Num, "caffeine":Num, "water":Num, "vitamin_a":Num, "vitamin_c":Num, "calcium":Num, "iron":Num } }. Values for WHOLE portion.' }
                ]
            }],
            max_tokens: 500
        });

        fs.unlinkSync(req.file.path);
        const content = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

// --- API: AI Coach ---
app.post('/api/coach', async (req, res) => {
    const { query, logs, user } = req.body;
    
    // Limit logs to last 100
    const recentLogs = logs.slice(-100); 

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system", 
                content: `You are an expert Nutrition Coach. Analyze the user's food logs and profile to answer their question.
                
                You have access to:
                1. User Profile (Goals, Weight, etc)
                2. Food Logs (Date, Name, Calories, Macros, Micros)

                INSTRUCTIONS:
                - Answer the user's question directly and helpfully.
                - Identify lacking nutrients or excesses if asked.
                - If the user asks for a graph/chart, or if a visual comparison would be very helpful, provide graph data.
                
                RESPONSE FORMAT (Strict JSON):
                {
                    "answer": "Markdown formatted text answer...",
                    "graphs": [
                        {
                            "type": "bar" | "line" | "pie" | "doughnut",
                            "title": "Chart Title",
                            "labels": ["Mon", "Tue"...],
                            "datasets": [
                                { "label": "Calories", "data": [2000, 1800...], "backgroundColor": "#10b981" }
                            ]
                        }
                    ]
                }
                
                Return 'graphs': [] if no graph is needed.
                Use specific hex colors for consistency: Calories #10b981, Protein #ef4444, Carbs #3b82f6, Fat #eab308.
                `
            }, {
                role: "user",
                content: `User Profile: ${JSON.stringify(user)}.
                Recent Logs: ${JSON.stringify(recentLogs)}.
                
                User Query: "${query}"`
            }]
        });

        const content = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
