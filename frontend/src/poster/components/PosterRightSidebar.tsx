import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColorPickerPopover } from '../../components/ColorPickerPopover';
import { usePosterStore } from '../store/posterStore';
import type {
  PosterElement,
  PosterTextElement,
  Poster3DTextElement,
  PosterShapeElement,
  PosterShapeFill,
  PosterImageElement,
  PosterImageMask,
  PosterImageEdge,
  PosterImageFadeDirection,
  PosterTextAlign,
  PosterShadow,
  ImageAdjustments,
  CanvasBackground,
  GradientStop,
} from '../types';
import { isSolidBackground, DEFAULT_GRADIENT_STOPS } from '../types';
import { normalizePosterShapeFill } from '../shapeFillFabric';
import { getPosterShapeLocalSize, shapeFillFallbackForType } from '../posterShapeGeometry';
import { rectHasPerCornerRadii } from '../roundedRectPath';
import { POSTER_FONT_OPTIONS } from '../posterFonts';
import { usePosterFontOptions } from '../usePosterFontOptions';
import { MaskEditorModal } from './MaskEditorModal';
import { BUILT_IN_TEXTURES } from '../posterTextures';
import { removeBackgroundFromElementPreservingLayout } from '../services/removeBackgroundApi';

interface PosterRightSidebarProps {
  readOnly?: boolean;
  onOpenEdit3D?: (id: string) => void;
}

function GradientStopsEditor({
  stops,
  onChange,
}: {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-zinc-500">Color stops</label>
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <ColorPickerPopover
            color={/^#[0-9A-Fa-f]{6}$/.test(stop.color) ? stop.color : '#ffffff'}
            onChange={(c) => {
              const next = [...stops];
              next[i] = { ...next[i], color: c };
              onChange(next);
            }}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(stop.offset * 100)}
            onChange={(e) => {
              const next = [...stops];
              next[i] = { ...next[i], offset: (parseFloat(e.target.value) || 0) / 100 };
              onChange(next);
            }}
            className="w-14 rounded border border-zinc-200 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
          <span className="text-xs text-zinc-500">%</span>
        </div>
      ))}
    </div>
  );
}

