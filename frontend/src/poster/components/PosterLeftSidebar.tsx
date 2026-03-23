import { useRef, useState } from 'react';
import { Textbox } from 'fabric';
import { usePosterStore } from '../store/posterStore';
import { useAuthStore } from '../../auth/authStore';
import { getFabricCanvasRef } from '../canvasRef';
import { posterShapePresetToElement } from '../posterShapePresets';
import { PosterShapesModal } from './PosterShapesModal';
import { CustomElementsModal } from './CustomElementsModal';
import type { PosterElement, PosterTextElement, PosterShapeElement } from '../types';

function layerDisplayLabel(el: PosterElement): string {
  switch (el.type) {
    case 'text': {
      const raw = (el as PosterTextElement).text?.replace(/\s+/g, ' ').trim() || 'Text';
      return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
    }
    case 'rect':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'triangle':
      return 'Triangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'polygon':
      return 'Polygon';
    case 'image':
      return 'Image';
    case '3d-text':
      return '3D Text';
    default:
      return 'Element';
  }
}

function layerKindLabel(el: PosterElement): string {
  switch (el.type) {
    case 'text':
      return 'Text';
    case 'rect':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'triangle':
      return 'Triangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'polygon':
      return 'Polygon';
    case 'image':
      return 'Image';
    case '3d-text':
      return '3D Text';
    default:
      return 'Element';
  }
}

interface PosterLeftSidebarProps {
  onOpen3DModal: (mode: 'add') => void;
}

export function PosterLeftSidebar({ onOpen3DModal }: PosterLeftSidebarProps) {
  const addElement = usePosterStore((s) => s.addElement);
  const elements = usePosterStore((s) => s.elements);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const setSelected = usePosterStore((s) => s.setSelected);
  const updateElement = usePosterStore((s) => s.updateElement);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [shapesModalOpen, setShapesModalOpen] = useState(false);
  const [customElementsModalOpen, setCustomElementsModalOpen] = useState(false);

  const layersFrontToBack = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const selectLayer = (id: string) => {
    setSelected([id]);
  };

  const tryEnterTextEdit = (id: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = getFabricCanvasRef();
        if (!canvas) return;
        const obj = canvas
          .getObjects()
          .find((o) => (o as { data?: { posterId?: string } }).data?.posterId === id);
        if (obj instanceof Textbox) {
          canvas.setActiveObject(obj);
          obj.enterEditing();
          canvas.requestRenderAll();
        }
      });
    });
  };

  const handleAddText = () => {
    addElement({
      type: 'text',
      text: 'Double-click to edit',
      fontSize: 24,
      fontFamily: 'Arial, sans-serif',
      fill: '#000000',
      left: 100,
      top: 100,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
    } as Omit<PosterTextElement, 'id' | 'zIndex'>);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') return;
      addElement({
        type: 'image',
        src: dataUrl,
        mask: 'none',
        edge: 'none',
        edgeFadeAmount: 0.4,
        edgeFadeMinOpacity: 0,
        edgeFadeDirection: 'radial',
        edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
        maskCornerRadius: 0.18,
        left: 100,
        top: 100,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
      });
    };
    reader.onerror = () => {
      console.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
    input.value = '';
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Elements
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAddText}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => setShapesModalOpen(true)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Shapes
          </button>
          <button
            type="button"
            onClick={() => setCustomElementsModalOpen(true)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Custom Elements
          </button>
        </div>
      </div>

      <CustomElementsModal
        open={customElementsModalOpen}
        onClose={() => setCustomElementsModalOpen(false)}
        onPick={(url) => {
          addElement({
            type: 'image',
            src: url,
            mask: 'none',
            edge: 'none',
            edgeFadeAmount: 0.4,
            edgeFadeMinOpacity: 0,
            edgeFadeDirection: 'radial',
            edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
            maskCornerRadius: 0.18,
            left: 100,
            top: 100,
            scaleX: 1,
            scaleY: 1,
            angle: 0,
            opacity: 1,
          });
        }}
        isAdmin={isAdmin}
      />

      <PosterShapesModal
        open={shapesModalOpen}
        onClose={() => setShapesModalOpen(false)}
        onPick={(id) => addElement(posterShapePresetToElement(id) as Omit<PosterShapeElement, 'id' | 'zIndex'>)}
      />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Layers
        </h3>
        {layersFrontToBack.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            Add an element to see it here. Click a layer to select it—even when it is hidden behind
            others on the canvas. Double-click a text layer to edit its contents.
          </p>
        ) : (
          <ul className="max-h-[min(40vh,280px)] space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-1 dark:border-zinc-700 dark:bg-zinc-800/40">
            {layersFrontToBack.map((el) => {
              const selected = selectedIds.length === 1 && selectedIds[0] === el.id;
              const locked = !!el.locked;
              return (
                <li key={el.id}>
                  <div
                    className={[
                      'flex w-full items-center gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-500/50'
                        : 'text-zinc-800 hover:bg-white hover:ring-1 hover:ring-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:ring-zinc-600',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => selectLayer(el.id)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        selectLayer(el.id);
                        if (el.type === 'text') tryEnterTextEdit(el.id);
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5"
                    >
                      <span className="w-full truncate font-medium">{layerDisplayLabel(el)}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {layerKindLabel(el)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateElement(el.id, { locked: !locked });
                      }}
                      title={locked ? 'Unlock (allow movement)' : 'Lock (prevent movement)'}
                      className={`shrink-0 rounded p-1 transition-colors ${
                        locked
                          ? 'text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/50'
                          : 'text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300'
                      }`}
                      aria-label={locked ? 'Unlock layer' : 'Lock layer'}
                    >
                      {locked ? (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Uploads
        </h3>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
        >
          Upload Image
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          3D Text
        </h3>
        <button
          onClick={() => onOpen3DModal('add')}
          className="w-full rounded-lg bg-amber-500 px-3 py-3 text-sm font-medium text-white hover:bg-amber-600"
        >
          Add 3D Text
        </button>
      </div>
    </div>
  );
}
