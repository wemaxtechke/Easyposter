import { memo } from 'react';
import { usePosterStore } from '../store/posterStore';
import { useMagicLayerStore } from '../store/magicLayerStore';
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
  {
    id: 'blur-brush',
    label: 'Blur Brush',
    shortcut: 'B',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" strokeDasharray="2 4" />
        <path d="M12 7v10M7 12h10" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'hand',
    label: 'Hand Tool',
    shortcut: 'H',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v10" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.82-2.82L7 15" />
      </svg>
    ),
  },
];

const BrushControls = () => {
  const { brushSettings, setBrushSettings, activeMagicLayerId, setBlurAmount, magicLayers } = useMagicLayerStore();
  const activeLayer = magicLayers.find(l => l.id === activeMagicLayerId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Size</label>
          <span className="text-[10px] font-mono text-zinc-400">{brushSettings.radius}px</span>
        </div>
        <input
          type="range"
          min="1"
          max="200"
          value={brushSettings.radius}
          onChange={(e) => setBrushSettings({ radius: parseInt(e.target.value) })}
          className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#1b7340]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Hardness</label>
          <span className="text-[10px] font-mono text-zinc-400">{Math.round(brushSettings.hardness * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={brushSettings.hardness * 100}
          onChange={(e) => setBrushSettings({ hardness: parseInt(e.target.value) / 100 })}
          className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#1b7340]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Blur</label>
          <span className="text-[10px] font-mono text-zinc-400">{brushSettings.blurAmount}px</span>
        </div>
        <input
          type="range"
          min="1"
          max="50"
          value={brushSettings.blurAmount}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setBrushSettings({ blurAmount: val });
            if (activeMagicLayerId && activeLayer?.isBlurLayer) {
              setBlurAmount(activeMagicLayerId, val);
            }
          }}
          className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#1b7340]"
        />
      </div>

      <div className="flex gap-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setBrushSettings({ mode: 'add' })}
          className={`flex-1 py-1 text-[9px] uppercase font-bold rounded ${brushSettings.mode === 'add' ? 'bg-[#1b7340] text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
        >
          Paint
        </button>
        <button
          onClick={() => setBrushSettings({ mode: 'subtract' })}
          className={`flex-1 py-1 text-[9px] uppercase font-bold rounded ${brushSettings.mode === 'subtract' ? 'bg-[#1b7340] text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
        >
          Erase
        </button>
      </div>
    </div>
  );
};

export const PosterToolbar = memo(function PosterToolbar() {
  const activeTool = usePosterStore((s) => s.activeTool);
  const setActiveTool = usePosterStore((s) => s.setActiveTool);
  const objectSelectionMode = usePosterStore((s) => s.objectSelectionMode);
  const setObjectSelectionMode = usePosterStore((s) => s.setObjectSelectionMode);

  const handleToolClick = (toolId: PosterTool) => {
    setActiveTool(toolId);
  };

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+3.75rem)] left-1/2 -translate-x-1/2 z-40 flex flex-row lg:absolute lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:flex-col gap-1 p-1 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl backdrop-blur-md">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => handleToolClick(tool.id)}
          className={`group relative flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-md transition-colors ${
            activeTool === tool.id
              ? 'bg-[#1b7340] text-white shadow-inner'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
          title={`${tool.label} (${tool.shortcut})`}
        >
          {tool.icon}

          {/* Sub-menu for Object Selection */}
          {tool.id === 'object-selection' && activeTool === 'object-selection' && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 lg:bottom-auto lg:top-0 lg:mb-0 lg:right-full lg:mr-4 lg:left-auto lg:translate-x-0 flex flex-wrap justify-center items-center w-max max-w-[calc(100vw-2rem)] gap-1 p-1 bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg backdrop-blur-sm z-50">
              {(['rectangle', 'lasso', 'magnetic', 'ai'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setObjectSelectionMode(mode);
                  }}
                  className={`px-1.5 py-1 sm:px-2 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold rounded ${
                    objectSelectionMode === mode
                      ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          {/* Sub-menu for Blur Brush */}
          {tool.id === 'blur-brush' && activeTool === 'blur-brush' && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 lg:bottom-auto lg:top-0 lg:mb-0 lg:right-full lg:mr-4 lg:left-auto lg:translate-x-0 flex flex-col gap-2 p-3 bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg backdrop-blur-sm z-50 w-48">
              <BrushControls />
            </div>
          )}

          {/* Tooltip */}
          <div className="hidden lg:flex absolute right-full mr-2 px-2 py-1 bg-zinc-900 text-white text-[11px] rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 items-center">
            {tool.label} <span className="text-zinc-400 ml-2 bg-zinc-800 px-1 rounded">{tool.shortcut}</span>
          </div>
        </button>
      ))}
    </div>
  );
});
