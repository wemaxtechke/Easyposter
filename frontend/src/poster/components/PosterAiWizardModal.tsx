import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePosterStore } from '../store/posterStore';
import {
  POSTER_TEMPLATE_CATEGORIES,
  DEFAULT_POSTER_PLACEHOLDER_KEYS,
  getTemplateFieldKeys,
  isImageFieldKeyInTemplates,
  unionTemplateFieldKeys,
  type PosterTemplateCategory,
} from '../templateTypes';
import { getPosterTemplatesForCategory, findPosterTemplateById } from '../posterTemplateList';
import { instantiateTemplate } from '../templateMerge';
import { suggestPosterFields } from '../services/posterAiApi';
import { getToken } from '../../lib/api';
import { PosterTemplateFieldsEditor } from './PosterTemplateFieldsEditor';
import { TemplateThumbnail } from './TemplateThumbnail';

interface PosterAiWizardModalProps {
  open: boolean;
  onClose: () => void;
}

export function PosterAiWizardModal({ open, onClose }: PosterAiWizardModalProps) {
  const loadProject = usePosterStore((s) => s.loadProject);
  const remotePosterTemplates = usePosterStore((s) => s.remotePosterTemplates);

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<PosterTemplateCategory>('general');
  const [description, setDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(DEFAULT_POSTER_PLACEHOLDER_KEYS.map((k) => [k, '']))
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiFilledSuccess, setAiFilledSuccess] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const isLoggedIn = !!getToken();

  const templatesInCategory = useMemo(
    () => getPosterTemplatesForCategory(category),
    [category, remotePosterTemplates]
  );

  const categoryFieldKeys = useMemo(
    () => unionTemplateFieldKeys(templatesInCategory),
    [templatesInCategory]
  );

  /** Image slots are filled by upload/URL, not the text AI. */
  const categoryFieldKeysForAi = useMemo(
    () => categoryFieldKeys.filter((k) => !isImageFieldKeyInTemplates(k, templatesInCategory)),
    [categoryFieldKeys, templatesInCategory]
  );

  const selectedTemplate = useMemo(
    () => findPosterTemplateById(selectedTemplateId),
    [selectedTemplateId]
  );

  const step2FieldKeys = useMemo(
    () => (selectedTemplate ? getTemplateFieldKeys(selectedTemplate) : categoryFieldKeys),
    [selectedTemplate, categoryFieldKeys]
  );

  const emptyFieldsForKeys = useCallback((keys: string[]) => {
    return Object.fromEntries(keys.map((k) => [k, '']));
  }, []);

  const reset = useCallback(() => {
    setStep(0);
    setCategory('general');
    setDescription('');
    setSelectedTemplateId('');
    setFields(emptyFieldsForKeys([...DEFAULT_POSTER_PLACEHOLDER_KEYS]));
    setAiLoading(false);
    setGenerating(false);
    setAiFilledSuccess(false);
    setAiError(null);
  }, [emptyFieldsForKeys]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || step !== 1) return;
    if (selectedTemplateId) return;
    const first = templatesInCategory[0]?.id;
    if (first) setSelectedTemplateId(first);
  }, [open, step, selectedTemplateId, templatesInCategory]);

  /** When category or templates change on step 1+, align field map keys with the union for this category. */
  useEffect(() => {
    if (!open || step < 1) return;
    setFields((prev) => {
      const next: Record<string, string> = {};
      for (const k of categoryFieldKeys) next[k] = prev[k] ?? '';
      return next;
    });
  }, [open, step, category, categoryFieldKeys]);

  const handleFillWithAi = async () => {
    setAiError(null);
    if (!isLoggedIn) {
      setAiError('Sign in to use AI field filling.');
      return;
    }
    if (!description.trim()) {
      setAiError('Please describe your event or poster first.');
      return;
    }
    if (templatesInCategory.length === 0) {
      setAiError('No templates available.');
      return;
    }
    if (!selectedTemplateId) {
      setAiError('Please select a template first.');
      return;
    }
    setAiLoading(true);
    try {
      const summaries = templatesInCategory.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
      }));
      const result = await suggestPosterFields({
        category,
        userDescription: description.trim(),
        templateSummaries: summaries,
        fieldKeys: categoryFieldKeysForAi,
      });
      const { templateId, ...rest } = result;
      setSelectedTemplateId(templateId);
      setFields((prev) => {
        const next = { ...prev };
        for (const k of categoryFieldKeysForAi) {
          if (rest[k] !== undefined) next[k] = rest[k];
        }
        return next;
      });
      setAiFilledSuccess(true);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerate = async () => {
    const tpl = findPosterTemplateById(selectedTemplateId);
    if (!tpl) {
      setAiError('Select a template.');
      return;
    }
    setGenerating(true);
    setAiError(null);
    try {
      const keys = getTemplateFieldKeys(tpl);
      const data: Record<string, string> = {};
      for (const k of keys) {
        data[k] = fields[k] ?? '';
      }
      const { project, fieldBindings } = await instantiateTemplate(tpl, data);
      loadProject(project, { fieldBindings });
      onClose();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate poster.');
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-labelledby="poster-ai-title"
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 id="poster-ai-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Create poster with AI
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Step {step + 1} of 3 — templates use placeholders; edit everything in the canvas after.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">What kind of poster?</p>
              <div className="flex flex-col gap-2">
                {POSTER_TEMPLATE_CATEGORIES.map((c) => (
                  <label
                    key={c.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-600"
                  >
                    <input
                      type="radio"
                      name="poster-cat"
                      value={c.value}
                      checked={category === c.value}
                      onChange={() => setCategory(c.value)}
                    />
                    <span className="text-sm">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Describe your event or announcement
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setAiFilledSuccess(false);
                  }}
                  rows={5}
                  placeholder="e.g. Annual youth conference March 15 at City Hall, hosted by Pastor Jane, keynote Dr. Smith on the theme Rise Up…"
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Select a template</label>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/50 sm:grid-cols-2">
                  {templatesInCategory.map((t) => {
                    const selected = t.id === selectedTemplateId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTemplateId(t.id);
                          setAiFilledSuccess(false);
                        }}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition ${
                          selected
                            ? 'border-gold-500 bg-gold-50 ring-1 ring-gold-500 dark:border-gold-400 dark:bg-gold-950/30 dark:ring-gold-400'
                            : 'border-zinc-200 bg-white hover:border-gold-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-gold-600'
                        }`}
                      >
                        <TemplateThumbnail
                          project={t.project}
                          thumbnail={t.thumbnail}
                          width={140}
                          className="rounded"
                        />
                        <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
                {templatesInCategory.find((t) => t.id === selectedTemplateId)?.description && (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {templatesInCategory.find((t) => t.id === selectedTemplateId)?.description}
                  </p>
                )}
              </div>
              {!isLoggedIn && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sign in to use AI to fill fields from your description.
                </p>
              )}
              <button
                type="button"
                onClick={handleFillWithAi}
                disabled={
                  aiLoading ||
                  aiFilledSuccess ||
                  !isLoggedIn ||
                  !selectedTemplateId ||
                  !description.trim()
                }
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  aiFilledSuccess
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-50'
                }`}
              >
                {aiLoading
                  ? 'Filling details…'
                  : aiFilledSuccess
                    ? '✓ Filled successfully'
                    : 'Fill fields with AI'}
              </button>
              {aiError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {aiError}
                  {aiError.includes('limit') && (
                    <span className="mt-1 block text-xs">Upgrade to Pro for more tokens.</span>
                  )}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Fill text and image fields, then generate your poster.
              </p>
              <PosterTemplateFieldsEditor
                template={selectedTemplate}
                fieldKeys={step2FieldKeys}
                fields={fields}
                setFields={setFields}
                onImageReadError={(msg) => setAiError(msg)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
            className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-2">
            {step < 2 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
              >
                Next
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {generating ? 'Generating…' : 'Generate poster'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
