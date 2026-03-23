import { memo, useState, useEffect } from 'react';
import type { EditorState } from '../../core/types';
import { useEditorStore } from '../../store/editorStore';
import { PRESETS } from '../../data/presets';
import { generateStyleFromPrompt, adjustStyleFromPrompt, getAiUsage } from '../../services/threeTextAiApi';
import { getToken } from '../../lib/api';
import { ThemeToggle } from '../ThemeToggle';
import { UserMenu } from '../../auth/UserMenu';

export const LeftSidebar = memo(function LeftSidebar() {
  const setState = useEditorStore((s) => s.setState);
  const [aiPrompt, setAiPrompt] = useState('');
  const [adjustPrompt, setAdjustPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ tokensUsed: number; limit: number | null; remaining: number | null } | null>(null);

  const isLoggedIn = !!getToken();

  useEffect(() => {
    if (isLoggedIn) {
      getAiUsage()
        .then((u) => (u ? setUsage(u) : null))
        .catch(() => setUsage(null));
    } else {
      setUsage(null);
    }
  }, [isLoggedIn]);

  const handlePresetClick = (presetState: Partial<EditorState>) => {
    setState(presetState);
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateStyleFromPrompt(aiPrompt.trim());
      if (result) setState(result);
      const u = await getAiUsage();
      if (u) setUsage(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate style');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustPrompt.trim()) return;
    setIsAdjusting(true);
    setError(null);
    try {
      const s = useEditorStore.getState();
      const currentSummary: Partial<EditorState> = {
        frontColor: s.frontColor,
        extrusionColor: s.extrusionColor,
        extrusionGlass: s.extrusionGlass,
        metalness: s.metalness,
        roughness: s.roughness,
        lighting: s.lighting,
        extrusionLighting: s.extrusionLighting,
        extrusion: s.extrusion,
      };
      const result = await adjustStyleFromPrompt(adjustPrompt.trim(), currentSummary);
      if (result) setState(result);
      const u = await getAiUsage();
      if (u) setUsage(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust');
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <a
        href="/poster"
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
      >
        Poster Editor →
      </a>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <UserMenu compact />
          <ThemeToggle />
        </div>
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Presets
        </h2>
        <select
          value=""
          onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            const preset = PRESETS.find((p) => p.name === name);
            if (preset) handlePresetClick(preset.state);
            e.target.value = '';
          }}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium transition-colors hover:border-zinc-300 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
        >
          <option value="">Choose a preset…</option>
          {PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </section>

      <section className="flex-1">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          AI Generator
        </h2>
        {!isLoggedIn && (
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Sign in to use AI style generation.
          </p>
        )}
        {usage && usage.limit != null && (
          <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            {usage.tokensUsed.toLocaleString()} / {usage.limit.toLocaleString()} tokens used
          </p>
        )}
        {usage && usage.limit == null && (
          <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            {usage.tokensUsed.toLocaleString()} tokens used (Pro: unlimited)
          </p>
        )}
        <div className="flex flex-col gap-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. matte black with silver edge, rose gold, glossy glass"
            rows={3}
            className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            disabled={isLoading || !isLoggedIn}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || !aiPrompt.trim() || !isLoggedIn}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
          >
            {isLoading ? 'Generating...' : 'Generate Style'}
          </button>
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Adjust current style
          </h3>
          <input
            type="text"
            value={adjustPrompt}
            onChange={(e) => setAdjustPrompt(e.target.value)}
            placeholder="e.g. make it warmer, more reflective"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            disabled={isAdjusting || isLoading || !isLoggedIn}
          />
          <button
            type="button"
            onClick={handleAdjust}
            disabled={isAdjusting || isLoading || !adjustPrompt.trim() || !isLoggedIn}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:border-zinc-600"
          >
            {isAdjusting ? 'Adjusting...' : 'Adjust'}
          </button>
        </div>
      </section>
    </div>
  );
});
