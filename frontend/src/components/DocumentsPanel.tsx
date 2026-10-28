import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from '../constants';
import {
  deleteDocument,
  listDocuments,
  searchDocuments,
  uploadDocument,
} from '../services/documentService';
import type { DocumentSummary, SearchResult } from '../types/documents';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function checkFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) return `${file.name}: use ${ALLOWED_EXTENSIONS.join(', ')}.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name}: larger than ${MAX_UPLOAD_BYTES / 1_000_000} MB.`;
  return null;
}

export function DocumentsPanel() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listDocuments()
      .then((list) => !cancelled && setDocs(list))
      .catch((e) => !cancelled && setError(messageOf(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // lets the same file be chosen again later
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    // One at a time: embedding is CPU-heavy on the server.
    for (const file of files) {
      const problem = checkFile(file);
      if (problem) {
        setError(problem);
        continue;
      }
      try {
        const created = await uploadDocument(file);
        setDocs((prev) => [created, ...prev]);
        setResults(null);
      } catch (e) {
        setError(`${file.name}: ${messageOf(e)}`);
      }
    }
    setUploading(false);
  };

  const handleDelete = async (doc: DocumentSummary) => {
    if (!window.confirm(`Delete "${doc.filename}"?`)) return;
    try {
      await deleteDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setResults(null); // results may have come from this document
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setError(null);
    setSearching(true);
    try {
      setResults(await searchDocuments(text));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="docs" aria-label="Documents">
      <div className="docs-head">
        <h2>Documents</h2>
        <button onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? 'Indexing…' : '+ Upload'}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={(e) => void handleFiles(e)}
          hidden
        />
      </div>
      {error && <p className="docs-error" role="alert">{error}</p>}
      <ul className="docs-list">
        {docs.map((d) => (
          <li key={d.id}>
            <span className="doc-name" title={d.filename}>{d.filename}</span>
            <span className="doc-meta">{d.chunk_count} chunk{d.chunk_count === 1 ? '' : 's'}</span>
            <button className="conv-delete" onClick={() => void handleDelete(d)} aria-label={`Delete ${d.filename}`}>×</button>
          </li>
        ))}
        {docs.length === 0 && <li className="empty-list">.txt, .md or .pdf, up to 2 MB.</li>}
      </ul>

      {docs.length > 0 && (
        <form className="docs-search" onSubmit={(e) => void handleSearch(e)}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Test search your documents"
            maxLength={500}
            aria-label="Search documents"
          />
          <button type="submit" disabled={searching || !query.trim()}>Go</button>
        </form>
      )}
      {results && (
        <ol className="docs-results">
          {results.length === 0 && <li className="empty-list">No matches.</li>}
          {results.map((r) => (
            <li key={`${r.document_id}-${r.position}`}>
              <div className="hit-head">
                <span>{r.filename} · #{r.position + 1}</span>
                <span className="score">{r.score.toFixed(2)}</span>
              </div>
              <p>{r.text.length > 220 ? `${r.text.slice(0, 220)}…` : r.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
