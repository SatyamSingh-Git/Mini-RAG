import { getCollectionName } from '../../../lib/qdrant.js';

export const runtime = 'nodejs';

function qdrantHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { source, title, deleteAll } = body;

    // Get environment variables in API route
    const QDRANT_URL = process.env.QDRANT_URL;
    const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

    if (!QDRANT_URL) {
      return Response.json({ ok: false, error: 'Missing QDRANT_URL' }, { status: 500 });
    }

    const collection = getCollectionName(process.env.QDRANT_COLLECTION);

    if (deleteAll) {
      // Delete entire collection
      const res = await fetch(`${QDRANT_URL}/collections/${collection}`, {
        method: 'DELETE',
        headers: qdrantHeaders(QDRANT_API_KEY)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return Response.json({ ok: false, error: errorText }, { status: 500 });
      }

      return Response.json({ ok: true, message: 'All embeddings deleted' });
    }

    if (!source && !title) {
      return Response.json(
        { ok: false, error: 'Provide source, title, or deleteAll: true' },
        { status: 400 }
      );
    }

    // Delete by filter
    const must = [];
    if (source) must.push({ key: 'source', match: { value: source } });
    if (title) must.push({ key: 'title', match: { value: title } });

    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/delete`, {
      method: 'POST',
      headers: qdrantHeaders(QDRANT_API_KEY),
      body: JSON.stringify({
        filter: { must }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      return Response.json({ ok: false, error: errorText }, { status: 500 });
    }

    return Response.json({ ok: true, message: 'Embeddings deleted by filter' });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
