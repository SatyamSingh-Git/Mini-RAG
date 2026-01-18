'use client';

import { useMemo, useState } from 'react';

export default function Home() {
  const [ingestText, setIngestText] = useState('');
  const [ingestTitle, setIngestTitle] = useState('');
  const [ingestSource, setIngestSource] = useState('');
  const [ingestFile, setIngestFile] = useState(null);
  const [ingestFiles, setIngestFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [ingestStatus, setIngestStatus] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState(() => new Set());
  const [lastIngestFilter, setLastIngestFilter] = useState(null);
  const [searchAllSources, setSearchAllSources] = useState(true);

  const canIngest = useMemo(
    () => ingestText.trim().length > 0 || Boolean(ingestFile) || ingestFiles.length > 0,
    [ingestText, ingestFile, ingestFiles.length]
  );
  const canQuery = useMemo(() => query.trim().length > 0, [query]);

  async function handleIngest() {
    setIngestStatus(null);
    setIngestLoading(true);
    try {
      let data;
      if (ingestFiles.length > 0) {
        data = await handleIngestAllFiles();
      } else if (ingestFile) {
        data = await ingestSingleFile(ingestFile, ingestTitle, ingestSource);
      } else {
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: ingestText,
            title: ingestTitle || 'Untitled',
            source: ingestSource || 'manual'
          })
        });
        data = await res.json();
      }

      setIngestStatus(data);
      if (data?.ok) {
        setLastIngestFilter({
          source: ingestSource || (ingestFile?.name ?? 'upload'),
          title: ingestTitle || ingestFile?.name || 'Untitled'
        });
      }
    } catch (error) {
      setIngestStatus({ ok: false, error: error.message });
    } finally {
      setIngestLoading(false);
    }
  }

  async function handleIngestAllFiles() {
    let totalChunks = 0;
    const start = performance.now();
    for (const file of ingestFiles) {
      const result = await ingestSingleFile(file, file.name, 'upload');
      if (!result.ok) {
        return result;
      }
      totalChunks += result.chunks || 0;
    }
    return { ok: true, chunks: totalChunks, ms: Math.round(performance.now() - start) };
  }

  async function ingestSingleFile(file, title, source) {
    if (file.type === 'application/pdf') {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title || file.name || 'Untitled');
      formData.append('source', source || file.name || 'upload');
      const res = await fetch('/api/ingest-file', {
        method: 'POST',
        body: formData
      });
      return res.json();
    }

    const text = await readFileAsText(file);
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        title: title || file.name || 'Untitled',
        source: source || file.name || 'upload'
      })
    });
    return res.json();
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async function handleQuery() {
    setAnswer(null);
    setQueryLoading(true);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filter: searchAllSources ? null : lastIngestFilter
        })
      });
      const data = await res.json();
      setAnswer(data);
    } catch (error) {
      setAnswer({ ok: false, error: error.message });
    } finally {
      setQueryLoading(false);
    }
  }

  function toggleSource(id) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setIngestFiles((prev) => [...prev, ...files]);
    setIngestFile(files[0]);
    setIngestTitle(files[0].name);
    setIngestSource('upload');
    setIngestText('');
  }

  return (
    <main>
      <header className="hero">
        <div>
          <h1 className="hero-title">Mini RAG (Qdrant + Gemini)</h1>
          <p className="hero-sub">
            Upload or paste text to build your vector index, then ask a question. Answers include inline citations.
          </p>
          <div className="hero-badges">
            <span className="badge">Vector DB: Qdrant</span>
            <span className="badge">LLM: Gemini</span>
            <span className="badge">Reranker: Jina</span>
            <span className="badge">Files: TXT · MD · PDF</span>
          </div>
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <div className="panel-header">
            <h2>1) Ingest</h2>
            <small>Upload or paste One or More document to index in Qdrant.</small>
          </div>
          <div className="stack">
            <div className="row">
              <input type="file" accept=".txt,.md,.pdf" onChange={handleFileChange} multiple />
              {ingestFiles.length > 0 && (
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => {
                    setIngestFiles([]);
                    setIngestFile(null);
                    setIngestText('');
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
            {ingestFiles.length > 0 && (
              <ul className="file-list">
                {ingestFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="file-item">
                    <span className="file-index">{index + 1}.</span>
                    <span className="file-name">{file.name}</span>
                    <span className="file-type">{file.type || 'text/plain'}</span>
                    <button
                      className="ghost small"
                      type="button"
                      disabled={ingestLoading}
                      onClick={() => ingestSingleFile(file, file.name, 'upload')}
                    >
                      Ingest
                    </button>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => setIngestFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {ingestFiles.length === 0 && (
              <>
                <input
                  type="text"
                  placeholder="Title"
                  value={ingestTitle}
                  onChange={(e) => setIngestTitle(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Source (e.g., URL, filename)"
                  value={ingestSource}
                  onChange={(e) => setIngestSource(e.target.value)}
                />
              </>
            )}
            <textarea
              placeholder={ingestFile?.type === 'application/pdf'
                ? 'PDF selected. Click Ingest to parse and index.'
                : 'Paste text to index...'}
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              disabled={ingestFile?.type === 'application/pdf' || ingestFiles.length > 0}
            />
            <div className="row">
              <button disabled={!canIngest || ingestLoading} onClick={handleIngest}>
                {ingestLoading ? 'Working...' : ingestFiles.length > 0 ? 'Ingest All Files' : 'Ingest'}
              </button>
              <button
                className="ghost danger"
                type="button"
                onClick={async () => {
                  if (!confirm('Delete ALL embeddings from the vector database?')) return;
                  const res = await fetch('/api/embeddings', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deleteAll: true })
                  });
                  const data = await res.json();
                  alert(data.ok ? 'All embeddings deleted.' : `Error: ${data.error}`);
                }}
              >
                Delete All Embeddings
              </button>
              {ingestStatus?.ok && (
                <small>
                  Indexed {ingestStatus.chunks} chunks in {ingestStatus.ms} ms.
                </small>
              )}
            </div>
            {ingestStatus && !ingestStatus.ok && <small>Error: {ingestStatus.error}</small>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>2) Ask</h2>
            <small>Query your indexed content with grounded answers.</small>
          </div>
          <div className="stack">
            <input
              type="text"
              placeholder="Ask a question about your content"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && canQuery && !queryLoading) {
                  e.preventDefault();
                  handleQuery();
                }
              }}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={searchAllSources}
                onChange={(e) => setSearchAllSources(e.target.checked)}
              />
              Search across all uploaded sources
            </label>
            <button disabled={!canQuery || queryLoading} onClick={handleQuery}>
              {queryLoading ? 'Working...' : 'Ask'}
            </button>

            {answer && (
              <div className="results">
                {answer.ok ? (
                  <>
                    <div className="card">
                      <h3>Answer</h3>
                      <p>{answer.answer}</p>
                      <small>
                        {answer.timing?.totalMs} ms • tokens ~{answer.usage?.approxTokens} • cost ~{answer.usage?.approxCost}
                      </small>
                    </div>
                    <div className="citations">
                      <h3>Sources</h3>
                      <div className="source-grid">
                        {answer.sources?.map((src, idx) => (
                          <div className="source-card" key={src.id || idx}>
                            <div className="source-head">
                              <span className="badge">[{idx + 1}]</span>
                              <strong>{src.title || 'Untitled'}</strong>
                            </div>
                            <small className="source-meta">{src.source}</small>
                            <p className={`source-snippet ${expandedSources.has(src.id || idx) ? 'expanded' : ''}`}>
                              {src.snippet}
                            </p>
                            <button
                              className="ghost"
                              type="button"
                              onClick={() => toggleSource(src.id || idx)}
                            >
                              {expandedSources.has(src.id || idx) ? 'Show less' : 'Show more'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <small>Error: {answer.error}</small>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
