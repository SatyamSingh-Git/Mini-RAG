import { GoogleGenerativeAI } from '@google/generative-ai';

export async function embedText(text, apiKey, model = 'text-embedding-004') {
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const embeddingModel = genAI.getGenerativeModel({ model });
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

export async function embedTexts(texts, apiKey, model = 'text-embedding-004') {
  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await embedText(text, apiKey, model));
  }
  return embeddings;
}

export async function generateAnswer(prompt, apiKey, chatModel = 'gemini-2.5-flash', maxTokens = 512) {
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const fallbackModels = ['gemini-3-flash','gemma-3-27b-it','gemini-2.0-flash-lite','gemini-2.0-flash'];

  const run = async (modelName) => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens
      }
    });
    return result.response.text();
  };

  const modelsToTry = [chatModel, ...fallbackModels].filter(Boolean);
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
