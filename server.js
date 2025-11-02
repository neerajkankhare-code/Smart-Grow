import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import googleTTS from 'google-tts-api';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

function detectLanguageHint(text, fallback) {
  if (!text) return fallback || 'en';
  const hindi = /[\u0900-\u097F]/.test(text);
  const marathi = /[\u0900-\u097F]/.test(text);
  if (marathi) return 'mr';
  if (hindi) return 'hi';
  return fallback || 'en';
}

app.post('/api/tts', async (req, res) => {
  try {
    const { text, lang } = req.body;
    const l = lang || detectLanguageHint(text, 'en');
    const url = googleTTS.getAudioUrl(text, { lang: l, slow: false, host: 'https://translate.google.com' });
    const r = await fetch(url);
    if (!r.ok) return res.status(500).json({ error: 'tts_failed' });
    res.set('Content-Type', 'audio/mpeg');
    r.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: 'tts_error' });
  }
});

function recommendCrops({ area, unit, soil }) {
  const a = unit === 'hectare' ? area * 2.47105 : area;
  const soilMap = {
    black: ['soybean', 'cotton', 'pigeon pea'],
    red: ['groundnut', 'millets', 'sorghum'],
    sandy: ['groundnut', 'millets', 'sesame'],
    loamy: ['wheat', 'rice', 'vegetables']
  };
  let base = soilMap[soil] || ['millets', 'pulses'];
  if (a <= 0.5) base = base.slice(0, 2).concat(['vegetables']);
  if (a >= 2) base = base.concat(['sugarcane']).filter((v, i, s) => s.indexOf(v) === i);
  return base;
}

app.post('/api/crop/recommend', (req, res) => {
  const { landArea, unit = 'acre', soilType = 'loamy', language = 'en' } = req.body || {};
  const crops = recommendCrops({ area: Number(landArea || 1), unit, soil: soilType });
  const msg = {
    en: `Recommended crops for ${landArea} ${unit} with ${soilType} soil: ${crops.join(', ')}`,
    hi: `आपकी ${landArea} ${unit} की ${soilType} मिट्टी के लिए सुझाई गई फसलें: ${crops.join(', ')}`,
    mr: `${landArea} ${unit} ${soilType} माती जमिनीसाठी योग्य पिके: ${crops.join(', ')}`
  }[language] || crops.join(', ');
  res.json({ crops, message: msg });
});

function fertilizerAdvice({ pH, moisture, n, p, k, crop = 'generic' }) {
  const advice = [];
  if (pH < 6) advice.push('apply lime 200 kg/acre');
  if (pH > 7.5) advice.push('apply gypsum 200 kg/acre');
  if (n < 200) advice.push('urea 25 kg/acre');
  if (p < 20) advice.push('DAP 15 kg/acre');
  if (k < 150) advice.push('MOP 15 kg/acre');
  if (moisture < 25) advice.push('use compost and mulch');
  if (!advice.length) advice.push('balanced NPK as per package of practice');
  return advice;
}

app.post('/api/soil/fertilizer', (req, res) => {
  const { pH = 7, moisture = 30, N = 150, P = 15, K = 120, crop = 'wheat', language = 'en' } = req.body || {};
  const recs = fertilizerAdvice({ pH: Number(pH), moisture: Number(moisture), n: Number(N), p: Number(P), k: Number(K), crop });
  res.json({ recommendations: recs });
});

function irrigationAdvice({ moisture, forecastRain }) {
  if (forecastRain) return { action: 'hold', durationMinutes: 0, reason: 'rain_expected' };
  if (moisture < 20) return { action: 'pump_on', durationMinutes: 20, reason: 'very_low_moisture' };
  if (moisture < 35) return { action: 'pump_on', durationMinutes: 12, reason: 'low_moisture' };
  return { action: 'hold', durationMinutes: 0, reason: 'sufficient_moisture' };
}

app.get('/api/weather', async (req, res) => {
  try {
    const key = process.env.OPENWEATHER_API_KEY;
    const { lat, lon, city } = req.query;
    if (!key) return res.json({ stub: true, weather: { temp: 30, humidity: 60, rainProb: 0.2 } });
    let url;
    if (lat && lon) url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`;
    else if (city) url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`;
    else return res.status(400).json({ error: 'missing_location' });
    const r = await fetch(url);
    const d = await r.json();
    const weather = { temp: d.main?.temp, humidity: d.main?.humidity, rainProb: (d.rain?.['1h'] || 0) > 0 ? 0.7 : 0.1 };
    res.json({ weather });
  } catch (e) {
    res.status(500).json({ error: 'weather_error' });
  }
});

