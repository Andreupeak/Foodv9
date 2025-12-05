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

// --- HELPER: Extract All Nutrients ---
function extractMicros(n) {
    if (!n) return {};
    return {
        // Extended Macros
        sugar: n['sugars_100g'] || n['sugars_value'] || 0,
        fiber: n['fiber_100g'] || n['fiber_value'] || 0,
        saturated_fat: n['saturated-fat_100g'] || n['saturated-fat_value'] || 0,
        monounsaturated_fat: n['monounsaturated-fat_100g'] || n['monounsaturated-fat_value'] || 0,
        polyunsaturated_fat: n['polyunsaturated-fat_100g'] || n['polyunsaturated-fat_value'] || 0,
        trans_fat: n['trans-fat_100g'] || n['trans-fat_value'] || 0,
        cholesterol: n['cholesterol_100g'] || n['cholesterol_value'] || 0,

        // Minerals & Electrolytes
        sodium: n['sodium_100g'] || n['sodium_value'] || 0,
        potassium: n['potassium_100g'] || n['potassium_value'] || 0,
        calcium: n['calcium_100g'] || n['calcium_value'] || 0,
        magnesium: n['magnesium_100g'] || n['magnesium_value'] || 0,
        iron: n['iron_100g'] || n['iron_value'] || 0,
        zinc: n['zinc_100g'] || n['zinc_value'] || 0,
        phosphorus: n['phosphorus_100g'] || 0,
        iodine: n['iodine_100g'] || 0,
        selenium: n['selenium_100g'] || 0,
        chloride: n['chloride_100g'] || 0,
        manganese: n['manganese_100g'] || 0,
        copper: n['copper_100g'] || 0,
        chromium: n['chromium_100g'] || 0,
        molybdenum: n['molybdenum_100g'] || 0,

        // Vitamins
        vitamin_a: n['vitamin-a_100g'] || n['vitamin-a_value'] || 0,
        vitamin_c: n['vitamin-c_100g'] || n['vitamin-c_value'] || 0,
        vitamin_d: n['vitamin-d_100g'] || n['vitamin-d_value'] || 0,
        vitamin_e: n['vitamin-e_100g'] || n['vitamin-e_value'] || 0,
        vitamin_k: n['vitamin-k_100g'] || n['vitamin-k_value'] || 0,
        thiamin: n['vitamin-b1_100g'] || n['thiamin_100g'] || 0,
        riboflavin: n['vitamin-b2_100g'] || n['riboflavin_100g'] || 0,
        niacin: n['vitamin-pp_100g'] || n['niacin_100g'] || 0,
        vitamin_b6: n['vitamin-b6_100g'] || 0,
        folic_acid: n['folates_100g'] || n['folic-acid_100g'] || n['vitamin-b9_100g'] || 0,
        vitamin_b12: n['vitamin-b12_100g'] || 0,
        biotin: n['biotin_100g'] || n['vitamin-b7_100g'] || 0,
        pantothenic_acid: n['pantothenic-acid_100g'] || n['vitamin-b5_100g'] || 0,

        // Other
        caffeine: n['caffeine_100g'] || 0,
        water: n['water_100g'] || 0,
    };
}

// --- API: Search ---
app.post('/api/search', async (req, res) => {
    const { query, mode } = req.body;

    // 1. OPEN FOOD FACTS
    try {
        let url;
        // FIX: Removed specific fields parameter to ensure we get ALL extended nutriments (caffeine, etc)
        if (mode === 'barcode') {
            url = `https://world.openfoodfacts.org/api/v2/product/${query}.json`;
        } else {
            url = `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`;
        }

        const response = await axios.get(url, { timeout: 8000 });
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
        console.log(`OFF Error (${e.message}), falling back to AI...`);
    }

    if (mode === 'barcode') {
        return res.status(404).json({ error: 'Barcode not found' });
    }

    // 2. AI FALLBACK
    try {
        console.log(`Using AI fallback for: ${query}`);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: `User searched for "${query}". Return JSON for 1 standard serving (or 100g if generic).
                Include: name, calories, protein, carbs, fat.
                
                IMPORTANT: Estimate these specific nutrients (set 0 if negligible/unknown):
                - Breakdown: sugar, fiber, saturated_fat, monounsaturated_fat, polyunsaturated_fat
                - Minerals: sodium, potassium, calcium, magnesium, iron, zinc, phosphorus
                - Vitamins: vitamin_a, vitamin_c, vitamin_d, vitamin_e, vitamin_k, b_vitamins
                - Other: caffeine, water_content
                
                Response format: { "name":Str, "base_qty":Num, "unit":Str, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros":{ "sugar":Num, "fiber":Num, "saturated_fat":Num, "caffeine":Num, ... } }
                Strict JSON.`
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

// --- API: Analyze Ingredients ---
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: "You are a nutrition analyzer."
            }, {
                role: "user",
                content: `Analyze: "${text}".
                Return JSON with array "items".
                Include detailed micros in "micros" object: sugar, fiber, saturated_fat, mono/poly fats, sodium, potassium, caffeine, etc.
                JSON: { "items": [ { "name":Str, "qty":Num, "unit":Str, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros":{...} }, ... ] }`
            }]
        });
        const content = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: Ask AI Coach ---
app.post('/api/ask-coach', async (req, res) => {
    const { query, logs, user } = req.body;
    try {
        const contextLogs = logs.slice(0, 100); 
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: `You are an expert nutrition coach.
                User Query: "${query}"
                
                If the user asks for a specific graph or chart, provide a Markdown table representing the data points, and then a brief textual analysis.
                If they ask "How is my caffeine?", look at the 'caffeine' field in micros.
                Be concise, empathetic, and data-driven.`
            }, {
                role: "user",
                content: `Profile: ${JSON.stringify(user)}. 
                Logs (JSON): ${JSON.stringify(contextLogs)}`
            }]
        });
        res.json({ answer: completion.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: Plan Meal ---
app.post('/api/plan-meal', async (req, res) => {
    const { ingredients } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system", content: "Meal planner. Return strictly JSON."
            }, {
                role: "user",
                content: `Ingredients: ${ingredients}. Suggest meal.
                JSON: { "mealName": String, "recipe": String, "groceryList": [String] }`
            }]
        });
        res.json(JSON.parse(completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim()));
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
                    { type: 'text', text: 'Identify food & estimate portion. Return JSON: { "name":Str, "estimated_weight_g":Num, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros": { "sugar":Num, "fiber":Num, "saturated_fat":Num, "caffeine":Num, "sodium":Num, ... } }.' }
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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
