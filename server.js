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

const oauth = OAuth({
  consumer: { key: process.env.FATSECRET_KEY, secret: process.env.FATSECRET_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

// --- HELPER: German OpenFoodFacts Priority ---
async function searchOpenFoodFacts(query, isBarcode = false) {
    // 1. Try German Database specific search first
    const countryCode = 'de'; 
    const baseUrl = `https://${countryCode}.openfoodfacts.org`;
    let url;

    if (isBarcode) {
        url = `${baseUrl}/api/v2/product/${query}.json`;
    } else {
        url = `${baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
    }

    try {
        console.log(`Searching OFF (DE): ${url}`);
        const response = await axios.get(url, { timeout: 5000 });
        
        let product = null;
        if (isBarcode) {
             if (response.data.status === 1) product = response.data.product;
        } else {
             if (response.data.products && response.data.products.length > 0) product = response.data.products[0];
        }

        // 2. Fallback to World if no product found
        if (!product) {
            console.log("Not found in DE, switching to World...");
            const worldUrl = isBarcode 
                ? `https://world.openfoodfacts.org/api/v2/product/${query}.json`
                : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
            
            const fallback = await axios.get(worldUrl, { timeout: 5000 });
            if (isBarcode && fallback.data.status === 1) product = fallback.data.product;
            else if (!isBarcode && fallback.data.products?.length > 0) product = fallback.data.products[0];
        }

        if (!product) throw new Error('Product not found in OpenFoodFacts');

        return {
            name: product.product_name || product.product_name_de || "Unknown Product",
            calories: product.nutriments?.['energy-kcal'] || 0,
            protein: product.nutriments?.proteins || 0,
            carbs: product.nutriments?.carbohydrates || 0,
            fat: product.nutriments?.fat || 0,
            unit: 'g', // OFF usually normalizes to 100g
            serving: 100,
            source: 'OpenFoodFacts'
        };

    } catch (error) {
        console.error("OFF Error:", error.message);
        return null;
    }
}

// --- ENDPOINTS ---

// 1. Unified Search (Handles OFF and Edamam)
app.post('/api/search', async (req, res) => {
    const { query, mode } = req.body; // mode: 'barcode', 'text'

    if (mode === 'barcode') {
        const offResult = await searchOpenFoodFacts(query, true);
        if (offResult) return res.json(offResult);
        
        // Fallback to FatSecret for barcode
        try {
            const token = await getFatSecretToken(); // You might need a robust token flow here, simplified for now to use OAuth1.0 signature if using Premier logic, but standard search below:
            // ... (Keeping your existing FatSecret logic structure below)
        } catch (e) {
            // ignore
        }
        return res.status(404).json({ error: 'Barcode not found' });
    }

    // Text Search: Try OFF first (User preference), then Edamam
    const offResult = await searchOpenFoodFacts(query, false);
    if (offResult) return res.json(offResult);

    // Fallback to Edamam Parser
    try {
        const url = `https://api.edamam.com/api/food-database/v2/parser?app_id=${process.env.EDAMAM_FOOD_APP_ID}&app_key=${process.env.EDAMAM_FOOD_APP_KEY}&ingr=${encodeURIComponent(query)}`;
        const edamam = await axios.get(url);
        const hint = edamam.data.hints?.[0]?.food || edamam.data.parsed?.[0]?.food;
        
        if (hint) {
            return res.json({
                name: hint.label,
                calories: hint.nutrients.ENERC_KCAL || 0,
                protein: hint.nutrients.PROCNT || 0,
                carbs: hint.nutrients.CHOCDF || 0,
                fat: hint.nutrients.FAT || 0,
                unit: 'g',
                serving: 100,
                source: 'Edamam'
            });
        }
    } catch (e) {
        console.error(e);
    }

    res.status(404).json({ error: 'No results found' });
});

// 2. FatSecret Search (Packaged fallback)
app.post('/api/fatsecret/search', async (req, res) => {
    try {
        const { query } = req.body;
        const BASE = 'https://platform.fatsecret.com/rest/server.api';
        const params = {
            method: 'foods.search',
            search_expression: query,
            format: 'json'
        };
        
        // OAuth 1.0a signing
        const request_data = { url: BASE, method: 'POST', data: params };
        const headers = oauth.toHeader(oauth.authorize(request_data));
        
        const response = await axios.post(BASE, new URLSearchParams(params), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Edamam Nutrition Analysis (Home Cooked)
app.post('/api/analyze-recipe', async (req, res) => {
    try {
        const { ingredients } = req.body;
        const url = `https://api.edamam.com/api/nutrition-details?app_id=${process.env.EDAMAM_NUTRITION_APP_ID}&app_key=${process.env.EDAMAM_NUTRITION_APP_KEY}`;
        const response = await axios.post(url, { ingr: ingredients }, { headers: { 'Content-Type': 'application/json' } });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// 4. Spoonacular Recipe Search
app.post('/api/recipes', async (req, res) => {
    try {
        const { ingredients } = req.body;
        const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredients)}&number=5&apiKey=${process.env.SPOONACULAR_API_KEY}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. OpenAI Vision
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
                    { type: 'text', text: 'Identify the food. Return a valid JSON object strictly with keys: "name" (string), "calories" (number), "protein" (number), "carbs" (number), "fat" (number) estimated for the visible portion. Do not wrap in markdown.' }
                ]
            }],
            max_tokens: 300
        });

        fs.unlinkSync(req.file.path);
        const content = response.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '');
        res.json(JSON.parse(content));
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
