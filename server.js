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

// --- HELPER: Extract Micros ---
function extractMicros(nutriments) {
    if (!nutriments) return {};
    return {
        vitamin_a: nutriments['vitamin-a_100g'] || nutriments['vitamin-a_value'] || 0,
        vitamin_c: nutriments['vitamin-c_100g'] || nutriments['vitamin-c_value'] || 0,
        vitamin_d: nutriments['vitamin-d_100g'] || nutriments['vitamin-d_value'] || 0,
        calcium: nutriments['calcium_100g'] || nutriments['calcium_value'] || 0,
        iron: nutriments['iron_100g'] || nutriments['iron_value'] || 0,
        zinc: nutriments['zinc_100g'] || nutriments['zinc_value'] || 0,
        magnesium: nutriments['magnesium_100g'] || nutriments['magnesium_value'] || 0,
        potassium: nutriments['potassium_100g'] || nutriments['potassium_value'] || 0,
    };
}

// --- API: Search ---
app.post('/api/search', async (req, res) => {
    const { query, mode } = req.body;

    try {
        if (mode === 'barcode') {
            const url = `https://world.openfoodfacts.org/api/v2/product/${query}.json`;
            const response = await axios.get(url, { timeout: 4000 });
            if (response.data.status === 1) {
                const p = response.data.product;
                return res.json([{
                    name: p.product_name || "Unknown Product",
                    brand: p.brands || "",
                    calories: p.nutriments?.['energy-kcal'] || 0,
                    protein: p.nutriments?.proteins || 0,
                    carbs: p.nutriments?.carbohydrates || 0,
                    fat: p.nutriments?.fat || 0,
                    micros: extractMicros(p.nutriments),
                    unit: 'g', base_qty: 100, source: 'OpenFoodFacts'
                }]);
            }
            return res.status(404).json({ error: 'Barcode not found' });
        }

        // Text Search
        const url = `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
        const response = await axios.get(url, { timeout: 4000 });
        
        if (response.data.products && response.data.products.length > 0) {
             const results = response.data.products.map(p => ({
                name: p.product_name || p.product_name_de || "Unknown Product",
                brand: p.brands || "",
                calories: p.nutriments?.['energy-kcal'] || 0,
                protein: p.nutriments?.proteins || 0,
                carbs: p.nutriments?.carbohydrates || 0,
                fat: p.nutriments?.fat || 0,
                micros: extractMicros(p.nutriments),
                unit: 'g', base_qty: 100, source: 'OpenFoodFacts'
            }));
            return res.json(results);
        }

        // AI Fallback
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: `User searched for "${query}" (not found in DB). Return JSON for 1 standard serving (or 100g).
                Include: name, calories, protein, carbs, fat, unit (e.g. 'g' or 'portion'), base_qty (amount for these stats).
                Response: { "name":Str, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "unit":Str, "base_qty":Num, "micros":{} }
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

// --- API: Parse Ingredients (Multi-Add) ---
app.post('/api/parse-ingredients', async (req, res) => {
    const { text } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: `Parse this text into a list of food items with nutrition: "${text}".
                Return a JSON Array. Each object: { "name":Str, "qty":Num, "unit":Str (e.g. 'g', 'ml', 'cup'), "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros": {} }.
                Stats should be TOTAL for the specific quantity mentioned.`
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
                    { type: 'text', text: 'Identify food & estimate portion. Return JSON: { "name":Str, "estimated_weight_g":Num, "calories":Num, "protein":Num, "carbs":Num, "fat":Num, "micros": {} }. Values for WHOLE portion.' }
                ]
            }],
            max_tokens: 400
        });
        fs.unlinkSync(req.file.path);
        const content = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
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
                role: "user",
                content: `Create a meal using: ${ingredients}. Return JSON: { "mealName": String, "recipe": String, "groceryList": [String] }`
            }]
        });
        const content = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: Workout Generator ---
app.post('/api/plan-workout', async (req, res) => {
    const { type, days, recovery, equipment } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: "You are an expert fitness coach. Create structured workout plans."
            }, {
                role: "user",
                content: `Create a ${days}-day split workout plan.
                Focus: ${type}.
                Equipment: ${equipment}.
                User Recovery: ${recovery}% (If low, suggest lighter intensity or deload).
                Return strictly a JSON array where each object is a Day:
                [{ "day": "Day 1: Chest", "exercises": [{ "name": "Bench Press", "sets": "3x10", "note": "Focus on form" }] }]`
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
