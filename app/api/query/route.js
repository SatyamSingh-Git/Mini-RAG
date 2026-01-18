import { approxTokenCount } from '../../../lib/chunk.js';
import { embedText, generateAnswer } from '../../../lib/embeddings.js';
import { searchPoints } from '../../../lib/qdrant.js';
import { mmrSelect } from '../../../lib/mmr.js';
import { rerank } from '../../../lib/rerank.js';

export const runtime = 'nodejs';

function buildContext(docs) {
  return docs
    .map((doc, index) => {
      const snippet = doc.payload?.text || '';
      return `[${index + 1}] ${snippet}`;
    })
    .join('\n\n');
}

function buildSources(docs) {
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.payload?.title,
    source: doc.payload?.source,
    section: doc.payload?.section,
    position: doc.payload?.position,
    snippet: (doc.payload?.text || '').slice(0, 600)
  }));
}

export async function POST(request) {
  const totalStart = performance.now();
  try {
    const body = await request.json();
    const query = body?.query?.trim();
    const filterInput = body?.filter || null;

    if (!query) {
      return Response.json({ ok: false, error: 'No query provided' }, { status: 400 });
    }

    // Get environment variables in API route
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const embedModel = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
    const chatModel = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
    const maxOutputTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 512);
    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    const collection = process.env.QDRANT_COLLECTION || 'rag_chunks';
    const jinaApiKey = process.env.JINA_API_KEY;
    const rerankModel = process.env.RERANK_MODEL || 'jina-reranker-v3';
    
    // Get configuration values
    const topK = Number(process.env.RETRIEVE_TOP_K || 50);
    const mmrTopK = Number(process.env.MMR_TOP_K || 20);
    const mmrLambda = Number(process.env.MMR_LAMBDA || 0.7);
    const finalTopN = Number(process.env.RERANK_TOP_N || 8);
    const minScore = Number(process.env.MIN_RERANK_SCORE || 0.15);

    const embedStart = performance.now();
    const queryVector = await embedText(query, geminiApiKey, embedModel);
    const embedMs = Math.round(performance.now() - embedStart);

    const searchStart = performance.now();
    const qdrantFilter = filterInput?.source
      ? {
          must: [
            { key: 'source', match: { value: filterInput.source } },
            ...(filterInput.title
              ? [{ key: 'title', match: { value: filterInput.title } }]
              : [])
          ]
        }
      : null;
    const initialResults = await searchPoints(qdrantUrl, qdrantApiKey, collection, queryVector, topK, qdrantFilter);
    const searchMs = Math.round(performance.now() - searchStart);

    if (!initialResults.length) {
      return Response.json({
        ok: true,
        answer: 'I do not know based on the available sources.',
        sources: [],
        timing: {
          embedMs,
          searchMs,
          rerankMs: 0,
          llmMs: 0,
          totalMs: Math.round(performance.now() - totalStart)
        },
        usage: { approxTokens: approxTokenCount(query), approxCost: '$0.00' }
      });
    }

    const mmrResults = mmrSelect(initialResults, queryVector, mmrTopK, mmrLambda);

    const rerankStart = performance.now();
    const reranked = await rerank(query, mmrResults, jinaApiKey, rerankModel);
    const rerankMs = Math.round(performance.now() - rerankStart);

    const finalDocs = reranked.slice(0, finalTopN);

    const topScore = finalDocs[0]?.rerankScore ?? 1;

    if (!finalDocs.length || topScore < minScore) {
      return Response.json({
        ok: true,
        answer: 'I do not know based on the available sources.',
        sources: buildSources(finalDocs),
        timing: {
          embedMs,
          searchMs,
          rerankMs,
          llmMs: 0,
          totalMs: Math.round(performance.now() - totalStart)
        },
        usage: { approxTokens: approxTokenCount(query), approxCost: '$0.00' }
      });
    }

    const context = buildContext(finalDocs);
    const prompt = `You are a grounded assistant. Answer the question only using the sources below.\n\n` +
      `Rules:\n- If the answer is not in the sources, say: "I do not know based on the available sources."\n` +
      `- Use inline citations like [1], [2] that match the sources list.\n` +
      `- Be concise and factual.\n\n` +
      `Question: ${query}\n\nSources:\n${context}`;

    const llmStart = performance.now();
    const answer = await generateAnswer(prompt, geminiApiKey, chatModel, maxOutputTokens);
    const llmMs = Math.round(performance.now() - llmStart);

    const approxTokens = approxTokenCount(query + context + answer);
    const inputCostPer1k = Number(process.env.COST_PER_1K_INPUT || 0);
    const outputCostPer1k = Number(process.env.COST_PER_1K_OUTPUT || 0);
    const approxCost = ((approxTokens / 1000) * (inputCostPer1k + outputCostPer1k)).toFixed(4);

    return Response.json({
      ok: true,
      answer: answer.trim(),
      sources: buildSources(finalDocs),
      timing: {
        embedMs,
        searchMs,
        rerankMs,
        llmMs,
        totalMs: Math.round(performance.now() - totalStart)
      },
      usage: { approxTokens, approxCost: `$${approxCost}` }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
