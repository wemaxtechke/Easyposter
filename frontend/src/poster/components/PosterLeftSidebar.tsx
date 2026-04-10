import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Textbox } from 'fabric';
import { usePosterStore } from '../store/posterStore';
import { useAuthStore } from '../../auth/authStore';
import { getFabricCanvasRef } from '../canvasRef';
import { posterShapePresetToElement } from '../posterShapePresets';
import { removeBackgroundFromFilePreservingDisplay } from '../services/removeBackgroundApi';
import { recreateDesignFromImage } from '../services/recreateDesignApi';
import { PosterShapesModal } from './PosterShapesModal';
import { CustomElementsModal } from './CustomElementsModal';
import type { PosterElement, PosterImageElement, PosterTextElement, PosterShapeElement } from '../types';

/** Payload for `addElement` when creating an image layer (union `Omit<PosterElement,…>` rejects `src` in literals). */
type NewPosterImagePayload = Omit<PosterImageElement, 'id' | 'zIndex'>;

function reorderIndexMove<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...arr];
  const next = [...arr];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

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
      return 'Image';
    default:
      return 'Element';
  }
}

interface PosterLeftSidebarProps {
  readOnly?: boolean;
  onOpen3DModal?: (mode: 'add') => void;
}

export function PosterLeftSidebar({ readOnly = false, onOpen3DModal }: PosterLeftSidebarProps) {
  const navigate = useNavigate();
  const addElement = usePosterStore((s) => s.addElement);
  const elements = usePosterStore((s) => s.elements);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const setSelected = usePosterStore((s) => s.setSelected);
  const reorderLayersFrontToBack = usePosterStore((s) => s.reorderLayersFrontToBack);
  const updateElement = usePosterStore((s) => s.updateElement);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [shapesModalOpen, setShapesModalOpen] = useState(false);
  const [customElementsModalOpen, setCustomElementsModalOpen] = useState(false);
  const [removeBgOnUpload, setRemoveBgOnUpload] = useState(false);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const recreateInputRef = useRef<HTMLInputElement>(null);
  const [recreateStatus, setRecreateStatus] = useState<string | null>(null);
  const [layerDragFromIndex, setLayerDragFromIndex] = useState<number | null>(null);
  const [layerDragOverIndex, setLayerDragOverIndex] = useState<number | null>(null);

  const handleRecreateUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      setRecreateStatus('Analyzing design…');
      const { project } = await recreateDesignFromImage(file, setRecreateStatus);
      usePosterStore.getState().loadProject(project);
      setRecreateStatus(null);
    } catch (err) {
      setRecreateStatus(null);
      alert(err instanceof Error ? err.message : 'Failed to recreate design');
    }
  }, []);

  const layersFrontToBack = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const selectLayer = (id: string, additive: boolean) => {
    if (additive) {
      const cur = usePosterStore.getState().selectedIds;
      if (cur.includes(id)) {
        setSelected(cur.filter((x) => x !== id));
      } else {
        setSelected([...cur, id]);
      }
    } else {
      setSelected([id]);
    }
  };

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

  const tryEnterTextEdit = (id: string) => {
    if (readOnly) {
      navigate('/login');
      return;
    }
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

  const newImageDefaults = (): Omit<PosterImageElement, 'id' | 'zIndex' | 'src' | 'scaleX' | 'scaleY'> => ({
    type: 'image',
    mask: 'none',
    edge: 'none',
    edgeFadeAmount: 0.4,
    edgeFadeMinOpacity: 0,
    edgeFadeDirection: 'radial',
    edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
    maskCornerRadius: 0.18,
    left: 100,
    top: 100,
    angle: 0,
    opacity: 1,
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    setImageUploadError(null);

    if (removeBgOnUpload) {
      setImageUploadBusy(true);
      try {
        const { src, scaleX, scaleY } = await removeBackgroundFromFilePreservingDisplay(file);
        addElement({
          ...newImageDefaults(),
          src,
          scaleX,
          scaleY,
        } as NewPosterImagePayload);
      } catch (err) {
        setImageUploadError(err instanceof Error ? err.message : 'Background removal failed.');
      } finally {
        setImageUploadBusy(false);
        input.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') return;
      addElement({
        ...newImageDefaults(),
        src: dataUrl,
        scaleX: 1,
        scaleY: 1,
      } as NewPosterImagePayload);
    };
    reader.onerror = () => {
      console.error('Failed to read image file');
      setImageUploadError('Could not read image file.');
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
            onClick={guard(handleAddText)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Text
          </button>
          <button
            type="button"
            onClick={guard(() => setShapesModalOpen(true))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Shapes
          </button>
          <button
            type="button"
            onClick={guard(() => setCustomElementsModalOpen(true))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Custom Elements
          </button>
        </div>
      </div>

      {/* Recreate from Image */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          AI Recreate
        </h3>
        <button
          type="button"
          onClick={guard(() => recreateInputRef.current?.click())}
          disabled={!!recreateStatus}
          className="flex w-full items-center gap-2 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2.5 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-100 disabled:opacity-60 dark:border-accent-700 dark:bg-accent-900/30 dark:text-accent-300 dark:hover:bg-accent-900/50"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="truncate">{recreateStatus || 'Recreate from Image'}</span>
        </button>
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          Upload a poster/flyer photo and AI will recreate it as an editable design
        </p>
        <input
          ref={recreateInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleRecreateUpload}
        />
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
          } as NewPosterImagePayload);
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
            others on the canvas. Hold Ctrl (or ⌘ on Mac) to add or remove layers from the selection.
            Double-click a text layer to edit its contents.
          </p>
        ) : (
          <ul className="max-h-[min(40vh,280px)] space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-1 dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="px-2 pb-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              Drag the grip to reorder: up = forward, down = backward.
            </p>
            {layersFrontToBack.map((el, index) => {
              const selected = selectedIds.includes(el.id);
              const locked = !!el.locked;
              const isDragging = layerDragFromIndex === index;
              const isOver = layerDragOverIndex === index && layerDragFromIndex !== index;
              return (
                <li
                  key={el.id}
                  onDragOver={(e) => {
                    if (readOnly || layerDragFromIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setLayerDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    setLayerDragOverIndex((prev) => (prev === index ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (readOnly) return;
                    const from = layerDragFromIndex;
                    setLayerDragOverIndex(null);
                    setLayerDragFromIndex(null);
                    if (from === null || from === index) return;
                    const ids = layersFrontToBack.map((x) => x.id);
                    const next = reorderIndexMove(ids, from, index);
                    reorderLayersFrontToBack(next);
                  }}
                >
                  <div
                    className={[
                      'flex w-full items-center gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-500/50'
                        : 'text-zinc-800 hover:bg-white hover:ring-1 hover:ring-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:ring-zinc-600',
                      isDragging ? 'opacity-50' : '',
                      isOver ? 'ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-zinc-900' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      draggable={!readOnly}
                      title="Drag to reorder stacking (up = forward, down = backward)"
                      onDragStart={(e) => {
                        if (readOnly) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', el.id);
                        setLayerDragFromIndex(index);
                      }}
                      onDragEnd={() => {
                        setLayerDragFromIndex(null);
                        setLayerDragOverIndex(null);
                      }}
                      className="shrink-0 cursor-grab touch-none rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                      aria-label="Drag to reorder layer"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                        <path d="M7 4h2v2H7V4zm4 0h2v2h-2V4zM7 9h2v2H7V9zm4 0h2v2h-2V9zM7 14h2v2H7v-2zm4 0h2v2h-2v-2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => selectLayer(el.id, e.ctrlKey || e.metaKey)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        selectLayer(el.id, false);
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
                        if (readOnly) {
                          navigate('/login');
                          return;
                        }
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
        <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-600">
          <input
            type="checkbox"
            checked={removeBgOnUpload}
            onChange={(e) => {
              setRemoveBgOnUpload(e.target.checked);
              setImageUploadError(null);
            }}
            disabled={readOnly || imageUploadBusy}
            className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          <span className="text-xs text-zinc-700 dark:text-zinc-300">Remove background after upload</span>
        </label>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={imageUploadBusy}
          onChange={handleImageUpload}
        />
        <button
          type="button"
          onClick={guard(() => imageInputRef.current?.click())}
          disabled={imageUploadBusy}
          className="w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
        >
          {imageUploadBusy ? 'Removing background…' : 'Upload Image'}
        </button>
        {imageUploadError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{imageUploadError}</p>
        )}
      </div>

      {onOpen3DModal && (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          3D Text
        </h3>
        <button
          onClick={guard(() => onOpen3DModal('add'))}
          className="w-full rounded-lg bg-amber-500 px-3 py-3 text-sm font-medium text-white hover:bg-amber-600"
        >
          Add 3D Text
        </button>
      </div>
      )}
    </div>
  );
}
