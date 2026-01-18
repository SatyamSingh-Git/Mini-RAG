import crypto from 'crypto';

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION || 'rag_chunks';

function qdrantHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;
  return headers;
}

export function getCollectionName() {
  return COLLECTION;
}

export async function ensureCollection(vectorSize) {
  if (!QDRANT_URL) throw new Error('Missing QDRANT_URL');

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (res.ok) {
    await ensurePayloadIndexes();
    return;
  }

  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: 'Cosine'
      }
    })
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    if (errorText.includes('already exists')) {
      await ensurePayloadIndexes();
      return;
    }
    throw new Error(`Failed to create collection: ${errorText}`);
  }

  await ensurePayloadIndexes();
}

async function ensurePayloadIndexes() {
  await createPayloadIndex('source');
  await createPayloadIndex('title');
}

async function createPayloadIndex(fieldName) {
  if (!QDRANT_URL) throw new Error('Missing QDRANT_URL');
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      field_name: fieldName,
      field_schema: 'keyword'
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (errorText.includes('already exists') || errorText.includes('exists')) {
      return;
    }
    throw new Error(`Failed to create payload index: ${errorText}`);
  }
}

export function hashId(text) {
  const hex = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function upsertPoints(points) {
  if (!QDRANT_URL) throw new Error('Missing QDRANT_URL');
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify({ points })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Qdrant upsert failed: ${errorText}`);
  }
}

export async function searchPoints(queryVector, limit = 50, filter = null) {
  if (!QDRANT_URL) throw new Error('Missing QDRANT_URL');

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vector: queryVector,
      limit,
      filter: filter || undefined,
      with_payload: true,
      with_vectors: true
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Qdrant search failed: ${errorText}`);
  }

  const data = await res.json();
  return data.result || [];
}
