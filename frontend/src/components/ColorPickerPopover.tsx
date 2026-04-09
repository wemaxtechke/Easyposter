import { useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';

interface ColorPickerPopoverProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function ColorPickerPopover({
  color,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  const hex = color.startsWith('#') ? color : `#${color}`;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-12 cursor-pointer rounded border border-zinc-200 p-0.5 dark:border-zinc-600"
        style={{ backgroundColor: hex }}
        aria-label={ariaLabel}
      />

      {open && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-[199] bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Centered overlay on mobile, absolute dropdown on desktop */}
          <div
            ref={popoverRef}
            className="fixed inset-x-4 top-1/2 z-[200] -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 lg:absolute lg:inset-x-auto lg:right-0 lg:top-auto lg:mt-1.5 lg:translate-y-0 lg:p-3"
          >
            <HexColorPicker
              color={hex}
              onChange={onChange}
              style={{ width: '100%', maxWidth: 300 }}
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">#</span>
              <HexColorInput
                color={hex}
                onChange={onChange}
                prefixed={false}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded-lg bg-zinc-800 py-2 text-sm font-medium text-white dark:bg-zinc-200 dark:text-zinc-900 lg:hidden"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
