import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from '../constants';
import { useConfirm } from '../hooks/useConfirm';
import { deleteDocument, listDocuments, searchDocuments, uploadDocument } from '../services/documentService';
import type { DocumentSummary, SearchResult } from '../types/documents';
import { ChevronDownIcon, CloseIcon, FileIcon, SearchIcon, UploadIcon } from './icons';
import './DocumentsPanel.css';

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
  const [expanded, setExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    let cancelled = false;
    listDocuments()
      .then((list) => !cancelled && setDocs(list))
      .catch((e) => !cancelled && setError(messageOf(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadFiles = async (files: File[]) => {
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

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // lets the same file be chosen again later
    void uploadFiles(files);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  const handleDelete = async (doc: DocumentSummary) => {
    const sure = await confirm({
      title: 'Delete document?',
      message: `"${doc.filename}" will be removed from search. Answers that already cited it keep their citations.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!sure) return;
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
      <button className="docs-head" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <h2>Documents</h2>
        {docs.length > 0 && <span className="docs-count">{docs.length}</span>}
        <span className={`chevron ${expanded ? 'open' : ''}`}>
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {expanded && (
        <div className="docs-body">
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <button className="btn btn-sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <UploadIcon size={14} /> {uploading ? 'Indexing…' : 'Upload'}
            </button>
            <span>or drop .txt, .md, .pdf (max 2 MB)</span>
            <input ref={fileInput} type="file" multiple accept={ALLOWED_EXTENSIONS.join(',')} onChange={handleInput} hidden />
          </div>

          {error && (
            <p className="docs-error" role="alert">
              {error}
            </p>
          )}

          <ul className="docs-list">
            {docs.map((d) => (
              <li key={d.id}>
                <span className="doc-icon" aria-hidden="true">
                  <FileIcon size={15} />
                </span>
                <span className="doc-name" title={d.filename}>
                  {d.filename}
                </span>
                <span className="doc-meta">
                  {d.chunk_count} chunk{d.chunk_count === 1 ? '' : 's'}
                </span>
                <button className="btn-icon doc-delete" onClick={() => void handleDelete(d)} aria-label={`Delete ${d.filename}`}>
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>

          {docs.length > 0 && (
            <details className="docs-test">
              <summary>Test retrieval</summary>
              <form className="docs-search" onSubmit={(e) => void handleSearch(e)}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your documents"
                  maxLength={500}
                  aria-label="Search documents"
                />
                <button type="submit" className="btn btn-sm" disabled={searching || !query.trim()} aria-label="Search">
                  <SearchIcon size={14} />
                </button>
              </form>
              {results && (
                <ol className="docs-results">
                  {results.length === 0 && <li className="empty-list">No matches.</li>}
                  {results.map((r) => (
                    <li key={`${r.document_id}-${r.position}`}>
                      <div className="hit-head">
                        <span>
                          {r.filename} · #{r.position + 1}
                        </span>
                        <span className="score">{r.score.toFixed(2)}</span>
                      </div>
                      <p>{r.text.length > 220 ? `${r.text.slice(0, 220)}…` : r.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          )}
        </div>
      )}
      {dialog}
    </section>
  );
}
