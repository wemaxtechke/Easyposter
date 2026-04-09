import { useState, useEffect, useRef } from 'react';
import { usePosterStore } from '../store/posterStore';
import { chatPosterAi, getPosterAiUsage, type ChatMessage } from '../services/posterAiApi';
import type { PosterElement } from '../types';

/** Same as backend RASTER_3D_TEXT_AI_KEYS — 3D text is a raster; AI may adjust like an image (never src/image). */
const RASTER_3D_TEXT_AI_KEYS = new Set([
  'left',
  'top',
  'scaleX',
  'scaleY',
  'angle',
  'opacity',
  'zIndex',
  'mask',
  'edge',
  'edgeFadeAmount',
  'edgeFadeMinOpacity',
  'edgeFadeDirection',
  'edgeTearSeed',
  'maskCornerRadius',
  'maskImageOffsetX',
  'maskImageOffsetY',
  'maskImageScale',
  'maskScale',
  'adjustBrightness',
  'adjustContrast',
  'adjustSaturation',
  'adjustSharpness',
  'flipHorizontal',
  'flipVertical',
  'textureOverlay',
  'shadow',
]);

function sanitizeUpdates(elementId: string, updates: Record<string, unknown>, elements: PosterElement[]): Record<string, unknown> | null {
  const el = elements.find((e) => e.id === elementId);
  if (!el) return null;
  if (el.type === '3d-text') {
    const filtered: Record<string, unknown> = {};
    for (const k of Object.keys(updates)) {
      if (k === 'src' || k === 'image') continue;
      if (RASTER_3D_TEXT_AI_KEYS.has(k)) filtered[k] = updates[k];
    }
    return Object.keys(filtered).length > 0 ? filtered : null;
  }
  return updates;
}

interface PosterAiChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function PosterAiChatPanel({ open, onClose }: PosterAiChatPanelProps) {
  const getProject = usePosterStore((s) => s.getProject);
  const getFieldBindings = usePosterStore((s) => s.getFieldBindings);
  const updateElement = usePosterStore((s) => s.updateElement);
  const pushHistory = usePosterStore((s) => s.pushHistory);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ tokensUsed: number; limit: number | null; remaining: number | null } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      getPosterAiUsage()
        .then(setUsage)
        .catch(() => setUsage(null));
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const project = getProject();
      const fieldBindings = getFieldBindings();
      const response = await chatPosterAi(messages.concat(userMessage), project, fieldBindings);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.message },
      ]);
      setUsage({
        tokensUsed: response.usage.tokensUsed,
        limit: response.usage.limit,
        remaining: response.usage.remaining,
      });

      if (response.edits.length > 0) {
        pushHistory();
        const currentElements = usePosterStore.getState().elements;
        for (const { elementId, updates } of response.edits) {
          const sanitized = sanitizeUpdates(elementId, updates, currentElements);
          if (sanitized) {
            updateElement(elementId, sanitized as Partial<PosterElement>);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop on mobile */}
      <div
        className="fixed inset-0 z-[99] bg-black/40 md:hidden"
        onClick={onClose}
      />
      <div className={[
        'fixed z-[100] flex flex-col border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900',
        // Mobile: bottom sheet
        'inset-x-0 bottom-0 h-[65vh] rounded-t-2xl border-t',
        // Desktop: right panel
        'md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:w-80 md:rounded-none md:border-t-0 md:border-l',
      ].join(' ')}>
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Assistant</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {usage && usage.limit != null && (
        <div className="shrink-0 border-b border-zinc-200 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {usage.tokensUsed.toLocaleString()} / {usage.limit.toLocaleString()} tokens used
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ask me to edit your poster. For example: &quot;Make the title larger&quot;, &quot;Change the headline to blue&quot;. I can move, resize, and style text, images, and shapes. For 3D text I can only adjust position and size.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-2 rounded-lg px-2.5 py-1.5 text-sm ${
              m.role === 'user'
                ? 'ml-6 bg-accent-100 text-accent-900 dark:bg-accent-900/40 dark:text-accent-100'
                : 'mr-6 bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="mb-2 mr-6 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Thinking…
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
          {error.includes('limit') && (
            <span className="block mt-1">Upgrade to Pro for more tokens.</span>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-700">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe changes…"
            disabled={loading}
            className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
    </>
  );
}
