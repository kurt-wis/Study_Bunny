import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveDocument, getAllDocuments, deleteDocument } from '../../db/database.js';
import { processDocument } from '../../utils/documentProcessor.js';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export default function StudentHome() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await getAllDocuments();
      setDocuments(docs);
    } catch (err) {
      setError('Could not load documents. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('This PDF is larger than 50 MB. Please choose a smaller file.');
      return;
    }
    setError(null);
    setUploading(true);
    setProgress('Starting…');
    try {
      const { title, rawText, chunks, pages } = await processDocument(file, (p) => {
        if (p.stage === 'extracting') {
          setProgress(`Extracting page ${p.page} of ${p.pageCount}…`);
        } else if (p.stage === 'chunking') {
          setProgress('Chunking notes…');
        } else if (p.stage === 'done') {
          setProgress('Saving…');
        }
      });
      const docId = await saveDocument({ title, rawText, chunks, pages, createdAt: new Date() });
      await loadDocuments();
      navigate(`/student/document/${docId}`);
    } catch (err) {
      setError(err.message || 'Failed to process PDF. Please try another file.');
      setUploading(false);
      setProgress(null);
    }
  }

  function onFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function onDelete(e, docId) {
    e.stopPropagation();
    if (!confirm('Delete this document and all its study data?')) return;
    await deleteDocument(docId);
    await loadDocuments();
  }

  function formatDate(d) {
    return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <h1 className="font-bold text-lg text-indigo-700">🐰 Study Bunny</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Upload zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center mb-6 transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-indigo-300'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <div>
              <LoadingSpinner message="Processing PDF..." />
              <p role="status" aria-live="polite" className="text-sm text-gray-500 mt-3">
                {progress}
              </p>
            </div>
          ) : (
            <>
              <div className="text-4xl mb-3">📄</div>
              <p className="font-semibold text-gray-700 mb-1">Drop your PDF here</p>
              <p className="text-gray-400 text-sm mb-4">or click to browse</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors min-h-[48px]"
              >
                Upload PDF
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={onFileInput}
                className="hidden"
                aria-label="Choose PDF file"
              />
            </>
          )}
        </div>

        {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

        {/* Document list */}
        {loading ? (
          <LoadingSpinner message="Loading documents..." />
        ) : documents.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">🗒️</div>
            <p className="font-medium">No documents yet</p>
            <p className="text-sm mt-1">Upload a PDF to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Your Notes</h2>
            {documents.map(doc => (
              <article
                key={doc.id}
                className="w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex items-center gap-4 group"
              >
                <Link
                  to={`/student/document/${doc.id}`}
                  className="flex flex-1 min-w-0 items-center gap-4 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="text-2xl" aria-hidden="true">📄</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-gray-800 truncate group-hover:text-indigo-700">{doc.title}</span>
                    <span className="block text-gray-400 text-sm mt-0.5">
                      {doc.chunks?.length ?? 0} chunks · {formatDate(doc.createdAt)}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={e => onDelete(e, doc.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-lg min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label={`Delete ${doc.title}`}
                >
                  🗑
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
