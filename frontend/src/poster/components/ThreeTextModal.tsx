import { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { usePosterStore } from '../store/posterStore';
import { Canvas } from '../../components/canvas/Canvas';
import { RightSidebar } from '../../components/sidebar/RightSidebar';
import { LeftSidebar } from '../../components/sidebar/LeftSidebar';
import { serializeEditorState } from '../utils/serializeEditorState';
import type { Poster3DTextElement } from '../types';

interface ThreeTextModalProps {
  mode: 'add' | { editId: string };
  onClose: () => void;
  onSendToPoster: (image: string, config: Poster3DTextElement['config']) => void;
  onEditComplete: (image: string, config: Poster3DTextElement['config']) => void;
}

export function ThreeTextModal({
  mode,
  onClose,
  onSendToPoster,
  onEditComplete,
}: ThreeTextModalProps) {
  const loadPoster3DConfig = useEditorStore((s) => s.loadPoster3DConfig);
  const renderEngine = useEditorStore((s) => s.renderEngine);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const updateElement = usePosterStore((s) => s.updateElement);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Remount WebGL after `loadPoster3DConfig` clears `webglExportAPI` so `onReady` registers export again. */
  const [canvasRemountKey, setCanvasRemountKey] = useState(0);

  useEffect(() => {
    if (mode === 'add') {
      loadPoster3DConfig({});
      setCanvasRemountKey((k) => k + 1);
      return;
    }
    if (typeof mode === 'object' && 'editId' in mode) {
      const el = usePosterStore.getState().elements.find((e) => e.id === mode.editId);
      if (el && el.type === '3d-text') {
        loadPoster3DConfig(el.config);
        setCanvasRemountKey((k) => k + 1);
      }
    }
  }, [mode, loadPoster3DConfig]);

  const handleSend = useCallback(async () => {
    setSendError(null);
    setSending(true);
    try {
      const api = useEditorStore.getState().webglExportAPI;
      if (!api) {
        setSendError('3D preview is still loading. Please wait a moment and try again.');
        return;
      }
      const HI_RES_SCALE = 4;
      const dataUrl = api.toDataURL(HI_RES_SCALE);
      if (!dataUrl) {
        setSendError('Could not export the 3D image. Please try again.');
        return;
      }
      const config = serializeEditorState();
      if (mode === 'add') {
        onSendToPoster(dataUrl, config);
      } else {
        updateElement(mode.editId, { image: dataUrl, config });
        onEditComplete(dataUrl, config);
      }
    } catch {
      setSendError('Failed to send 3D text to poster. Please try again.');
    } finally {
      setSending(false);
    }
  }, [mode, onSendToPoster, onEditComplete, updateElement]);

  useEffect(() => {
    if (renderEngine !== 'webgl') {
      useEditorStore.getState().setState({ renderEngine: 'webgl' });
    }
  }, [renderEngine]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isTypingTarget =
        target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isTypingTarget) return;
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (!ctrlOrMeta) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">
          {mode === 'add' ? 'Create 3D Text' : 'Edit 3D Text'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleSend}
            disabled={sending}
            className="rounded bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {mode === 'add' ? (sending ? 'Sending…' : 'Send to Poster') : (sending ? 'Updating…' : 'Update')}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-zinc-200 px-4 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </header>
      {sendError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {sendError}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
          <LeftSidebar force3dLayerUI onPosterEditorClick={onClose} />
        </aside>
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-zinc-100 p-4 dark:bg-zinc-950">
          <div className="h-full max-h-[70vh] w-full max-w-2xl">
            <Canvas key={canvasRemountKey} forceMultiLayer orbitZoomScale={1.5} />
          </div>
        </main>
        <aside className="flex w-60 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto">
          <RightSidebar force3dLayerUI />
        </aside>
      </div>
    </div>
  );
}
