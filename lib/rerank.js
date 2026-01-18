const RERANK_URL = process.env.RERANK_URL || 'https://api.jina.ai/v1/rerank';
const RERANK_MODEL = process.env.RERANK_MODEL || 'jina-reranker-v3';
const JINA_API_KEY = process.env.JINA_API_KEY;

export async function rerank(query, documents) {
  if (!JINA_API_KEY) {
    return documents.map((doc, index) => ({
      ...doc,
      rerankScore: null,
      rerankIndex: index
    }));
  }

  const requestBody = (model) =>
    JSON.stringify({
      model,
      query,
      documents: documents.map((doc) => doc.payload?.text || doc.text || '')
    });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JINA_API_KEY}`
    }
  };

  let res = await fetch(RERANK_URL, {
    ...requestOptions,
    body: requestBody(RERANK_MODEL)
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (errorText.includes('union_tag_invalid') || errorText.includes('expected tags')) {
      res = await fetch(RERANK_URL, {
        ...requestOptions,
        body: requestBody('jina-reranker-v3')
      });
      if (!res.ok) {
        const retryText = await res.text();
        throw new Error(`Rerank failed: ${retryText}`);
      }
    } else {
      throw new Error(`Rerank failed: ${errorText}`);
    }
  }

  const data = await res.json();
  const results = data.results || [];

  return results
    .map((r) => ({
      ...documents[r.index],
      rerankScore: r.relevance_score,
      rerankIndex: r.index
    }))
    .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
}
