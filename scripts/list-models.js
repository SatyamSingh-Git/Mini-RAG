import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '..', '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith('#') || !line.includes('=')) return;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY in .env.local');
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

const res = await fetch(url);
if (!res.ok) {
  const text = await res.text();
  console.error('Failed to list models:', text);
  process.exit(1);
}

const data = await res.json();
const models = data.models || [];

const rows = models.map((m) => ({
  name: m.name,
  displayName: m.displayName,
  supportedGenerationMethods: m.supportedGenerationMethods?.join(', ')
}));

console.table(rows);
