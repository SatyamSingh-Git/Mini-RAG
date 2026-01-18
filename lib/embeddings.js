import { GoogleGenerativeAI } from '@google/generative-ai';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function embedText(text) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004'
  });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function embedTexts(texts) {
  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await embedText(text));
  }
  return embeddings;
}

export async function generateAnswer(prompt) {
  const genAI = getClient();
  const primaryModel = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite';
  const fallbackModels = ['gemini-2.5-flash', 'gemini-3-flash'];

  const run = async (modelName) => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 512)
      }
    });
    return result.response.text();
  };

  const modelsToTry = [primaryModel, ...fallbackModels].filter(Boolean);
  let lastError;

  for (const modelName of modelsToTry) {
    try {
      return await run(modelName);
    } catch (error) {
      lastError = error;
      const message = error?.message || '';
      if (!message.includes('not found')) {
        throw error;
      }
    }
  }

  throw lastError;
}
