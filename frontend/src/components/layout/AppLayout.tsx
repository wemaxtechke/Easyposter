import { useEffect, useState } from 'react';
import { LeftSidebar } from '../sidebar/LeftSidebar';
import { RightSidebar } from '../sidebar/RightSidebar';
import { Canvas } from '../canvas/Canvas';
import { useEditorStore } from '../../store/editorStore';

export function AppLayout() {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setLeftOpen(e.matches);
      setRightOpen(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar with sidebar toggles on mobile/tablet */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900 lg:hidden">
        <button
          type="button"
          onClick={() => setLeftOpen((v) => !v)}
          className={`rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${leftOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
          title="Toggle left panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">3D Text Editor</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setRightOpen((v) => !v)}
          className={`rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${rightOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
          title="Toggle right panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>

      {/* Mobile backdrop */}
      {(leftOpen || rightOpen) && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => { setLeftOpen(false); setRightOpen(false); }}
        />
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside
          className={[
            'flex flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out',
            'lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-60 lg:min-w-[200px] lg:shrink-0 lg:translate-x-0 lg:transition-none',
            leftOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <LeftSidebar />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <Canvas />
        </main>

        {/* Right sidebar */}
        <aside
          className={[
            'flex flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'fixed inset-y-0 right-0 z-40 w-72 transition-transform duration-300 ease-in-out',
            'lg:relative lg:inset-y-auto lg:right-auto lg:z-auto lg:w-60 lg:min-w-[200px] lg:shrink-0 lg:translate-x-0 lg:transition-none',
            rightOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
        >
          <RightSidebar />
        </aside>
      </div>
    </div>
  );
}
