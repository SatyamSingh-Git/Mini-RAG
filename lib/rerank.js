export async function rerank(query, documents, jinaApiKey, rerankModel = 'jina-reranker-v3') {
  if (!jinaApiKey) {
    return documents.map((doc, index) => ({
      ...doc,
      rerankScore: null,
      rerankIndex: index
    }));
  }

  const RERANK_URL = 'https://api.jina.ai/v1/rerank';

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
      Authorization: `Bearer ${jinaApiKey}`
    }
  };

  let res = await fetch(RERANK_URL, {
    ...requestOptions,
    body: requestBody(rerankModel)
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
