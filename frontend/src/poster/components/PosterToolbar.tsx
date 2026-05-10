import { memo } from 'react';
import { usePosterStore } from '../store/posterStore';
import type { PosterTool } from '../store/posterStore';

interface ToolButton {
  id: PosterTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: ToolButton[] = [
  {
    id: 'select',
    label: 'Move Tool',
    shortcut: 'V',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 3l14 9-7 2 7 7-3 1-6-7-5 6V3z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'direct',
    label: 'Direct Selection',
    shortcut: 'A',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 3l14 9-7 2 7 7-3 1-6-7-5 6V3z" />
      </svg>
    ),
  },
  {
    id: 'pen',
    label: 'Pen Tool',
    shortcut: 'P',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l5 5" />
      </svg>
    ),
  },
  {
    id: 'text',
    label: 'Text Tool',
    shortcut: 'T',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
      </svg>
    ),
  },
  {
    id: 'shape',
    label: 'Rectangle Tool',
    shortcut: 'U',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
];

export const PosterToolbar = memo(function PosterToolbar() {
  const activeTool = usePosterStore((s) => s.activeTool);
  const setActiveTool = usePosterStore((s) => s.setActiveTool);

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl backdrop-blur-md">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => setActiveTool(tool.id)}
          className={`group relative flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
            activeTool === tool.id
              ? 'bg-accent-600 text-white shadow-inner'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
          title={`${tool.label} (${tool.shortcut})`}
        >
          {tool.icon}

          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 text-white text-[11px] rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            {tool.label} <span className="text-zinc-400 ml-1">{tool.shortcut}</span>
          </div>
        </button>
      ))}
    </div>
  );
});
