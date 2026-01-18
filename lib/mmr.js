function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

export function mmrSelect(items, queryVector, topK = 12, lambda = 0.7) {
  const selected = [];
  const candidates = [...items];

  while (selected.length < topK && candidates.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const relevance = cosineSimilarity(queryVector, candidate.vector);
      let diversity = 0;
      for (const chosen of selected) {
        diversity = Math.max(diversity, cosineSimilarity(candidate.vector, chosen.vector));
      }
      const score = lambda * relevance - (1 - lambda) * diversity;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    selected.push(candidates.splice(bestIndex, 1)[0]);
  }

  return selected;
}
