import pdf from 'pdf-parse';
import { chunkText } from '../../../lib/chunk.js';
import { embedTexts } from '../../../lib/embeddings.js';
import { ensureCollection, hashId, upsertPoints, getCollectionName } from '../../../lib/qdrant.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const start = performance.now();
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const title = (formData.get('title') || 'Untitled').toString().trim();
    const source = (formData.get('source') || 'upload').toString().trim();

    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdf(buffer);
    const text = (parsed.text || '').trim();

    if (!text) {
      return Response.json({ ok: false, error: 'No text extracted from PDF' }, { status: 400 });
    }

    // Get environment variables in API route
    const chunkTokens = Number(process.env.CHUNK_TOKENS || 1000);
    const overlapTokens = Number(process.env.CHUNK_OVERLAP_TOKENS || 120);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const embedModel = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    const collection = getCollectionName(process.env.QDRANT_COLLECTION);
    const batchSize = Number(process.env.UPSERT_BATCH || 64);

    const chunks = chunkText(text, { chunkTokens, overlapTokens });
    const embeddings = await embedTexts(chunks, geminiApiKey, embedModel);

    await ensureCollection(qdrantUrl, qdrantApiKey, collection, embeddings[0].length);

    const points = chunks.map((chunk, index) => {
      const id = hashId(`${source}:${title}:${index}:${chunk.slice(0, 100)}`);
      return {
        id,
        vector: embeddings[index],
        payload: {
          text: chunk,
          source,
          title,
          section: 'body',
          position: index,
          hash: id
        }
      };
    });

    for (let i = 0; i < points.length; i += batchSize) {
      await upsertPoints(qdrantUrl, qdrantApiKey, collection, points.slice(i, i + batchSize));
    }

    const totalMs = Math.round(performance.now() - start);
    return Response.json({ ok: true, chunks: chunks.length, ms: totalMs });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
