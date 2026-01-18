import crypto from 'crypto';

function qdrantHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

export function getCollectionName(collection) {
  if (!collection) {
    throw new Error('Collection name is required');
  }
  return collection;
}

export async function ensureCollection(qdrantUrl, apiKey, collection, vectorSize) {
  if (!qdrantUrl) throw new Error('Missing QDRANT_URL');

  const res = await fetch(`${qdrantUrl}/collections/${collection}`);
  if (res.ok) {
    await ensurePayloadIndexes(qdrantUrl, apiKey, collection);
    return;
  }

  const createRes = await fetch(`${qdrantUrl}/collections/${collection}`, {
    method: 'PUT',
    headers: qdrantHeaders(apiKey),
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
      await ensurePayloadIndexes(qdrantUrl, apiKey, collection);
      return;
    }
    throw new Error(`Failed to create collection: ${errorText}`);
  }

  await ensurePayloadIndexes(qdrantUrl, apiKey, collection);
}

async function ensurePayloadIndexes(qdrantUrl, apiKey, collection) {
  await createPayloadIndex(qdrantUrl, apiKey, collection, 'source');
  await createPayloadIndex(qdrantUrl, apiKey, collection, 'title');
}

async function createPayloadIndex(qdrantUrl, apiKey, collection, fieldName) {
  if (!qdrantUrl) throw new Error('Missing QDRANT_URL');
  const res = await fetch(`${qdrantUrl}/collections/${collection}/index`, {
    method: 'PUT',
    headers: qdrantHeaders(apiKey),
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

export async function upsertPoints(qdrantUrl, apiKey, collection, points) {
  if (!qdrantUrl) throw new Error('Missing QDRANT_URL');
  const res = await fetch(`${qdrantUrl}/collections/${collection}/points?wait=true`, {
    method: 'PUT',
    headers: qdrantHeaders(apiKey),
    body: JSON.stringify({ points })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Qdrant upsert failed: ${errorText}`);
  }
}

export async function searchPoints(qdrantUrl, apiKey, collection, queryVector, limit = 50, filter = null) {
  if (!qdrantUrl) throw new Error('Missing QDRANT_URL');

  const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: qdrantHeaders(apiKey),
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
