import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePosterStore } from '../store/posterStore';
import { UserMenu } from '../../auth/UserMenu';
import { useAuthStore } from '../../auth/authStore';
import { findPosterTemplateById, getAllPosterTemplates } from '../posterTemplateList';
import { deletePosterTemplateFromCloud } from '../services/posterTemplatesApi';
import { POSTER_TEMPLATE_CATEGORIES, type PosterTemplateDefinition } from '../templateTypes';
import { PosterTemplateFillModal } from './PosterTemplateFillModal';
import { AdminTemplateEditModal } from './AdminTemplateEditModal';
import { TemplateThumbnail } from './TemplateThumbnail';

function categoryLabel(value: string): string {
  return POSTER_TEMPLATE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function originLabel(id: string, cloudIds: Set<string>): string | null {
  if (cloudIds.has(id)) return 'Cloud';
  if (id.startsWith('bundled-')) return 'Built-in';
  return 'This browser';
}

export function TemplateGalleryPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isCreator = useAuthStore((s) => s.isCreator());
  const user = useAuthStore((s) => s.user);
  const remotePosterTemplates = usePosterStore((s) => s.remotePosterTemplates);
  const loadState = usePosterStore((s) => s.remotePosterTemplatesLoadState);
  const loadError = usePosterStore((s) => s.remotePosterTemplatesLoadError);
  const refreshRemotePosterTemplates = usePosterStore((s) => s.refreshRemotePosterTemplates);

  const [fillOpen, setFillOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<PosterTemplateDefinition | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<PosterTemplateDefinition | null>(null);
  const [showMyTemplatesOnly, setShowMyTemplatesOnly] = useState(false);

  const cloudIds = useMemo(
    () => new Set(remotePosterTemplates.map((t) => t.id)),
    [remotePosterTemplates]
  );
  const allItems = useMemo(() => getAllPosterTemplates(), [remotePosterTemplates]);
  const items = useMemo(() => {
    if (!showMyTemplatesOnly || !user?.id) return allItems;
    return allItems.filter((t) => cloudIds.has(t.id) && t.creatorId === user.id);
  }, [allItems, showMyTemplatesOnly, user?.id, cloudIds]);

  useEffect(() => {
    void refreshRemotePosterTemplates();
  }, [refreshRemotePosterTemplates]);

  const openTemplate = (id: string) => {
    setPickError(null);
    const t = findPosterTemplateById(id);
    if (!t) {
      setPickError('Template not found.');
      return;
    }
    setActiveTemplate(t);
    setFillOpen(true);
  };

  const closeFill = () => {
    setFillOpen(false);
    setActiveTemplate(null);
  };

  const handleDeleteCloudTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteError(null);
    try {
      await deletePosterTemplateFromCloud(id);
      await refreshRemotePosterTemplates();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleEditCloudTemplate = (e: React.MouseEvent, t: PosterTemplateDefinition) => {
    e.stopPropagation();
    setEditTemplate(t);
    setEditModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              title="Home"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="hidden sm:inline">Home</span>
            </Link>
            <div>
              <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:text-lg">Poster templates</h1>
              <p className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:block">
                Select a template, fill fields, then edit in the designer.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UserMenu />
            {isCreator && (
              <button
                type="button"
                onClick={() => setShowMyTemplatesOnly((v) => !v)}
                className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                  showMyTemplatesOnly
                    ? 'border-accent-500 bg-accent-50 text-accent-800 dark:border-accent-600 dark:bg-accent-900/30 dark:text-accent-200'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                Mine
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshRemotePosterTemplates()}
              className="hidden rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:block"
            >
              Refresh
            </button>
            <Link
              to="/3d"
              className="hidden rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 md:block"
            >
              3D Text
            </Link>
            <Link
              to="/poster"
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500"
            >
              <span className="hidden sm:inline">Open poster editor</span>
              <span className="sm:hidden">Editor</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {loadState === 'loading' && (
          <p className="text-sm text-zinc-500">Syncing cloud templates…</p>
        )}
        {loadError && loadState === 'error' && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Cloud templates unavailable: {loadError}. Built-in and local templates still work.
          </div>
        )}
        {pickError && !fillOpen && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{pickError}</p>
        )}
        {deleteError && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{deleteError}</p>
        )}

        {items.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No templates available.</p>
        )}

        <ul className="mt-4 columns-2 gap-3 sm:gap-4 lg:columns-3 lg:gap-5">
          {items.map((t) => {
            const origin = originLabel(t.id, cloudIds);
            const isCloudTemplate = cloudIds.has(t.id);
            return (
              <li key={t.id} className="mb-3 break-inside-avoid sm:mb-4 lg:mb-5">
                <div className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-gold-400 hover:shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-gold-500">
                  {((isAdmin && isCloudTemplate) ||
                    (isCreator && isCloudTemplate && t.creatorId === user?.id)) && (
                    <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      {(isAdmin || (isCreator && t.creatorId === user?.id)) && (
                        <button
                          type="button"
                          onClick={(e) => handleEditCloudTemplate(e, t)}
                          title={isAdmin ? 'Edit template (admin)' : 'Edit your template'}
                          className="rounded-full bg-zinc-600 p-1.5 text-white shadow-lg hover:bg-zinc-500"
                          aria-label={`Edit ${t.name}`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCloudTemplate(e, t.id)}
                          title="Delete template (admin)"
                          className="rounded-full bg-red-600 p-1.5 text-white shadow-lg hover:bg-red-500"
                          aria-label={`Delete ${t.name}`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openTemplate(t.id)}
                    className="flex w-full flex-col items-stretch text-left"
                  >
                  <div className="relative flex items-center justify-center bg-zinc-100 p-1.5 sm:p-3 dark:bg-zinc-800">
                    <TemplateThumbnail
                      project={t.project}
                      thumbnail={t.thumbnail}
                      width={280}
                      className="!h-auto !w-full max-w-full rounded-md shadow-sm transition group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/10 group-hover:opacity-100 dark:group-hover:bg-white/5">
                      <span className="rounded-full bg-accent-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
                        Use template
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 p-2.5 sm:p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-accent-600 dark:text-accent-400">
                        {categoryLabel(t.category)}
                      </span>
                      {origin && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {origin}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-sm dark:text-zinc-100">{t.name}</span>
                    {t.description && (
                      <span className="hidden line-clamp-2 text-xs text-zinc-500 sm:block dark:text-zinc-400">
                        {t.description}
                      </span>
                    )}
                  </div>
                </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      <PosterTemplateFillModal open={fillOpen} template={activeTemplate} onClose={closeFill} />
      <AdminTemplateEditModal
        open={editModalOpen}
        template={editTemplate}
        onClose={() => {
          setEditModalOpen(false);
          setEditTemplate(null);
        }}
        onSaved={() => void refreshRemotePosterTemplates()}
      />
    </div>
  );
}
