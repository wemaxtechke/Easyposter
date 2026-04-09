import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePosterStore } from '../store/posterStore';
import { useAuthStore } from '../../auth/authStore';
import {
  POSTER_TEMPLATE_CATEGORIES,
  getTemplateFieldKeys,
  getTemplateFieldLabel,
  getTemplateFieldKind,
  isImageFieldKeyInTemplates,
  type PosterTemplateCategory,
  type PosterTemplateDefinition,
} from '../templateTypes';
import { getPosterTemplatesForCategory, findPosterTemplateById } from '../posterTemplateList';
import { instantiateTemplate } from '../templateMerge';
import {
  wizardIdentify,
  wizardGatherFields,
  type ChatMessage,
} from '../services/posterAiApi';
import { getToken } from '../../lib/api';
import { PosterTemplateFieldsEditor } from './PosterTemplateFieldsEditor';
import { TemplateThumbnail } from './TemplateThumbnail';

type Phase =
  | 'chat'
  | 'pick_template'
  | 'gathering'
  | 'confirm'
  | 'generating';

interface BubbleMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface PosterAiWizardModalProps {
  open: boolean;
  onClose: () => void;
}

export function PosterAiWizardModal({ open, onClose }: PosterAiWizardModalProps) {
  const loadProject = usePosterStore((s) => s.loadProject);
  const remotePosterTemplates = usePosterStore((s) => s.remotePosterTemplates);
  const user = useAuthStore((s) => s.user);
  const isLoggedIn = !!getToken();

  const [phase, setPhase] = useState<Phase>('chat');
  const [bubbles, setBubbles] = useState<BubbleMsg[]>([]);
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detectedCategory, setDetectedCategory] = useState<PosterTemplateCategory | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const nextIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addBubble = useCallback((role: 'user' | 'assistant', content: string) => {
    const id = nextIdRef.current++;
    setBubbles((prev) => [...prev, { id, role, content }]);
  }, []);

  const templatesInCategory = useMemo(
    () => (detectedCategory ? getPosterTemplatesForCategory(detectedCategory) : []),
    [detectedCategory, remotePosterTemplates],
  );

  const selectedTemplate = useMemo(
    () => findPosterTemplateById(selectedTemplateId),
    [selectedTemplateId],
  );

  const selectedFieldKeys = useMemo(
    () => (selectedTemplate ? getTemplateFieldKeys(selectedTemplate) : []),
    [selectedTemplate],
  );

  const textFieldKeys = useMemo(
    () => selectedFieldKeys.filter((k) => !isImageFieldKeyInTemplates(k, selectedTemplate ? [selectedTemplate] : [])),
    [selectedFieldKeys, selectedTemplate],
  );

  const reset = useCallback(() => {
    nextIdRef.current = 0;
    setPhase('chat');
    setBubbles([]);
    setApiMessages([]);
    setInput('');
    setLoading(false);
    setError(null);
    setDetectedCategory(null);
    setSelectedTemplateId('');
    setFields({});
    setGenerating(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    const name = user?.name?.split(/\s/)[0] || 'there';
    const greeting = `Hi ${name}! I'm here to help you create something amazing. What kind of poster or flyer are you looking to build today?`;
    const id = 0;
    nextIdRef.current = 1;
    setBubbles([{ id, role: 'assistant', content: greeting }]);
  }, [open, reset, user?.name]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, phase]);

  useEffect(() => {
    if (!loading && phase !== 'confirm' && phase !== 'generating') {
      inputRef.current?.focus();
    }
  }, [loading, phase]);

  /* ── Phase: chat → identify category ── */
  const handleChatSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    addBubble('user', text);

    const newApiMsgs: ChatMessage[] = [...apiMessages, { role: 'user', content: text }];
    setApiMessages(newApiMsgs);
    setLoading(true);

    try {
      const result = await wizardIdentify({
        messages: newApiMsgs,
        categories: POSTER_TEMPLATE_CATEGORIES as unknown as { value: string; label: string }[],
      });
      const assistantMsg: ChatMessage = { role: 'assistant', content: result.message };
      setApiMessages((prev) => [...prev, assistantMsg]);
      addBubble('assistant', result.message);

      if (result.category) {
        const validCat = POSTER_TEMPLATE_CATEGORIES.find((c) => c.value === result.category);
        if (validCat) {
          setDetectedCategory(validCat.value as PosterTemplateCategory);
          setPhase('pick_template');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── Phase: pick_template → user selects, move to gathering ── */
  const handleTemplateSelect = async (tpl: PosterTemplateDefinition) => {
    setSelectedTemplateId(tpl.id);

    const keys = getTemplateFieldKeys(tpl);
    setFields(Object.fromEntries(keys.map((k) => [k, ''])));

    const userMsg = `I'd like to use the "${tpl.name}" template.`;
    addBubble('user', userMsg);

    const txtKeys = keys.filter(
      (k) => !isImageFieldKeyInTemplates(k, [tpl]),
    );
    const labels: Record<string, string> = {};
    for (const k of txtKeys) labels[k] = getTemplateFieldLabel(tpl, k);

    const msgs: ChatMessage[] = [
      ...apiMessages,
      { role: 'user', content: userMsg },
    ];
    setApiMessages(msgs);
    setLoading(true);
    setPhase('gathering');

    try {
      const result = await wizardGatherFields({
        messages: msgs,
        templateName: tpl.name,
        fieldKeys: txtKeys,
        fieldLabels: labels,
      });
      const assistantMsg: ChatMessage = { role: 'assistant', content: result.message };
      setApiMessages((prev) => [...prev, assistantMsg]);
      addBubble('assistant', result.message);

      setFields((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(result.fields)) {
          if (v) next[k] = v;
        }
        return next;
      });

      if (result.complete) {
        setPhase('confirm');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── Phase: gathering → collect info conversationally ── */
  const handleGatherSend = async () => {
    const text = input.trim();
    if (!text || loading || !selectedTemplate) return;
    setInput('');
    setError(null);
    addBubble('user', text);

    const tpl = selectedTemplate;
    const keys = textFieldKeys;
    const labels: Record<string, string> = {};
    for (const k of keys) labels[k] = getTemplateFieldLabel(tpl, k);

    const msgs: ChatMessage[] = [...apiMessages, { role: 'user', content: text }];
    setApiMessages(msgs);
    setLoading(true);

    try {
      const result = await wizardGatherFields({
        messages: msgs,
        templateName: tpl.name,
        fieldKeys: keys,
        fieldLabels: labels,
      });
      const assistantMsg: ChatMessage = { role: 'assistant', content: result.message };
      setApiMessages((prev) => [...prev, assistantMsg]);
      addBubble('assistant', result.message);

      setFields((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(result.fields)) {
          if (v) next[k] = v;
        }
        return next;
      });

      if (result.complete) {
        setPhase('confirm');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── Generate poster ── */
  const handleGenerate = async () => {
    const tpl = findPosterTemplateById(selectedTemplateId);
    if (!tpl) return;
    setGenerating(true);
    setError(null);
    try {
      const keys = getTemplateFieldKeys(tpl);
      const data: Record<string, string> = {};
      for (const k of keys) data[k] = fields[k] ?? '';
      const { project, fieldBindings } = await instantiateTemplate(tpl, data);
      loadProject(project, { fieldBindings });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate poster.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = phase === 'gathering' ? handleGatherSend : handleChatSend;

  if (!open) return null;

  const showInput = phase === 'chat' || phase === 'gathering';

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:h-auto sm:max-h-[85vh] sm:rounded-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-900/50">
              <svg className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create with AI</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {bubbles.map((b) => (
              <div
                key={b.id}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  b.role === 'user'
                    ? 'ml-auto bg-accent-600 text-white'
                    : 'mr-auto bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                }`}
              >
                {b.content}
              </div>
            ))}

            {loading && (
              <div className="mr-auto flex items-center gap-1.5 rounded-2xl bg-zinc-100 px-3.5 py-2.5 dark:bg-zinc-800">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
              </div>
            )}

            {/* Template picker inline in chat */}
            {phase === 'pick_template' && !loading && (
              <div className="mr-auto flex max-w-full flex-col gap-2">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Pick a template to get started:
                </p>
                <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/50 sm:grid-cols-2">
                  {templatesInCategory.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTemplateSelect(t)}
                      className="flex flex-col items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 text-center transition hover:border-accent-400 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-accent-500"
                    >
                      <TemplateThumbnail
                        project={t.project}
                        thumbnail={t.thumbnail}
                        width={120}
                        className="rounded"
                      />
                      <span className="line-clamp-1 text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                        {t.name}
                      </span>
                    </button>
                  ))}
                  {templatesInCategory.length === 0 && (
                    <p className="col-span-2 py-4 text-center text-xs text-zinc-400">
                      No templates found for this category yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Confirm phase: editable form */}
            {phase === 'confirm' && !loading && (
              <div className="mr-auto flex w-full max-w-full flex-col gap-3">
                <div className="rounded-2xl bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  Here's what I've gathered. Please review and edit anything, then upload images if needed. When you're happy, hit <strong>Generate Poster</strong>!
                </div>

                {selectedTemplate && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="mb-3 flex items-center gap-2">
                      <TemplateThumbnail
                        project={selectedTemplate.project}
                        thumbnail={selectedTemplate.thumbnail}
                        width={48}
                        className="rounded"
                      />
                      <div>
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{selectedTemplate.name}</p>
                        <p className="text-[10px] text-zinc-500">Selected template</p>
                      </div>
                    </div>
                    <PosterTemplateFieldsEditor
                      template={selectedTemplate}
                      fieldKeys={selectedFieldKeys}
                      fields={fields}
                      setFields={setFields}
                      onImageReadError={(msg) => setError(msg)}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full rounded-xl bg-accent-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
                >
                  {generating ? 'Generating your poster…' : 'Generate Poster'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Input bar */}
        {showInput && (
          <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-700">
            {!isLoggedIn ? (
              <p className="text-center text-xs text-zinc-500">
                Please <a href="#/login" className="text-accent-600 underline">sign in</a> to use the AI wizard.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    phase === 'gathering'
                      ? 'Provide the details for your poster…'
                      : 'Describe what you want to create…'
                  }
                  disabled={loading}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white transition-colors hover:bg-accent-500 disabled:opacity-40"
                  aria-label="Send"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                  </svg>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Back / change template in confirm phase */}
        {phase === 'confirm' && !generating && (
          <div className="flex shrink-0 justify-between border-t border-zinc-200 px-4 py-2 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setPhase('pick_template')}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← Change template
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
