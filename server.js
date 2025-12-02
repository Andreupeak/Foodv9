import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
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

// --- API CLIENTS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- HELPER: German OpenFoodFacts Priority ---
async function searchOpenFoodFacts(query, isBarcode = false) {
    const countryCode = 'de'; 
    const baseUrl = `https://${countryCode}.openfoodfacts.org`;
    let url;

    if (isBarcode) {
        url = `${baseUrl}/api/v2/product/${query}.json`;
    } else {
        url = `${baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
    }

    try {
        const response = await axios.get(url, { timeout: 5000 });
        let product = null;

        if (isBarcode) {
             if (response.data.status === 1) product = response.data.product;
        } else {
             if (response.data.products && response.data.products.length > 0) product = response.data.products[0];
        }

        // Fallback to World
        if (!product) {
            const worldUrl = isBarcode 
                ? `https://world.openfoodfacts.org/api/v2/product/${query}.json`
                : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
            const fallback = await axios.get(worldUrl, { timeout: 5000 });
            if (isBarcode && fallback.data.status === 1) product = fallback.data.product;
            else if (!isBarcode && fallback.data.products?.length > 0) product = fallback.data.products[0];
        }

        if (!product) return null;

        return {
            name: product.product_name || product.product_name_de || "Unknown Product",
            calories: product.nutriments?.['energy-kcal'] || 0,
            protein: product.nutriments?.proteins || 0,
            carbs: product.nutriments?.carbohydrates || 0,
            fat: product.nutriments?.fat || 0,
            unit: 'g', // OFF standards
            base_qty: 100, // OFF is always per 100g/ml
            source: 'OpenFoodFacts'
        };

    } catch (error) {
        return null;
    }
}

// --- ENDPOINTS ---

// 1. Unified Search (OFF -> Edamam)
app.post('/api/search', async (req, res) => {
    const { query, mode } = req.body;

    // Barcode Strategy
    if (mode === 'barcode') {
        const offResult = await searchOpenFoodFacts(query, true);
        if (offResult) return res.json(offResult);
        return res.status(404).json({ error: 'Barcode not found' });
    }

    // Text Strategy
    const offResult = await searchOpenFoodFacts(query, false);
    
    // Edamam Fallback
    try {
        const url = `https://api.edamam.com/api/food-database/v2/parser?app_id=${process.env.EDAMAM_FOOD_APP_ID}&app_key=${process.env.EDAMAM_FOOD_APP_KEY}&ingr=${encodeURIComponent(query)}`;
        const edamam = await axios.get(url);
        const hints = edamam.data.hints || [];
        
        // Combine results: OFF result first, then Edamam hints
        let results = [];
        if (offResult) results.push(offResult);
        
        hints.slice(0, 5).forEach(h => {
            results.push({
                name: h.food.label,
                calories: h.food.nutrients.ENERC_KCAL || 0,
                protein: h.food.nutrients.PROCNT || 0,
                carbs: h.food.nutrients.CHOCDF || 0,
                fat: h.food.nutrients.FAT || 0,
                unit: 'g',
                base_qty: 100, // Edamam usually normalized, but we treat as base reference
                source: 'Edamam'
            });
        });

        if (results.length > 0) return res.json(results);
        
    } catch (e) {
        console.error("Edamam Error", e.message);
    }

    res.status(404).json({ error: 'No results found' });
});

// 2. Multi-Ingredient Parser (Natural Language)
app.post('/api/parse-ingredients', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    try {
        // We use OpenAI here because it's smarter at splitting "100g rice and 2 eggs" into structured JSON than Edamam's single-item parser.
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: `Parse the following food text into a JSON array of items. 
                Text: "${text}"
                Return strictly a JSON array with objects containing: 
                - name (string)
                - qty (number, estimated grams or count)
                - unit (string, e.g., 'g', 'ml', 'cup', 'whole')
                - calories (number, total for this qty)
                - protein (number, total for this qty)
                - carbs (number, total for this qty)
                - fat (number, total for this qty)
                Do not include markdown formatting.` 
            }]
        });

        const content = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Vision Analysis
app.post('/api/vision', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image' });
        const base64 = fs.readFileSync(req.file.path).toString('base64');
        
        // User asked: How is nutrition found? 
        // Answer: We ask OpenAI's Vision model to identify the food AND estimate the portion size simultaneously.
        // We then ask it to calculate the nutrition for that specific estimated portion.
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                    { type: 'text', text: 'Identify the food and estimate the portion size visible. Return a valid JSON object strictly with: "name" (string), "estimated_weight_g" (number), "calories" (number), "protein" (number), "carbs" (number), "fat" (number). Values should be for the WHOLE portion visible.' }
                ]
            }],
            max_tokens: 300
        });

        fs.unlinkSync(req.file.path);
        const content = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(content));
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
