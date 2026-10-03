import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDocument, saveChatMessage, getChatHistory } from '../../db/database.js';
import { tfidfSearch } from '../../utils/tfidf.js';
import { getChunkRecords } from '../../utils/chunkRecords.js';
import { resolveTier, TIER } from '../../utils/tierDetection.js';
import { apiPost } from '../../utils/apiTransport.js';
import TierBadge from '../../components/shared/TierBadge.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';

const NOT_FOUND_RESPONSE = "I couldn't find an answer to that in your notes. Try rephrasing, or check if the topic is covered in your document.";

export default function StudentChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const docId = parseInt(id, 10);

  const [doc, setDoc] = useState(null);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    async function init() {
      const [docData, hist] = await Promise.all([
        getDocument(docId),
        getChatHistory(docId),
      ]);
      if (!docData) { navigate('/student'); return; }
      setDoc(docData);
      setHistory(hist);
      setInitLoading(false);
    }
    init();
  }, [docId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setLoading(true);

    // Save user message
    const userMsg = { documentId: docId, role: 'user', content: question, citations: [], tier: null };
    await saveChatMessage(userMsg);
    setHistory(prev => [...prev, { ...userMsg, timestamp: new Date() }]);

    try {
      const { tier } = await resolveTier({ feature: 'chat' });

      // Build stable chunk records once (stable chunkId + real best-effort page).
      const records = getChunkRecords(doc);
      // Always do local TF-IDF retrieval first, over the records' text.
      const topMatches = tfidfSearch(question, records.map(r => r.text), tier === TIER.CLOUD ? 5 : 3);
      const topRecords = topMatches.map(m => records[m.chunkIndex]).filter(Boolean);

      let answer = '';
      let citations = [];
      // The tier actually reflected to the user: cloud only when the cloud call
      // succeeds; a mid-flight failure downgrades the displayed tier to Tier 3.
      let effectiveTier = tier;

      if (tier === TIER.CLOUD && topRecords.length > 0) {
        try {
          // Chunks only — never filename, rawText, or student identifiers.
          const payload = {
            question,
            chunks: topRecords.map(r => ({
              chunkId: r.chunkId,
              text: r.text,
              ...(r.page ? { page: r.page } : {}),
            })),
          };
          const resp = await apiPost('/api/chat', payload);
          // Validate citations: keep only those referencing a chunkId we supplied.
          const suppliedIds = new Set(topRecords.map(r => r.chunkId));
          const validCitations = (resp.citations ?? [])
            .map(c => c.chunkId)
            .filter(id => suppliedIds.has(id));
          if (validCitations.length > 0 && resp.answer) {
            answer = resp.answer;
            citations = validCitations;
          } else {
            // No grounded citation — do not trust generated prose.
            answer = NOT_FOUND_RESPONSE;
            citations = [];
          }
        } catch {
          // Mid-flight cloud failure: re-run the Tier 3 path without re-invoking
          // the resolver, and reflect the effective tier as Offline mode.
          console.error('[Chat] Cloud failed, using Tier 3 retrieval');
          effectiveTier = TIER.DETERMINISTIC;
          answer = topRecords.length > 0 ? formatTier3Response(topRecords) : NOT_FOUND_RESPONSE;
          citations = topRecords.map(r => r.chunkId);
        }
      } else {
        // Tier 3: return top matching passages, no generated prose.
        effectiveTier = TIER.DETERMINISTIC;
        answer = topRecords.length > 0 ? formatTier3Response(topRecords) : NOT_FOUND_RESPONSE;
        citations = topRecords.map(r => r.chunkId);
      }

      setCurrentTier(effectiveTier);
      const botMsg = { documentId: docId, role: 'assistant', content: answer, citations, tier: effectiveTier };
      await saveChatMessage(botMsg);
      setHistory(prev => [...prev, { ...botMsg, timestamp: new Date() }]);
    } catch (err) {
      const errMsg = { documentId: docId, role: 'assistant', content: NOT_FOUND_RESPONSE, citations: [], tier: 'deterministic' };
      await saveChatMessage(errMsg);
      setHistory(prev => [...prev, { ...errMsg, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  function formatTier3Response(topRecords) {
    if (topRecords.length === 0) return NOT_FOUND_RESPONSE;
    const passages = topRecords.slice(0, 3).map((r, i) => {
      const where = r.page ? ` (from your notes, page ${r.page})` : ' (from your notes)';
      return `**Passage ${i + 1}**${where}:\n"${r.text.slice(0, 300)}${r.text.length > 300 ? '…' : ''}"`;
    });
    return `Here are the most relevant passages from your notes:\n\n${passages.join('\n\n')}`;
  }

  if (initLoading) return <div className="p-6"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(`/student/document/${docId}`)} className="text-gray-400 hover:text-gray-600 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center">‹</button>
          <div className="flex-1">
            <h1 className="font-bold text-gray-800">💬 Ask My Notes</h1>
            {currentTier && <TierBadge tier={currentTier} />}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 overflow-y-auto">
        {history.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">💭</div>
            <p>Ask anything about your notes</p>
            <p className="text-sm mt-1 text-gray-300">e.g. "What is the main argument?" or "Explain the key concept"</p>
          </div>
        )}

        <div className="space-y-4" role="log" aria-live="polite" aria-label="Conversation">
          {history.map((msg, i) => {
            const notFound = msg.role === 'assistant' && msg.content === NOT_FOUND_RESPONSE;
            return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                role={notFound ? 'alert' : undefined}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-100 shadow-sm text-gray-700'
              }`}>
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                {msg.role === 'assistant' && msg.tier && (
                  <div className="mt-2">
                    <TierBadge tier={msg.tier} />
                  </div>
                )}
              </div>
            </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about your notes..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-300 min-h-[48px]"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="bg-indigo-600 disabled:bg-gray-100 text-white disabled:text-gray-300 rounded-xl px-4 font-semibold text-sm transition-colors min-h-[48px] min-w-[48px]"
            aria-label="Send message"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