app.post('/api/irrigation/advice', async (req, res) => {
  const { moisture = 30, city, lat, lon } = req.body || {};
  let forecastRain = false;
  try {
    const key = process.env.OPENWEATHER_API_KEY;
    if (key && (city || (lat && lon))) {
      let url;
      if (lat && lon) url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${key}`;
      else url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${key}`;
      const r = await fetch(url);
      const d = await r.json();
      const next = d.list?.slice(0, 8) || [];
      forecastRain = next.some(x => (x.rain?.['3h'] || 0) > 0);
    }
  } catch {}
  const advice = irrigationAdvice({ moisture: Number(moisture), forecastRain });
  res.json({ advice });
});

async function analyzeLeaf(buffer) {
  // Resize to 256px width for fast analysis, keep aspect
  const img = sharp(buffer).resize(256).removeAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels should be 3 (RGB)
  let total = 0;
  let greenish = 0;
  let yellowish = 0;
  let brownish = 0;
  let darkLesion = 0;
  // Sample every nth pixel to speed up
  const step = Math.max(1, Math.floor((width * height) / 40000));
  for (let i = 0; i < data.length; i += channels * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total++;
    // simple color heuristics
    if (g > r + 15 && g > b + 15) greenish++;
    const isYellow = (r > 120 && g > 120 && b < 100) && Math.abs(r - g) < 40;
    if (isYellow) yellowish++;
    const isBrown = (r > g && r > b && g > b) && r > 80 && g > 40 && b < 80;
    if (isBrown) brownish++;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance < 40 && g < 50) darkLesion++;
  }
  const gr = greenish / total;
  const yr = yellowish / total;
  const br = brownish / total;
  const dr = darkLesion / total;

  // Rule-based scoring for diseases
  const scores = {
    early_blight: 0,
    rust: 0,
    leaf_spot: 0,
    healthy: 0
  };
  // Early blight: dark lesions and reduced green coverage
  scores.early_blight = (dr * 1.2) + ((0.4 - gr) > 0 ? (0.4 - gr) : 0);
  // Rust: brownish patches, moderate green
  scores.rust = br * 1.0 + (gr > 0.3 && gr < 0.7 ? 0.1 : 0);
  // Leaf spot: yellow areas
  scores.leaf_spot = yr * 1.1 + (gr > 0.3 ? 0.05 : 0);
  // Healthy: high green coverage, low others
  scores.healthy = gr - (yr + br + dr) * 0.5;

  // Normalize and select best
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestLabel, bestScore] = entries[0];
  // Map score to 0..1 confidence (roughly)
  const minScore = entries[entries.length - 1][1];
  const maxScore = entries[0][1];
  const confidence = maxScore === minScore ? 0.6 : Math.max(0.1, Math.min(0.95, (bestScore - minScore) / (Math.abs(maxScore) + Math.abs(minScore) + 1e-6)));

  return {
    label: bestLabel,
    confidence: Number(confidence.toFixed(2)),
    metrics: { greenRatio: Number(gr.toFixed(3)), yellowRatio: Number(yr.toFixed(3)), brownRatio: Number(br.toFixed(3)), darkRatio: Number(dr.toFixed(3)) }
  };
}

app.post('/api/disease/detect', upload.single('image'), async (req, res) => {
  const adviceMap = {
    early_blight: { en: 'Use recommended fungicide (e.g., Mancozeb).', hi: 'अनुशंसित फफूंदनाशी (जैसे Mancozeb) का उपयोग करें।', mr: 'शिफारस केलेले बुरशीनाशक (उदा., Mancozeb) वापरा.' },
    rust: { en: 'Apply triazole fungicide and remove infected leaves.', hi: 'ट्रायझोल फफूंदनाशी लगाएं और संक्रमित पत्ते हटा दें।', mr: 'ट्रायाझोल बुरशीनाशक लावा आणि संक्रमित पाने काढा.' },
    leaf_spot: { en: 'Copper-based fungicide recommended.', hi: 'तांबे आधारित फफूंदनाशी की सलाह दी जाती है।', mr: 'तांब्यावर आधारित बुरशीनाशक सुचविले जाते.' },
    healthy: { en: 'No disease detected.', hi: 'कोई रोग नहीं मिला।', mr: 'रोग आढळला नाही.' }
  };
  const language = req.body?.language || 'en';

  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'no_image' });
    // Analyze image
    const result = await analyzeLeaf(req.file.buffer);
    const advice = adviceMap[result.label][language] || adviceMap[result.label].en;
    return res.json({ label: result.label, confidence: result.confidence, advice, metrics: result.metrics });
  } catch (err) {
    // No filename/URL heuristics: return unknown on error
    return res.json({ label: 'unknown', confidence: 0.0, advice: adviceMap.healthy[language] || adviceMap.healthy.en, error: 'analysis_failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, () => {});
}

export default app;
