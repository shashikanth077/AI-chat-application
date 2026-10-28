import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDocument, listDocuments, searchDocuments, uploadDocument } from '../services/documentService';
import type { DocumentSummary } from '../types/documents';
import { DocumentsPanel } from './DocumentsPanel';

vi.mock('../services/documentService');

const doc = (id: string, filename: string, chunks = 3): DocumentSummary => ({ id, filename, size_bytes: 100, chunk_count: chunks, created_at: '2026-10-28T09:00:00' });
const file = (name: string, size = 100) => new File([new Uint8Array(size)], name);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listDocuments).mockResolvedValue([doc('1', 'cats.txt', 1), doc('2', 'report.pdf', 12)]);
});

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const choose = (...files: File[]) => fireEvent.change(fileInput(), { target: { files } });

describe('DocumentsPanel', () => {
  it('lists documents with singular/plural chunk counts and a total badge', async () => {
    render(<DocumentsPanel />);
    expect(await screen.findByText('cats.txt')).toBeInTheDocument();
    expect(screen.getByText('1 chunk')).toBeInTheDocument();
    expect(screen.getByText('12 chunks')).toBeInTheDocument();
    expect(screen.getByText('2')).toHaveClass('docs-count');
  });

  it('uploads a valid file and puts it at the top of the list', async () => {
    vi.mocked(uploadDocument).mockResolvedValue(doc('3', 'notes.md', 4));
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');
    choose(file('notes.md'));
    expect(await screen.findByText('notes.md')).toBeInTheDocument();
    expect(uploadDocument).toHaveBeenCalledOnce();
    const names = screen.getAllByText(/\.(txt|md|pdf)$/).map((e) => e.textContent);
    expect(names[0]).toBe('notes.md');
  });

  it('rejects wrong types and oversized files in the browser without uploading', async () => {
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');
    choose(file('virus.exe'));
    expect(await screen.findByRole('alert')).toHaveTextContent('virus.exe: use .txt, .md, .pdf.');
    choose(file('big.pdf', 2_000_001));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('big.pdf: larger than 2 MB.'));
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('shows the server\'s reason, prefixed with the file name, and keeps the list unchanged', async () => {
    vi.mocked(uploadDocument).mockRejectedValue(new Error('The file is not valid UTF-8 text.'));
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');
    choose(file('bad.txt'));
    expect(await screen.findByRole('alert')).toHaveTextContent('bad.txt: The file is not valid UTF-8 text.');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('accepts files dropped onto the drop zone', async () => {
    vi.mocked(uploadDocument).mockResolvedValue(doc('3', 'dropped.txt'));
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');
    const zone = document.querySelector('.dropzone') as HTMLElement;
    fireEvent.dragOver(zone);
    expect(zone).toHaveClass('dragging');
    fireEvent.drop(zone, { dataTransfer: { files: [file('dropped.txt')] } });
    expect(await screen.findByText('dropped.txt')).toBeInTheDocument();
    expect(zone).not.toHaveClass('dragging');
  });

  it('asks before deleting: cancel keeps the document, confirm removes it', async () => {
    vi.mocked(deleteDocument).mockResolvedValue(undefined);
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');

    await userEvent.click(screen.getByRole('button', { name: 'Delete cats.txt' }));
    expect(await screen.findByRole('dialog', { name: 'Delete document?' })).toHaveTextContent('keep their citations');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteDocument).not.toHaveBeenCalled();
    expect(screen.getByText('cats.txt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete cats.txt' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('cats.txt')).not.toBeInTheDocument());
    expect(deleteDocument).toHaveBeenCalledExactlyOnceWith('1');
  });

  it('runs a test search and shows scored passages, then clears stale results after a delete', async () => {
    vi.mocked(searchDocuments).mockResolvedValue([{ document_id: '1', filename: 'cats.txt', position: 0, text: 'Cats sleep a lot.', score: 0.7123 }]);
    vi.mocked(deleteDocument).mockResolvedValue(undefined);
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');
    await userEvent.click(screen.getByText('Test retrieval'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search documents' }), 'cats sleep{Enter}');
    expect(await screen.findByText('Cats sleep a lot.')).toBeInTheDocument();
    expect(screen.getByText('0.71')).toBeInTheDocument();
    expect(searchDocuments).toHaveBeenCalledWith('cats sleep');

    await userEvent.click(screen.getByRole('button', { name: 'Delete report.pdf' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Cats sleep a lot.')).not.toBeInTheDocument());
  });

  it('collapses and expands', async () => {
    render(<DocumentsPanel />);
    await screen.findByText('cats.txt');
    const header = screen.getByRole('button', { name: /Documents/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('cats.txt')).not.toBeInTheDocument();
  });
});
