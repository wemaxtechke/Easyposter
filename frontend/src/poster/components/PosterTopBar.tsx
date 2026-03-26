import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../../components/ThemeToggle';
import { UserMenu } from '../../auth/UserMenu';
import { usePosterStore } from '../store/posterStore';
import { getFabricCanvasRef } from '../canvasRef';
import { isSolidBackground, canvasBackgroundToCanvas2D } from '../types';
// Cloud save is handled by PosterLayout (Save button).

interface PosterTopBarProps {
  readOnly?: boolean;
  onOpenCanvasSize?: () => void;
  onOpenAiWizard?: () => void;
  /** Open AI chat panel for poster editing. */
  onOpenAiChat?: () => void;
  /** Enter canvas-first template labeling (banner + per-layer modals). */
  onBeginTemplateAuthoring?: () => void;
  /** Disable "Save as template" while labeling. */
  templateAuthoringActive?: boolean;
  /** Save project to cloud (when logged in). */
  onSaveToCloud?: () => void;
  /** True when there are unsaved changes since last cloud save. */
  cloudDirty?: boolean;
  /** True while save-to-cloud is in progress. */
  savingToCloud?: boolean;
}

export function PosterTopBar({
  readOnly = false,
  onOpenCanvasSize,
  onOpenAiWizard,
  onOpenAiChat,
  onBeginTemplateAuthoring,
  templateAuthoringActive = false,
  onSaveToCloud,
  cloudDirty = false,
  savingToCloud = false,
}: PosterTopBarProps = {}) {
  const navigate = useNavigate();
  const undo = usePosterStore((s) => s.undo);
  const redo = usePosterStore((s) => s.redo);
  const history = usePosterStore((s) => s.history);
  const historyIndex = usePosterStore((s) => s.historyIndex);
  const getProject = usePosterStore((s) => s.getProject);
  const loadProject = usePosterStore((s) => s.loadProject);
  const canvasWidth = usePosterStore((s) => s.canvasWidth);
  const canvasHeight = usePosterStore((s) => s.canvasHeight);
  const canvasBackground = usePosterStore((s) => s.canvasBackground);
  const canvasZoom = usePosterStore((s) => s.canvasZoom);
  const setCanvasZoom = usePosterStore((s) => s.setCanvasZoom);
  const setCanvasZoomFit = usePosterStore((s) => s.setCanvasZoomFit);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const fabricCanvas = getFabricCanvasRef();
      if (!fabricCanvas) return;
      const scale = 2;
      const w = canvasWidth * scale;
      const h = canvasHeight * scale;

      if (isSolidBackground(canvasBackground)) {
        const dataUrl = fabricCanvas.toDataURL({
          format: 'png',
          multiplier: scale,
          quality: 1,
        });
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `poster-${Date.now()}.png`;
        a.click();
        return;
      }

      const fabricDataUrl = fabricCanvas.toDataURL({
        format: 'png',
        multiplier: scale,
        quality: 1,
      });
      const temp = document.createElement('canvas');
      temp.width = w;
      temp.height = h;
      const ctx = temp.getContext('2d');
      if (!ctx) return;
      canvasBackgroundToCanvas2D(ctx, canvasBackground, w, h);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          resolve();
        };
        img.onerror = reject;
        img.src = fabricDataUrl;
      });
      const a = document.createElement('a');
      a.href = temp.toDataURL('image/png');
      a.download = `poster-${Date.now()}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  }, [canvasWidth, canvasHeight, canvasBackground]);

  const handleSave = useCallback(() => {
    const project = getProject();
    const json = JSON.stringify(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poster-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getProject]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const project = JSON.parse(reader.result as string);
          loadProject(project);
        } catch (err) {
          console.error('Failed to load project', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadProject]);

  const handleNewProject = useCallback(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('poster_edit_my_project_id');
    }
    loadProject({
      elements: [],
      canvasWidth: 800,
      canvasHeight: 600,
      canvasBackground: { type: 'solid', color: '#ffffff' },
    });
  }, [loadProject]);

  const guard = useCallback(
    (fn: () => void) => () => {
      if (readOnly) {
        navigate('/login');
        return;
      }
      fn();
    },
    [readOnly, navigate]
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        to="/3d"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 3D Text
      </Link>
      <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
      <button
        onClick={guard(undo)}
        disabled={!canUndo}
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Undo"
      >
        Undo
      </button>
      <button
        onClick={guard(redo)}
        disabled={!canRedo}
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Redo"
      >
        Redo
      </button>
      <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
      <button
        onClick={guard(handleSave)}
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Download as JSON file"
      >
        Download JSON
      </button>
      <button
        onClick={guard(handleLoad)}
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        Load JSON
      </button>
      <button
        onClick={guard(handleNewProject)}
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Start a new blank project"
      >
        New project
      </button>
      {onSaveToCloud && (
        <button
          type="button"
          onClick={onSaveToCloud}
          disabled={savingToCloud}
          className={`rounded px-2 py-1 text-sm font-medium ${
            cloudDirty
              ? 'bg-accent-600 text-white hover:bg-accent-500'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          } disabled:opacity-50`}
          title={cloudDirty ? 'Save your work to the cloud' : 'Saved to cloud'}
        >
          {savingToCloud ? 'Saving…' : cloudDirty ? 'Save' : 'Saved'}
        </button>
      )}
      {onOpenAiWizard && (
        <button
          type="button"
          onClick={guard(onOpenAiWizard)}
          className="rounded px-2 py-1 text-sm font-medium text-accent-600 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/50"
        >
          Create with AI
        </button>
      )}
      {onOpenAiChat && (
        <button
          type="button"
          onClick={guard(onOpenAiChat)}
          className="rounded px-2 py-1 text-sm font-medium text-accent-600 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/50"
          title="Edit poster with AI"
        >
          AI Assistant
        </button>
      )}
      <Link
        to="/poster/templates"
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Cloud template library"
      >
        Poster templates
      </Link>
      <Link
        to="/poster/my"
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Your saved posters"
      >
        My stuff
      </Link>
      {onBeginTemplateAuthoring && (
        <button
          type="button"
          onClick={guard(onBeginTemplateAuthoring)}
          disabled={templateAuthoringActive}
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title={
            templateAuthoringActive
              ? 'Finish or cancel template labeling first'
              : 'Label text layers on the canvas, then save as a reusable template (this browser)'
          }
        >
          Save as template
        </button>
      )}
      {onOpenCanvasSize && (
        <button
          onClick={guard(onOpenCanvasSize)}
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Change canvas size"
        >
          <span className="font-mono text-xs">{canvasWidth} × {canvasHeight}</span>
        </button>
      )}
      <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCanvasZoom(canvasZoom - 0.25)}
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={setCanvasZoomFit}
          className="min-w-[4rem] rounded px-2 py-1 text-center font-mono text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Fit to view"
        >
          {canvasZoom === 1 ? 'Fit' : `${Math.round(canvasZoom * 100)}%`}
        </button>
        <button
          onClick={() => setCanvasZoom(canvasZoom + 0.25)}
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Zoom in"
        >
          +
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <UserMenu />
        <ThemeToggle size="md" />
        <button
          onClick={guard(handleExport)}
          disabled={exporting}
          className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>
    </header>
  );
}
