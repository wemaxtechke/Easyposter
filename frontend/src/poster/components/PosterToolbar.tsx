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
    label: 'Selection Tool',
    shortcut: 'V',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M7 2l12 11.2-5.8.8 3.3 6.7-2.2 1.1-3.4-6.6L7 19z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'direct',
    label: 'Direct Selection',
    shortcut: 'A',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M7 2l12 11.2-5.8.8 3.3 6.7-2.2 1.1-3.4-6.6L7 19z" fill="none" stroke="currentColor" strokeWidth="1.5" />
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
        <rect x="4" y="4" width="16" height="16" />
      </svg>
    ),
  },
  {
    id: 'object-selection',
    label: 'Object Selection',
    shortcut: 'W',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
];

export const PosterToolbar = memo(function PosterToolbar() {
  const activeTool = usePosterStore((s) => s.activeTool);
  const setActiveTool = usePosterStore((s) => s.setActiveTool);
  const objectSelectionMode = usePosterStore((s) => s.objectSelectionMode);
  const setObjectSelectionMode = usePosterStore((s) => s.setObjectSelectionMode);
  const setPathEditTargetId = usePosterStore((s) => s.setPathEditTargetId);
  const setMarqueePath = usePosterStore((s) => s.setMarqueePath);

  const handleToolClick = (toolId: PosterTool) => {
    setActiveTool(toolId);
    if (toolId !== 'direct') {
      setPathEditTargetId(null);
    }
    // Only clear marquee when switching away from BOTH object-selection and direct
    if (toolId !== 'object-selection' && toolId !== 'direct') {
      setMarqueePath(null);
    }
  };

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl backdrop-blur-md">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => handleToolClick(tool.id)}
          className={`group relative flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
            activeTool === tool.id
              ? 'bg-[#1b7340] text-white shadow-inner'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
          title={`${tool.label} (${tool.shortcut})`}
        >
          {tool.icon}

          {/* Sub-menu for Object Selection */}
          {tool.id === 'object-selection' && activeTool === 'object-selection' && (
            <div className="absolute right-full mr-4 flex gap-1 p-1 bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg backdrop-blur-sm">
              {(['rectangle', 'lasso', 'magnetic', 'ai'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setObjectSelectionMode(mode);
                  }}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded ${
                    objectSelectionMode === mode
                      ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {mode}
                </button>
              ))}
              <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 self-center" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  usePosterStore.getState().invertSelection();
                }}
                className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
              >
                Invert
              </button>
            </div>
          )}

          {/* Tooltip */}
          <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-900 text-white text-[11px] rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 flex items-center">
            {tool.label} <span className="text-zinc-400 ml-2 bg-zinc-800 px-1 rounded">{tool.shortcut}</span>
          </div>
        </button>
      ))}
    </div>
  );
});
