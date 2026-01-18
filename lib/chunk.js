const DEFAULT_CHUNK_TOKENS = 1000;
const DEFAULT_OVERLAP_TOKENS = 120;

export function approxTokenCount(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function splitSentences(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chunkText(
  text,
  {
    chunkTokens = DEFAULT_CHUNK_TOKENS,
    overlapTokens = DEFAULT_OVERLAP_TOKENS
  } = {}
) {
  const sentences = splitSentences(text);
  const chunks = [];
  let current = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = approxTokenCount(sentence);
    if (currentTokens + sentenceTokens > chunkTokens && current.length) {
      chunks.push(current.join(' '));
      const overlapText = current
        .slice(Math.max(0, current.length - 3))
        .join(' ');
      current = overlapText ? [overlapText] : [];
      currentTokens = approxTokenCount(overlapText);
    }
    current.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (current.length) {
    chunks.push(current.join(' '));
  }

  if (overlapTokens > 0 && chunks.length > 1) {
    return chunks.map((chunk, index) => {
      if (index === 0) return chunk;
      const prev = chunks[index - 1];
      const prevWords = prev.split(/\s+/);
      const overlapWords = prevWords.slice(-Math.ceil(overlapTokens / 1.3));
      return `${overlapWords.join(' ')} ${chunk}`.trim();
    });
  }

  return chunks;
}
