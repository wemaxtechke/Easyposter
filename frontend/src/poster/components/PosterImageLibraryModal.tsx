import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listUserPosterImages,
  uploadUserPosterImage,
  deleteUserPosterImage,
  type UserPosterImage,
} from '../services/userPosterImagesApi';
import { removeBackgroundFromFilePreservingDisplay } from '../services/removeBackgroundApi';

export interface PosterImagePickResult {
  src: string;
  scaleX: number;
  scaleY: number;
}

interface PosterImageLibraryModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, runs remove-bg on the chosen image before calling onPick. */
  removeBgOnPick: boolean;
  onPick: (result: PosterImagePickResult) => void;
}

export function PosterImageLibraryModal({
  open,
  onClose,
  removeBgOnPick,
  onPick,
}: PosterImageLibraryModalProps) {
  const [items, setItems] = useState<UserPosterImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listUserPosterImages();
      setItems(list);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Failed to load your images');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchItems();
  }, [open, fetchItems]);

  const handleUpload = async () => {
    if (!uploadFile) {
      setError('Select an image file first');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadUserPosterImage(uploadFile);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const applyPick = async (url: string) => {
    setPickBusy(true);
    setError(null);
    try {
      if (removeBgOnPick) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not load image for background removal');
        const blob = await res.blob();
        const file = new File([blob], 'library.png', { type: blob.type || 'image/png' });
        const { src, scaleX, scaleY } = await removeBackgroundFromFilePreservingDisplay(file);
        onPick({ src, scaleX, scaleY });
      } else {
        onPick({ src: url, scaleX: 1, scaleY: 1 });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add image');
    } finally {
      setPickBusy(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !confirm(
        'Remove this image from your library? Posters that use only this URL may show a broken image.'
      )
    ) {
      return;
    }
    try {
      await deleteUserPosterImage(id);
      await fetchItems();
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-image-library-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 id="poster-image-library-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Your images
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Uploads are saved to your account. Click a thumbnail to add it to the poster
            {removeBgOnPick ? ' (background will be removed).' : '.'}
          </p>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Upload new image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={uploading || pickBusy}
              onChange={(e) => {
                setUploadFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="mb-2 block w-full text-xs file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
            />
            <button
              type="button"
              disabled={uploading || pickBusy || !uploadFile}
              onClick={handleUpload}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload to cloud'}
            </button>
          </div>

          {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pickBusy && (
            <p className="mb-3 text-center text-sm text-amber-700 dark:text-amber-300">
              {removeBgOnPick ? 'Removing background…' : 'Adding image…'}
            </p>
          )}
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No images yet. Upload one above — it will appear here for future posters.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group relative flex flex-col items-center rounded-lg border border-zinc-200 bg-zinc-50 p-2 transition hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-amber-500 dark:hover:bg-amber-950/20"
                >
                  <button
                    type="button"
                    disabled={pickBusy}
                    onClick={() => void applyPick(item.url)}
                    className="flex w-full flex-col items-center disabled:opacity-50"
                  >
                    <div className="flex h-20 w-full max-w-[5rem] items-center justify-center overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-900">
                      <img
                        src={item.url}
                        alt={item.originalName || 'Uploaded image'}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="mt-1.5 w-full truncate text-center text-[10px] font-medium text-zinc-700 dark:text-zinc-300">
                      {item.originalName || 'Image'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(item.id, e)}
                    disabled={pickBusy}
                    className="absolute right-1 top-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 opacity-0 transition group-hover:opacity-100 hover:bg-red-200 disabled:opacity-30 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
                    aria-label="Remove from library"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            disabled={pickBusy}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