function LineCurveControls({
  shape,
  updateElement,
}: {
  shape: PosterShapeElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Curve
      </label>
      {shape.curveControl ? (
        <>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Adjust X/Y to bend the line. Drag on canvas to move the whole shape.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500">X</label>
              <input
                type="number"
                value={Math.round(shape.curveControl.x)}
                onChange={(e) =>
                  updateElement(shape.id, {
                    curveControl: {
                      ...shape.curveControl!,
                      x: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500">Y</label>
              <input
                type="number"
                value={Math.round(shape.curveControl.y)}
                onChange={(e) =>
                  updateElement(shape.id, {
                    curveControl: {
                      ...shape.curveControl!,
                      y: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateElement(shape.id, { curveControl: undefined })}
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            Remove curve
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            const x1 = shape.x1 ?? 0;
            const y1 = shape.y1 ?? 0;
            const x2 = shape.x2 ?? 120;
            const y2 = shape.y2 ?? 80;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const offset = 25;
            const cx = mx + (-dy / len) * offset;
            const cy = my + (dx / len) * offset;
            updateElement(shape.id, { curveControl: { x: cx, y: cy } });
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Add curve
        </button>
      )}
    </div>
  );
}

function ShapeFillAndRoundnessControls({
  shape,
  updateElement,
}: {
  shape: PosterShapeElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const fillNorm = normalizePosterShapeFill(shape.fill, shapeFillFallbackForType(shape.type));

  const setFill = (fill: PosterShapeFill) => updateElement(shape.id, { fill });

  const updateStops = (next: GradientStop[]) => {
    if (fillNorm.type === 'linear') {
      setFill({ type: 'linear', angle: fillNorm.angle, stops: next });
    } else if (fillNorm.type === 'radial') {
      setFill({
        type: 'radial',
        cx: fillNorm.cx,
        cy: fillNorm.cy,
        r: fillNorm.r,
        stops: next,
      });
    }
  };

  const stops =
    fillNorm.type !== 'solid' ? (fillNorm.stops?.length ? fillNorm.stops : DEFAULT_GRADIENT_STOPS) : [];

  const { w, h } = getPosterShapeLocalSize(shape);
  const maxRound = shape.type === 'rect' ? Math.max(0, Math.floor(Math.min(w, h) / 2)) : 0;
  const rx = Math.min(shape.rx ?? 0, maxRound);

  return (
    <div className="flex flex-col gap-3">
      {shape.type === 'rect' && rectHasPerCornerRadii(shape) && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This rectangle uses a fixed mixed corner style (top rounded, bottom square). Change fill and
          shadow below; resize and rotate on the canvas.
        </p>
      )}

      {shape.type === 'rect' && !rectHasPerCornerRadii(shape) && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Corner roundness ({rx}px)
          </label>
          <input
            type="range"
            min={0}
            max={maxRound}
            step={1}
            value={rx}
            onChange={(e) =>
              updateElement(shape.id, { rx: parseInt(e.target.value, 10) || 0 })
            }
            className="w-full"
          />
        </div>
      )}

      {shape.type === 'line' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Stroke width ({shape.strokeWidth ?? 4}px)
          </label>
          <input
            type="range"
            min={1}
            max={48}
            step={1}
            value={shape.strokeWidth ?? 4}
            onChange={(e) =>
              updateElement(shape.id, { strokeWidth: parseInt(e.target.value, 10) || 4 })
            }
            className="w-full"
          />
        </div>
      )}

      {(shape.type === 'rect' ||
        shape.type === 'circle' ||
        shape.type === 'triangle' ||
        shape.type === 'ellipse' ||
        shape.type === 'polygon') && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Outline
          </label>
          <div className="flex items-center gap-2">
            <ColorPickerPopover
              color={
                shape.stroke && (shape.strokeWidth ?? 0) > 0 && /^#[0-9A-Fa-f]{6}$/i.test(shape.stroke)
                  ? shape.stroke
                  : '#000000'
              }
              onChange={(c) =>
                updateElement(shape.id, {
                  stroke: c,
                  strokeWidth: shape.strokeWidth && shape.stroke ? shape.strokeWidth : 2,
                })
              }
            />
            <div className="flex-1">
              <label className="text-[10px] text-zinc-500">Width ({(shape.strokeWidth ?? 0) || 0}px)</label>
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                value={(shape.strokeWidth ?? 0) || 0}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10) || 0;
                  updateElement(shape.id, {
                    strokeWidth: v,
                    stroke: v > 0 ? (shape.stroke && /^#[0-9A-Fa-f]{6}$/i.test(shape.stroke) ? shape.stroke : '#000000') : undefined,
                  });
                }}
                className="w-full"
              />
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Set width to 0 to hide outline.
          </p>
        </div>
      )}

      {(shape.type === 'rect' ||
        shape.type === 'circle' ||
        shape.type === 'triangle' ||
        shape.type === 'ellipse' ||
        shape.type === 'polygon') && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Fill opacity ({Math.round((shape.fillOpacity ?? 1) * 100)}%)
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((shape.fillOpacity ?? 1) * 100)}
            onChange={(e) =>
              updateElement(shape.id, {
                fillOpacity: Math.max(0, Math.min(1, (parseInt(e.target.value, 10) || 0) / 100)),
              })
            }
            className="w-full"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          {shape.type === 'line' ? 'Color' : 'Fill'}
        </label>
        <select
          value={fillNorm.type}
          onChange={(e) => {
            const t = e.target.value;
            if (t === 'solid') {
              const c =
                fillNorm.type === 'solid'
                  ? fillNorm.color
                  : (fillNorm.stops[0]?.color ?? '#3b82f6');
              setFill({ type: 'solid', color: c });
            } else if (t === 'linear') {
              setFill({ type: 'linear', angle: 90, stops: [...DEFAULT_GRADIENT_STOPS] });
            } else if (t === 'radial') {
              setFill({
                type: 'radial',
                cx: 0.5,
                cy: 0.5,
                r: 0.5,
                stops: [...DEFAULT_GRADIENT_STOPS],
              });
            } else if (t === 'pattern') {
              setFill({ type: 'pattern', textureId: 'dots', repeat: 'repeat', scale: 1 });
            }
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="solid">Solid</option>
          <option value="linear">Linear gradient</option>
          <option value="radial">Radial gradient</option>
          <option value="pattern">Texture</option>
        </select>

        {fillNorm.type === 'pattern' && (
          <>
            <label className="text-xs text-zinc-500">Texture</label>
            <div className="grid grid-cols-4 gap-1.5">
              {BUILT_IN_TEXTURES.map((tex) => (
                <button
                  key={tex.id}
                  type="button"
                  title={tex.name}
                  onClick={() => setFill({ ...fillNorm, textureId: tex.id })}
                  className={`aspect-square rounded border-2 p-0.5 transition-colors ${
                    fillNorm.textureId === tex.id
                      ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-600'
                  }`}
                  style={{
                    backgroundImage: `url(${tex.url})`,
                    backgroundSize: 'cover',
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">
                Scale ({((fillNorm.scale ?? 1) * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min={25}
                max={200}
                step={5}
                value={((fillNorm.scale ?? 1) * 100)}
                onChange={(e) =>
                  setFill({ ...fillNorm, scale: parseInt(e.target.value, 10) / 100 })
                }
                className="w-full"
              />
            </div>
          </>
        )}

        {fillNorm.type === 'solid' && (
          <ColorPickerPopover
            color={/^#[0-9A-Fa-f]{6}$/.test(fillNorm.color) ? fillNorm.color : '#3b82f6'}
            onChange={(c) => setFill({ type: 'solid', color: c })}
          />
        )}

        {fillNorm.type === 'linear' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Angle (°)</label>
              <input
                type="number"
                value={Math.round(fillNorm.angle)}
                onChange={(e) =>
                  setFill({
                    type: 'linear',
                    angle: parseFloat(e.target.value) || 0,
                    stops: fillNorm.stops,
                  })
                }
                className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <GradientStopsEditor stops={stops} onChange={updateStops} />
          </>
        )}

        {fillNorm.type === 'radial' && (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Center X %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(fillNorm.cx * 100)}
                  onChange={(e) =>
                    setFill({
                      type: 'radial',
                      cx: (parseFloat(e.target.value) || 50) / 100,
                      cy: fillNorm.cy,
                      r: fillNorm.r,
                      stops: fillNorm.stops,
                    })
                  }
                  className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Center Y %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(fillNorm.cy * 100)}
                  onChange={(e) =>
                    setFill({
                      type: 'radial',
                      cx: fillNorm.cx,
                      cy: (parseFloat(e.target.value) || 50) / 100,
                      r: fillNorm.r,
                      stops: fillNorm.stops,
                    })
                  }
                  className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Radius</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(fillNorm.r * 100)}
                  onChange={(e) =>
                    setFill({
                      type: 'radial',
                      cx: fillNorm.cx,
                      cy: fillNorm.cy,
                      r: (parseFloat(e.target.value) || 50) / 100,
                      stops: fillNorm.stops,
                    })
                  }
                  className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <GradientStopsEditor stops={stops} onChange={updateStops} />
          </>
        )}
      </div>
    </div>
  );
}

function ImageAdjustmentControls({
  elementId,
  adj,
  updateElement,
}: {
  elementId: string;
  adj: ImageAdjustments;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const brightness = adj.adjustBrightness ?? 0;
  const contrast = adj.adjustContrast ?? 0;
  const saturation = adj.adjustSaturation ?? 0;
  const sharpness = adj.adjustSharpness ?? 0;
  const isDefault = brightness === 0 && contrast === 0 && saturation === 0 && sharpness === 0;

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Color &amp; lighting</p>
        {!isDefault && (
          <button
            type="button"
            onClick={() =>
              updateElement(elementId, {
                adjustBrightness: 0,
                adjustContrast: 0,
                adjustSaturation: 0,
                adjustSharpness: 0,
              })
            }
            className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Reset
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Brightness ({brightness})
        </label>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={brightness}
          onChange={(e) =>
            updateElement(elementId, { adjustBrightness: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Contrast ({contrast})
        </label>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={contrast}
          onChange={(e) =>
            updateElement(elementId, { adjustContrast: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Saturation ({saturation})
        </label>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={saturation}
          onChange={(e) =>
            updateElement(elementId, { adjustSaturation: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Sharpness ({sharpness})
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sharpness}
          onChange={(e) =>
            updateElement(elementId, { adjustSharpness: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
      </div>
    </div>
  );
}

function PosterImageAppearanceControls({
  raster,
  updateElement,
  pushHistory,
  readOnly,
}: {
  raster: PosterImageElement | Poster3DTextElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
  pushHistory: () => void;
  readOnly?: boolean;
}) {
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [removeBgBusy, setRemoveBgBusy] = useState(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);

  useEffect(() => {
    setRemoveBgError(null);
  }, [raster.id]);

  const mask: PosterImageMask = raster.mask ?? 'none';
  const edge: PosterImageEdge = raster.edge ?? 'none';
  const shapeMask = mask !== 'none';
  const tearDisabled = shapeMask;
  const fadeAmount = raster.edgeFadeAmount ?? 0.4;
  const fadeMinOpacity = raster.edgeFadeMinOpacity ?? 0;
  const fadeDirection: PosterImageFadeDirection = raster.edgeFadeDirection ?? 'radial';
  const edgeUsesTear = edge === 'paper-tear' || edge === 'fade-paper-tear';
  const edgeUsesFade = edge === 'fade' || edge === 'fade-paper-tear';

  const edgeSelectValue =
    tearDisabled && edgeUsesTear
      ? edge === 'fade-paper-tear'
        ? 'fade'
        : 'none'
      : edge;

  const handleRemoveBackground = async () => {
    if (readOnly || raster.locked) return;
    setRemoveBgError(null);
    setRemoveBgBusy(true);
    try {
      pushHistory();
      const pick =
        raster.type === '3d-text'
          ? { image: raster.image, scaleX: raster.scaleX, scaleY: raster.scaleY }
          : { src: raster.src, scaleX: raster.scaleX, scaleY: raster.scaleY };
      const { primary, scaleX, scaleY } = await removeBackgroundFromElementPreservingLayout(pick);
      if (raster.type === '3d-text') {
        updateElement(raster.id, { image: primary, scaleX, scaleY });
      } else {
        updateElement(raster.id, { src: primary, scaleX, scaleY });
      }
    } catch (err) {
      setRemoveBgError(err instanceof Error ? err.message : 'Background removal failed.');
    } finally {
      setRemoveBgBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Image appearance</p>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
        <button
          type="button"
          onClick={handleRemoveBackground}
          disabled={readOnly || !!raster.locked || removeBgBusy}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {removeBgBusy ? 'Removing background…' : 'Remove background'}
        </button>
        {removeBgError && (
          <p className="text-xs text-red-600 dark:text-red-400">{removeBgError}</p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Uses the same service as template uploads. Keeps size and position on the canvas.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Shape, position, and size are edited in the mask editor.
        </p>
        <button
          type="button"
          onClick={() => setMaskEditorOpen(true)}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Mask
        </button>
        {shapeMask && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Current: {mask} — image {Math.round((raster.maskImageScale ?? 1) * 100)}%, mask {Math.round((raster.maskScale ?? 1) * 100)}%
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Flip image">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Flip</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateElement(raster.id, { flipHorizontal: !raster.flipHorizontal })}
            className={`rounded border px-3 py-2 text-xs font-medium transition-colors ${
              raster.flipHorizontal
                ? 'border-accent-600 bg-accent-600 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-zinc-950'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Horizontal
          </button>
          <button
            type="button"
            onClick={() => updateElement(raster.id, { flipVertical: !raster.flipVertical })}
            className={`rounded border px-3 py-2 text-xs font-medium transition-colors ${
              raster.flipVertical
                ? 'border-accent-600 bg-accent-600 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-zinc-950'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Vertical
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Texture overlay">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Texture overlay</span>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            title="None"
            onClick={(e) => {
              e.stopPropagation();
              updateElement(raster.id, { textureOverlay: undefined });
            }}
            className={`flex aspect-square items-center justify-center rounded border-2 text-[10px] ${
              !raster.textureOverlay
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            —
          </button>
          {BUILT_IN_TEXTURES.map((tex) => (
            <button
              key={tex.id}
              type="button"
              title={tex.name}
              onClick={(e) => {
                e.stopPropagation();
                updateElement(raster.id, {
                  textureOverlay: {
                    textureId: tex.id,
                    opacity: raster.textureOverlay?.opacity ?? 0.5,
                  },
                });
              }}
              className={`aspect-square rounded border-2 p-0.5 ${
                raster.textureOverlay?.textureId === tex.id
                  ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                  : 'border-zinc-200 dark:border-zinc-600'
              }`}
              style={{
                backgroundImage: `url(${tex.url})`,
                backgroundSize: 'cover',
              }}
            />
          ))}
        </div>
        {raster.textureOverlay && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">
              Opacity ({Math.round((raster.textureOverlay.opacity ?? 0.5) * 100)}%)
            </label>
            <input
              type="range"
              min={5}
              max={95}
              step={5}
              value={(raster.textureOverlay.opacity ?? 0.5) * 100}
              onChange={(e) =>
                updateElement(raster.id, {
                  textureOverlay: {
                    ...raster.textureOverlay!,
                    opacity: parseInt(e.target.value, 10) / 100,
                  },
                })
              }
              className="w-full"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Edge</label>
        <select
          value={edgeSelectValue}
          onChange={(e) => {
            const ed = e.target.value as PosterImageEdge;
            const updates: Partial<PosterElement> = { edge: ed };
            if ((ed === 'paper-tear' || ed === 'fade-paper-tear') && shapeMask) {
              updates.mask = 'none';
            }
            updateElement(raster.id, updates);
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="none">None</option>
          <option value="fade">Soft fade (vignette)</option>
          <option value="paper-tear" disabled={tearDisabled}>
            Paper tear
          </option>
          <option value="fade-paper-tear" disabled={tearDisabled}>
            Paper tear + soft fade
          </option>
        </select>
        {tearDisabled && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Turn off shape mask to use paper tear (or tear + fade).
          </p>
        )}
        {edgeUsesFade && (
          <div className="mt-1 flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Fade area</label>
            <select
              value={fadeDirection}
              onChange={(e) =>
                updateElement(raster.id, {
                  edgeFadeDirection: e.target.value as PosterImageFadeDirection,
                })
              }
              className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="radial">All around (vignette)</option>
              <option value="bottom">Bottom only</option>
            </select>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Bottom only fades upward from the lower edge; all around uses a circular vignette.
            </p>
          </div>
        )}
      </div>

      {edgeUsesFade && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Fade reach ({Math.round(fadeAmount * 100)}%)
            </label>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={fadeAmount}
              onChange={(e) =>
                updateElement(raster.id, { edgeFadeAmount: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Higher = fade reaches further inward from the edge or bottom band.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Outer edge opacity ({Math.round(fadeMinOpacity * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fadeMinOpacity}
              onChange={(e) =>
                updateElement(raster.id, { edgeFadeMinOpacity: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              How opaque the outer faded region stays. Raise this to avoid harsh, fully transparent
              rims; lower keeps a stronger soft-edge cutout.
            </p>
          </div>
        </div>
      )}

      {edgeUsesTear && !tearDisabled && (
        <button
          type="button"
          onClick={() =>
            updateElement(raster.id, {
              edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
            })
          }
          className="rounded border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Regenerate tear pattern
        </button>
      )}

      <MaskEditorModal
        open={maskEditorOpen}
        target={raster}
        onClose={() => setMaskEditorOpen(false)}
        onApply={(updates) => {
          updateElement(raster.id, updates);
          pushHistory();
        }}
      />
    </div>
  );
}

const toggleBtn =
  'rounded border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-colors dark:border-zinc-600';
const toggleBtnOn =
  'bg-accent-600 text-white dark:bg-gold-500 dark:text-zinc-950';
const toggleBtnOff =
  'bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700';

function PosterTextControls({
  text,
  updateElement,
}: {
  text: PosterTextElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontOptions = usePosterFontOptions();

  useEffect(() => {
    if (!fontMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = fontMenuRef.current;
      if (el && !el.contains(e.target as Node)) setFontMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [fontMenuOpen]);

  const isBold =
    text.fontWeight === 'bold' ||
    text.fontWeight === 700 ||
    text.fontWeight === '700';
  const isItalic = text.fontStyle === 'italic';
  const hasUnderline = text.underline === true;
  const hasStrike = text.linethrough === true;
  const knownMatch = fontOptions.find((o) => o.value === text.fontFamily);
  const displayLabel = knownMatch
    ? knownMatch.label
    : text.fontFamily.length > 40
      ? `${text.fontFamily.slice(0, 40)}…`
      : text.fontFamily;

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Text</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400" id="poster-font-label">
          Font
        </label>
        <div className="relative" ref={fontMenuRef}>
          <button
            type="button"
            id="poster-font-trigger"
            aria-haspopup="listbox"
            aria-expanded={fontMenuOpen}
            aria-labelledby="poster-font-label poster-font-trigger"
            onClick={() => setFontMenuOpen((o) => !o)}
            className="flex w-full max-w-full items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-2 text-left text-sm dark:border-zinc-700 dark:bg-zinc-800"
            style={{ fontFamily: text.fontFamily }}
          >
            <span className="min-w-0 truncate">{displayLabel}</span>
            <span className="shrink-0 text-zinc-400" aria-hidden>
              ▾
            </span>
          </button>
          {fontMenuOpen && (
            <ul
              className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
              role="listbox"
              aria-label="Choose font"
            >
              {!knownMatch && (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected
                    className="w-full px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    style={{ fontFamily: text.fontFamily }}
                    onClick={() => setFontMenuOpen(false)}
                  >
                    {displayLabel} (current)
                  </button>
                </li>
              )}
              {fontOptions.map((o) => {
                const selected = o.value === text.fontFamily;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                        selected ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                      }`}
                      style={{ fontFamily: o.value }}
                      onClick={() => {
                        updateElement(text.id, { fontFamily: o.value });
                        setFontMenuOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Style</label>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            title="Bold"
            onClick={() =>
              updateElement(text.id, { fontWeight: isBold ? 'normal' : 'bold' })
            }
            className={`${toggleBtn} ${isBold ? toggleBtnOn : toggleBtnOff}`}
          >
            B
          </button>
          <button
            type="button"
            title="Italic"
            onClick={() =>
              updateElement(text.id, { fontStyle: isItalic ? 'normal' : 'italic' })
            }
            className={`${toggleBtn} italic ${isItalic ? toggleBtnOn : toggleBtnOff}`}
          >
            I
          </button>
          <button
            type="button"
            title="Underline"
            onClick={() => updateElement(text.id, { underline: !hasUnderline })}
            className={`${toggleBtn} underline ${hasUnderline ? toggleBtnOn : toggleBtnOff}`}
          >
            U
          </button>
          <button
            type="button"
            title="Strikethrough"
            onClick={() => updateElement(text.id, { linethrough: !hasStrike })}
            className={`${toggleBtn} line-through ${hasStrike ? toggleBtnOn : toggleBtnOff}`}
          >
            S
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Alignment</label>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as PosterTextAlign[]).map((a) => (
            <button
              key={a}
              type="button"
              title={`Align ${a}`}
              onClick={() => updateElement(text.id, { textAlign: a })}
              className={`${toggleBtn} ${(text.textAlign ?? 'left') === a ? toggleBtnOn : toggleBtnOff}`}
            >
              {a === 'left' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx=".5" />
                  <rect x="1" y="7" width="10" height="2" rx=".5" />
                  <rect x="1" y="12" width="14" height="2" rx=".5" />
                </svg>
              )}
              {a === 'center' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx=".5" />
                  <rect x="3" y="7" width="10" height="2" rx=".5" />
                  <rect x="1" y="12" width="14" height="2" rx=".5" />
                </svg>
              )}
              {a === 'right' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx=".5" />
                  <rect x="5" y="7" width="10" height="2" rx=".5" />
                  <rect x="1" y="12" width="14" height="2" rx=".5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Font size</label>
        <input
          type="number"
          value={text.fontSize}
          onChange={(e) =>
            updateElement(text.id, {
              fontSize: parseInt(e.target.value, 10) || 24,
            })
          }
          className="w-24 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Letter spacing{' '}
          <span className="font-normal text-zinc-400">
            ({((text.charSpacing ?? 0) / 1000).toFixed(2)} em)
          </span>
        </label>
        <input
          type="range"
          min={-150}
          max={400}
          step={5}
          value={text.charSpacing ?? 0}
          onChange={(e) =>
            updateElement(text.id, { charSpacing: parseInt(e.target.value, 10) || 0 })
          }
          className="w-full"
        />
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          Tighter ← → wider. Scales with font size (same as CSS letter-spacing in em).
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Row spacing{' '}
          <span className="font-normal text-zinc-400">
            ({(text.lineHeight ?? 1.16).toFixed(2)}x)
          </span>
        </label>
        <input
          type="range"
          min={0.8}
          max={2}
          step={0.01}
          value={text.lineHeight ?? 1.16}
          onChange={(e) =>
            updateElement(text.id, { lineHeight: parseFloat(e.target.value) || 1.16 })
          }
          className="w-full"
        />
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          Controls spacing between lines in multi-line text.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Fill</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() =>
              updateElement(text.id, {
                fill: text.fill || '#000000',
                fillGradient: undefined,
                fillPattern: undefined,
              })
            }
            className={`rounded border px-2 py-1 text-xs ${
              !text.fillGradient && !text.fillPattern
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            onClick={() =>
              updateElement(text.id, {
                fillGradient: text.fillGradient ?? {
                  type: 'linear',
                  angle: 90,
                  stops: [
                    { offset: 0, color: '#3b82f6' },
                    { offset: 1, color: '#8b5cf6' },
                  ],
                },
                fillPattern: undefined,
              })
            }
            className={`rounded border px-2 py-1 text-xs ${
              text.fillGradient
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            Gradient
          </button>
          <button
            type="button"
            onClick={() =>
              updateElement(text.id, {
                fillGradient: undefined,
                fillPattern: {
                  textureId: text.fillPattern?.textureId ?? 'dots',
                  repeat: 'repeat',
                  scale: text.fillPattern?.scale ?? 1,
                },
              })
            }
            className={`rounded border px-2 py-1 text-xs ${
              text.fillPattern
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            Texture
          </button>
        </div>
        {text.fillGradient ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Type</label>
              <select
                value={text.fillGradient.type}
                onChange={(e) => {
                  const t = e.target.value as 'linear' | 'radial';
                  updateElement(text.id, {
                    fillGradient:
                      t === 'linear'
                        ? {
                            type: 'linear',
                            angle: (text.fillGradient as { angle?: number })?.angle ?? 90,
                            stops: text.fillGradient.stops ?? [
                              { offset: 0, color: '#3b82f6' },
                              { offset: 1, color: '#8b5cf6' },
                            ],
                          }
                        : {
                            type: 'radial',
                            cx: 0.5,
                            cy: 0.5,
                            r: 0.5,
                            stops: text.fillGradient.stops ?? [
                              { offset: 0, color: '#3b82f6' },
                              { offset: 1, color: '#8b5cf6' },
                            ],
                          },
                  });
                }}
                className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
            </div>
            {text.fillGradient.type === 'linear' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Angle (°)</label>
                <input
                  type="number"
                  value={Math.round((text.fillGradient as { angle?: number }).angle ?? 90)}
                  onChange={(e) =>
                    updateElement(text.id, {
                      fillGradient: {
                        ...text.fillGradient!,
                        angle: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            )}
            {text.fillGradient.type === 'radial' && (
              <div className="flex flex-wrap gap-2">
                {(['cx', 'cy', 'r'] as const).map((key) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">
                      {key === 'cx' ? 'Center X' : key === 'cy' ? 'Center Y' : 'Radius'} %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(((text.fillGradient as { cx?: number; cy?: number; r?: number })[key] ?? 0.5) * 100)}
                      onChange={(e) =>
                        updateElement(text.id, {
                          fillGradient: {
                            ...text.fillGradient!,
                            [key]: (parseFloat(e.target.value) || 50) / 100,
                          },
                        })
                      }
                      className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                ))}
              </div>
            )}
            <GradientStopsEditor
              stops={text.fillGradient.stops ?? [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#8b5cf6' }]}
              onChange={(stops) =>
                updateElement(text.id, { fillGradient: { ...text.fillGradient!, stops } })
              }
            />
          </>
        ) : !text.fillPattern ? (
          <ColorPickerPopover
            color={text.fill}
            onChange={(c) => updateElement(text.id, { fill: c })}
          />
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {BUILT_IN_TEXTURES.map((tex) => (
                <button
                  key={tex.id}
                  type="button"
                  title={tex.name}
                  onClick={() =>
                    updateElement(text.id, {
                      fillPattern: { ...text.fillPattern!, textureId: tex.id },
                    })
                  }
                  className={`aspect-square rounded border-2 p-0.5 ${
                    text.fillPattern.textureId === tex.id
                      ? 'border-amber-500'
                      : 'border-zinc-200 dark:border-zinc-600'
                  }`}
                  style={{
                    backgroundImage: `url(${tex.url})`,
                    backgroundSize: 'cover',
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Scale (%)</label>
              <input
                type="range"
                min={25}
                max={200}
                step={5}
                value={(text.fillPattern.scale ?? 1) * 100}
                onChange={(e) =>
                  updateElement(text.id, {
                    fillPattern: {
                      ...text.fillPattern!,
                      scale: parseInt(e.target.value, 10) / 100,
                    },
                  })
                }
                className="w-full"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Fill opacity ({Math.round((text.fillOpacity ?? 1) * 100)}%)
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((text.fillOpacity ?? 1) * 100)}
            onChange={(e) =>
              updateElement(text.id, {
                fillOpacity: parseInt(e.target.value, 10) / 100,
              })
            }
            className="w-full"
          />
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            0% = outline only.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Outline</label>
            <button
              type="button"
              onClick={() =>
                updateElement(text.id, {
                  stroke: (text.strokeWidth ?? 0) > 0 ? undefined : '#000000',
                  strokeWidth: (text.strokeWidth ?? 0) > 0 ? 0 : 2,
                })
              }
              className={`text-[10px] ${(text.strokeWidth ?? 0) > 0 ? 'text-amber-600' : 'text-zinc-500'}`}
            >
              {(text.strokeWidth ?? 0) > 0 ? 'On' : 'Off'}
            </button>
          </div>
          {(text.strokeWidth ?? 0) > 0 && (
            <>
              <div className="flex items-center gap-2">
                <ColorPickerPopover
                  color={
                    text.stroke && /^#[0-9A-Fa-f]{6}$/i.test(text.stroke)
                      ? text.stroke
                      : '#000000'
                  }
                  onChange={(c) =>
                    updateElement(text.id, {
                      stroke: c,
                      strokeWidth: text.strokeWidth ?? 2,
                    })
                  }
                />
                <div className="flex flex-1 flex-col gap-0.5">
                  <label className="text-[10px] text-zinc-500">
                    Width ({(() => {
                      const w = text.strokeWidth ?? 2;
                      return w === Math.round(w) ? String(w) : w.toFixed(2);
                    })()}px)
                  </label>
                  <input
                    type="range"
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={text.strokeWidth ?? 2}
                    onChange={(e) =>
                      updateElement(text.id, {
                        strokeWidth: Math.max(0.25, parseFloat(e.target.value) || 0.5),
                        stroke: (text.stroke && /^#[0-9A-Fa-f]{6}$/i.test(text.stroke)) ? text.stroke : '#000000',
                      })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShadowControls({
  elementId,
  shadow,
  updateElement,
}: {
  elementId: string;
  shadow?: PosterShadow;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const enabled = !!shadow;
  const s = shadow ?? { color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 4, offsetY: 4 };

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Shadow</p>
        <button
          type="button"
          onClick={() =>
            updateElement(
              elementId,
              enabled
                ? { shadow: undefined }
                : { shadow: { color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 4, offsetY: 4 } }
            )
          }
          className={`${toggleBtn} text-[10px] ${enabled ? toggleBtnOn : toggleBtnOff}`}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      {enabled && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Color</label>
            <ColorPickerPopover
              color={s.color.startsWith('#') ? s.color : '#000000'}
              onChange={(c) =>
                updateElement(elementId, { shadow: { ...s, color: c } })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Blur ({s.blur})</label>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={s.blur}
              onChange={(e) =>
                updateElement(elementId, { shadow: { ...s, blur: parseInt(e.target.value, 10) } })
              }
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">X ({s.offsetX})</label>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={s.offsetX}
                onChange={(e) =>
                  updateElement(elementId, { shadow: { ...s, offsetX: parseInt(e.target.value, 10) } })
                }
                className="w-full"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">Y ({s.offsetY})</label>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={s.offsetY}
                onChange={(e) =>
                  updateElement(elementId, { shadow: { ...s, offsetY: parseInt(e.target.value, 10) } })
                }
                className="w-full"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PosterRightSidebar({ readOnly = false, onOpenEdit3D }: PosterRightSidebarProps) {
  const navigate = useNavigate();
  const elements = usePosterStore((s) => s.elements);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const canvasBackground = usePosterStore((s) => s.canvasBackground);
  const setCanvasBackground = usePosterStore((s) => s.setCanvasBackground);
  const updateElement = usePosterStore((s) => s.updateElement);
  const removeElements = usePosterStore((s) => s.removeElements);
  const duplicateElements = usePosterStore((s) => s.duplicateElements);
  const bringForward = usePosterStore((s) => s.bringForward);
  const sendBackward = usePosterStore((s) => s.sendBackward);
  const pushHistory = usePosterStore((s) => s.pushHistory);

  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;

  const updateGradientStops = (stops: GradientStop[]) => {
    if (!isSolidBackground(canvasBackground)) {
      setCanvasBackground({ ...canvasBackground, stops } as CanvasBackground);
    }
  };

  if (selected.length === 0) {
    return (
      <div className="relative flex flex-col gap-4 p-4">
        {readOnly && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => navigate('/login')}
            title="Login to edit"
            aria-label="Login to edit properties"
          />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Canvas
        </h3>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">Background</label>
          <select
            value={canvasBackground.type}
            onChange={(e) => {
              const t = e.target.value as CanvasBackground['type'];
              if (t === 'solid') setCanvasBackground({ type: 'solid', color: '#ffffff' });
              else if (t === 'linear') setCanvasBackground({ type: 'linear', angle: 90, stops: DEFAULT_GRADIENT_STOPS });
              else if (t === 'radial') setCanvasBackground({ type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: DEFAULT_GRADIENT_STOPS });
              else setCanvasBackground({ type: 'conic', angle: 0, cx: 0.5, cy: 0.5, stops: DEFAULT_GRADIENT_STOPS });
            }}
            className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="solid">Solid</option>
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
            <option value="conic">Conic</option>
          </select>

          {isSolidBackground(canvasBackground) ? (
            <div className="flex items-center gap-2">
              <ColorPickerPopover
                color={/^#[0-9A-Fa-f]{6}$/.test(canvasBackground.color) ? canvasBackground.color : '#ffffff'}
                onChange={(c) => setCanvasBackground({ type: 'solid', color: c })}
              />
              <input
                type="text"
                value={canvasBackground.color}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCanvasBackground({ type: 'solid', color: v || '#' });
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) setCanvasBackground({ type: 'solid', color: '#ffffff' });
                }}
                className="flex-1 rounded border border-zinc-200 px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
                placeholder="#ffffff"
              />
            </div>
          ) : (
            <>
              {canvasBackground.type === 'linear' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-500">Angle (degrees)</label>
                  <input
                    type="number"
                    value={Math.round(canvasBackground.angle)}
                    onChange={(e) => setCanvasBackground({ ...canvasBackground, angle: parseFloat(e.target.value) || 0 })}
                    className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              )}
              {(canvasBackground.type === 'radial' || canvasBackground.type === 'conic') && (
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Center X %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(canvasBackground.cx * 100)}
                      onChange={(e) => setCanvasBackground({ ...canvasBackground, cx: (parseFloat(e.target.value) || 50) / 100 })}
                      className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Center Y %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(canvasBackground.cy * 100)}
                      onChange={(e) => setCanvasBackground({ ...canvasBackground, cy: (parseFloat(e.target.value) || 50) / 100 })}
                      className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  {canvasBackground.type === 'radial' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">Radius</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(canvasBackground.r * 100)}
                        onChange={(e) => setCanvasBackground({ ...canvasBackground, r: (parseFloat(e.target.value) || 50) / 100 })}
                        className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                  )}
                  {canvasBackground.type === 'conic' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">Angle</label>
                      <input
                        type="number"
                        value={Math.round(canvasBackground.angle)}
                        onChange={(e) => setCanvasBackground({ ...canvasBackground, angle: parseFloat(e.target.value) || 0 })}
                        className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-500">Color stops</label>
                {(canvasBackground.stops ?? DEFAULT_GRADIENT_STOPS).map((stop, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ColorPickerPopover
                      color={/^#[0-9A-Fa-f]{6}$/.test(stop.color) ? stop.color : '#ffffff'}
                      onChange={(c) => {
                        const next = [...(canvasBackground.stops ?? DEFAULT_GRADIENT_STOPS)];
                        next[i] = { ...next[i], color: c };
                        updateGradientStops(next);
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(stop.offset * 100)}
                      onChange={(e) => {
                        const next = [...(canvasBackground.stops ?? DEFAULT_GRADIENT_STOPS)];
                        next[i] = { ...next[i], offset: (parseFloat(e.target.value) || 0) / 100 };
                        updateGradientStops(next);
                      }}
                      className="w-14 rounded border border-zinc-200 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Select an element to edit its properties
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4 p-4">
      {readOnly && (
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={() => navigate('/login')}
          title="Login to edit"
          aria-label="Login to edit properties"
        />
      )}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Properties
      </h3>

      {single && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Lock</p>
            <button
              type="button"
              onClick={() => updateElement(single.id, { locked: !single.locked })}
              title={single.locked ? 'Unlock (allow movement)' : 'Lock (prevent movement)'}
              className={`rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                single.locked
                  ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {single.locked ? 'Unlock' : 'Lock'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Position</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={Math.round(single.left)}
                onChange={(e) =>
                  updateElement(single.id, { left: parseFloat(e.target.value) || 0 })
                }
                className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                type="number"
                value={Math.round(single.top)}
                onChange={(e) =>
                  updateElement(single.id, { top: parseFloat(e.target.value) || 0 })
                }
                className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Scale</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                value={single.scaleX}
                onChange={(e) =>
                  updateElement(single.id, {
                    scaleX: parseFloat(e.target.value) || 1,
                    scaleY: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Rotation</label>
            <input
              type="number"
              value={Math.round(single.angle)}
              onChange={(e) =>
                updateElement(single.id, { angle: parseFloat(e.target.value) || 0 })
              }
              className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Opacity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={single.opacity}
              onChange={(e) =>
                updateElement(single.id, { opacity: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>

          {(single.type === 'image' || single.type === '3d-text') && (
            <PosterImageAppearanceControls
              raster={single as PosterImageElement | Poster3DTextElement}
              updateElement={updateElement}
              pushHistory={pushHistory}
              readOnly={readOnly}
            />
          )}

          {(single.type === 'image' || single.type === '3d-text') && (
            <ImageAdjustmentControls
              elementId={single.id}
              adj={single as ImageAdjustments}
              updateElement={updateElement}
            />
          )}

          {single.type === 'text' && (
            <PosterTextControls
              text={single as PosterTextElement}
              updateElement={updateElement}
            />
          )}

          {single.type === '3d-text' && onOpenEdit3D && (
            <button
              onClick={() => onOpenEdit3D(single.id)}
              className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
            >
              Edit in 3D Editor
            </button>
          )}

          {single.type === 'line' && (
            <LineCurveControls
              shape={single as PosterShapeElement}
              updateElement={updateElement}
            />
          )}

          {(single.type === 'rect' ||
            single.type === 'circle' ||
            single.type === 'triangle' ||
            single.type === 'ellipse' ||
            single.type === 'line' ||
            single.type === 'polygon') && (
            <ShapeFillAndRoundnessControls
              shape={single as PosterShapeElement}
              updateElement={updateElement}
            />
          )}

          <ShadowControls
            elementId={single.id}
            shadow={single.shadow}
            updateElement={updateElement}
          />
        </>
      )}

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <p className="mb-2 text-xs text-zinc-500">Layers</p>
        <div className="flex gap-1">
          <button
            onClick={() => bringForward(selectedIds)}
            className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Forward
          </button>
          <button
            onClick={() => sendBackward(selectedIds)}
            className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Backward
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => duplicateElements(selectedIds)}
          className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Duplicate
        </button>
        <button
          onClick={() => removeElements(selectedIds)}
          className="flex-1 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
