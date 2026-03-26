import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePosterStore } from '../store/posterStore';
import { savePosterProjectToStorage } from '../posterProjectStorage';
import { deleteMyPosterProject, listMyPosterProjects, renameMyPosterProject, type SavedPosterProjectItem } from '../services/posterProjectsApi';
import { TemplateThumbnail } from './TemplateThumbnail';

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

function fmtIso(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return fmtTime(t);
}

export function PosterMyStuffPage() {
  const navigate = useNavigate();
  const loadProject = usePosterStore((s) => s.loadProject);

  const [items, setItems] = useState<SavedPosterProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const list = await listMyPosterProjects();
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openProject = (item: SavedPosterProjectItem) => {
    setError(null);
    try {
      loadProject(item.project);
      savePosterProjectToStorage(item.project);
      sessionStorage.setItem('poster_skip_restore', Date.now().toString());
      sessionStorage.setItem('poster_edit_my_project_id', item.id);
      navigate('/poster');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open project.');
    }
  };

  const refresh = async () => {
    const list = await listMyPosterProjects();
    setItems(list);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMyPosterProject(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const handleRename = async (id: string, current: string) => {
    const next = window.prompt('Rename project', current);
    if (!next) return;
    setError(null);
    try {
      await renameMyPosterProject(id, next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">My stuff</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Your saved posters (private to your account).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/poster"
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500"
            >
              Back to editor
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <p className="font-medium">No saved posters yet.</p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              In the editor, click <span className="font-medium">Save</span> to store a snapshot here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <li key={p.id}>
                <div className="flex w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    type="button"
                    onClick={() => openProject(p)}
                    className="flex w-full flex-col items-stretch text-left"
                    title="Open in editor"
                  >
                    <div className="bg-zinc-100 p-3 dark:bg-zinc-800">
                      <TemplateThumbnail
                        project={p.project}
                        thumbnail={p.thumbnail}
                        width={280}
                        className="rounded-md shadow-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1 p-3">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Saved {fmtIso(p.updatedAt ?? p.createdAt)}
                      </span>
                    </div>
                  </button>

                  <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => openProject(p)}
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRename(p.id, p.name)}
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

