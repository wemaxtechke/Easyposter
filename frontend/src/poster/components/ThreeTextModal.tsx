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
  const setState = useEditorStore((s) => s.setState);
  const webglExportAPI = useEditorStore((s) => s.webglExportAPI);
  const renderEngine = useEditorStore((s) => s.renderEngine);
  const elements = usePosterStore((s) => s.elements);
  const updateElement = usePosterStore((s) => s.updateElement);

  const [sending, setSending] = useState(false);

  // Load config when editing
  useEffect(() => {
    if (mode !== 'add' && typeof mode === 'object') {
      const el = elements.find((e) => e.id === mode.editId);
      if (el && el.type === '3d-text') {
        setState(el.config);
      }
    }
  }, [mode, elements, setState]);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      if (renderEngine !== 'webgl' || !webglExportAPI) return;
      const HI_RES_SCALE = 4;
      const dataUrl = webglExportAPI.toDataURL(HI_RES_SCALE);
      const config = serializeEditorState();
      if (mode === 'add') {
        onSendToPoster(dataUrl, config);
      } else {
        updateElement(mode.editId, { image: dataUrl, config });
        onEditComplete(dataUrl, config);
      }
    } finally {
      setSending(false);
    }
  }, [renderEngine, webglExportAPI, mode, onSendToPoster, onEditComplete, updateElement]);

  useEffect(() => {
    if (renderEngine !== 'webgl') {
      useEditorStore.getState().setState({ renderEngine: 'webgl' });
    }
  }, [renderEngine]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">
          {mode === 'add' ? 'Create 3D Text' : 'Edit 3D Text'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleSend}
            disabled={sending || !webglExportAPI}
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
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
          <LeftSidebar />
        </aside>
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-zinc-100 p-4 dark:bg-zinc-950">
          <div className="h-full max-h-[70vh] w-full max-w-2xl">
            <Canvas />
          </div>
        </main>
        <aside className="flex w-60 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto">
          <RightSidebar />
        </aside>
      </div>
    </div>
  );
}
