import { chunkText } from '../../../lib/chunk.js';
import { embedTexts } from '../../../lib/embeddings.js';
import { ensureCollection, hashId, upsertPoints } from '../../../lib/qdrant.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const start = performance.now();
  try {
    const body = await request.json();
    const text = body?.text?.trim();
    const title = body?.title?.trim() || 'Untitled';
    const source = body?.source?.trim() || 'manual';

    if (!text) {
      return Response.json({ ok: false, error: 'No text provided' }, { status: 400 });
    }

    const chunkTokens = Number(process.env.CHUNK_TOKENS || 1000);
    const overlapTokens = Number(process.env.CHUNK_OVERLAP_TOKENS || 120);

    const chunks = chunkText(text, { chunkTokens, overlapTokens });
    const embeddings = await embedTexts(chunks);

    await ensureCollection(embeddings[0].length);

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

    const batchSize = Number(process.env.UPSERT_BATCH || 64);
    for (let i = 0; i < points.length; i += batchSize) {
      await upsertPoints(points.slice(i, i + batchSize));
    }

    const totalMs = Math.round(performance.now() - start);
    return Response.json({ ok: true, chunks: chunks.length, ms: totalMs });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
