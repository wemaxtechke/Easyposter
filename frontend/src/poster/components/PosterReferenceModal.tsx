import { useEffect, useRef, useState } from 'react';
import { usePosterStore } from '../store/posterStore';
import { createPosterFromReferenceImage } from '../services/fromReferenceDesignApi';

interface PosterReferenceModalProps {
  open: boolean;
  onClose: () => void;
}

export function PosterReferenceModal({ open, onClose }: PosterReferenceModalProps) {
  const loadProject = usePosterStore((s) => s.loadProject);
  const [file, setFile] = useState<File | null>(null);
  const [reviewPasses, setReviewPasses] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setReviewPasses(1);
      setLoading(false);
      setStatus(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!file || loading) return;
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const { project } = await createPosterFromReferenceImage(file, setStatus, reviewPasses);
      loadProject(project);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poster from reference');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create from Reference</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Upload a poster image and let AI rebuild it as a fresh editable project.
            </p>
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

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Reference image</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  The AI will preserve layout, text blocks, and use placeholders for unreconstructable images.
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-accent-500 px-3 py-2 text-sm font-medium text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"
              >
                Choose image
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                setError(null);
                setStatus(null);
              }}
            />
            <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              {file ? (
                <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                  {file.name}
                </span>
              ) : (
                'No file selected'
              )}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">Review passes</span>
            <select
              value={reviewPasses}
              onChange={(e) => setReviewPasses(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value={0}>0 - Fast single pass</option>
              <option value={1}>1 - Balanced</option>
              <option value={2}>2 - Highest fidelity</option>
            </select>
          </label>

          <div className="rounded-xl bg-zinc-100 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            The AI will look at its draft again after it generates it, then refine the layout using a visual preview.
          </div>

          {status && <div className="text-sm text-accent-700 dark:text-accent-300">{status}</div>}
          {error && <div className="text-sm text-red-600 dark:text-red-300">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!file || loading}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Poster'}
          </button>
        </div>
      </div>
    </div>
  );
}