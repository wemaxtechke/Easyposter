import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PosterTopBar } from './PosterTopBar';
import { PosterLeftSidebar } from './PosterLeftSidebar';
import { PosterCanvas } from './PosterCanvas';
import { PosterRightSidebar } from './PosterRightSidebar';
import { ThreeTextModal } from './ThreeTextModal';
import { CanvasSizeModal } from './CanvasSizeModal';
import { PosterAiWizardModal } from './PosterAiWizardModal';
import { PosterAiChatPanel } from './PosterAiChatPanel';
import { MobilePropertyBar } from './MobilePropertyBar';
import { TemplateAuthoringBanner } from './TemplateAuthoringBanner';
import { TemplateElementLabelModal } from './TemplateElementLabelModal';
import { SavePosterTemplateModal } from './SavePosterTemplateModal';
import { usePosterStore } from '../store/posterStore';
import { useAuthStore } from '../../auth/authStore';
import { getFabricCanvasRef } from '../canvasRef';
import { loadPosterProjectFromStorage, savePosterProjectToStorage } from '../posterProjectStorage';
import { loadPosterProjectFromCloud, savePosterProjectToCloud, savePosterProjectToMyCloud, updateMyPosterProject } from '../services/posterProjectsApi';
import { resolveBlobUrlsInProject, applyProcessedProjectUrlsToStore } from '../utils/resolveBlobUrlsInProject';
import { projectHasBlobImageUrls } from '../userTemplatesStorage';
import { computePosterProjectPatch, patchIsEmpty } from '../utils/projectPatch';
import type { PosterTemplateCategory, PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterElement, PosterImageElement, PosterTextElement } from '../types';

type TemplateAuthoringState = {
  templateId: string;
  name: string;
  category: PosterTemplateCategory;
  description?: string;
  fields: PosterTemplateFieldBinding[];
  /** When true, save must use PATCH (update) not POST (create). Set when loading from gallery Edit. */
  editSource?: 'cloud';
};

export function PosterLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [threeTextModal, setThreeTextModal] = useState<'add' | { editId: string } | null>(null);
  const [showCanvasSizeModal, setShowCanvasSizeModal] = useState(false);
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [templateAuthoring, setTemplateAuthoring] = useState<TemplateAuthoringState | null>(null);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [labelTargetId, setLabelTargetId] = useState<string | null>(null);
  const skipAutoOpenForIdRef = useRef<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const mainRef = useRef<HTMLElement>(null);

  // Sidebar open state — default open only on large screens
  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  // Auto-open/close sidebars on breakpoint changes
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setLeftOpen(e.matches);
      setRightOpen(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Lock body scroll when mobile sidebar drawer is open
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) return;
    if (!leftOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [leftOpen]);

  const selectedIds = usePosterStore((s) => s.selectedIds);
  const elements = usePosterStore((s) => s.elements);
  const lastCloudSaveRef = useRef<string | null>(null);
  const [cloudDirty, setCloudDirty] = useState(false);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const update = () => {
      const style = window.getComputedStyle(el);
      const padH = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padV = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setViewportSize({
        width: Math.max(1, el.clientWidth - padH),
        height: Math.max(1, el.clientHeight - padV),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const addElement = usePosterStore((s) => s.addElement);
  const refreshRemotePosterTemplates = usePosterStore((s) => s.refreshRemotePosterTemplates);
  const setCanvasSize = usePosterStore((s) => s.setCanvasSize);
  const canvasWidth = usePosterStore((s) => s.canvasWidth);
  const canvasHeight = usePosterStore((s) => s.canvasHeight);

  useEffect(() => {
    void refreshRemotePosterTemplates();
  }, [refreshRemotePosterTemplates]);

  const loadProject = usePosterStore((s) => s.loadProject);
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.initState) === 'ready';
  const readOnly = !user;

  // Load auto-saved project when opening editor (cloud if logged in, else localStorage; skip if editing a template)
  useEffect(() => {
    if (!authReady) return;
    const edit = (location.state as { editTemplate?: unknown })?.editTemplate;
    if (edit) return; // Template edit will load its own project

    // Skip restore when coming from template fill — project already loaded in store.
    // Use timestamp + delayed clear so both React Strict Mode effect runs skip (double-mount in dev).
    const skipRaw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('poster_skip_restore') : null;
    if (skipRaw) {
      const t = parseInt(skipRaw, 10);
      if (!isNaN(t) && Date.now() - t < 5000) {
        // Opening from a preloaded flow (e.g. My stuff): avoid immediate false-dirty.
        const editId =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('poster_edit_my_project_id')
            : null;
        if (editId) {
          lastCloudSaveRef.current = JSON.stringify(usePosterStore.getState().getProject());
          setCloudDirty(false);
        }
        setTimeout(() => sessionStorage.removeItem('poster_skip_restore'), 500);
        return;
      }
      sessionStorage.removeItem('poster_skip_restore');
    }

    // Not opening from "My stuff" preloaded flow: clear stale edit target id.
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('poster_edit_my_project_id');
      sessionStorage.removeItem('poster_edit_my_project_updated_at');
    }

    let cancelled = false;
    (async () => {
      if (user) {
        try {
          const cloudProject = await loadPosterProjectFromCloud();
          if (!cancelled && cloudProject) {
            loadProject(cloudProject);
            lastCloudSaveRef.current = JSON.stringify(cloudProject);
            return;
          }
        } catch {
          // Fall through to localStorage
        }
      }
      lastCloudSaveRef.current = null;
      if (!cancelled) {
        const saved = loadPosterProjectFromStorage();
        if (saved && saved.elements.length > 0) {
          loadProject(saved);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, user?.id, authReady]);

  // Handle "Edit template" from gallery: load project and enter authoring mode
  useEffect(() => {
    const edit = (location.state as { editTemplate?: { id: string; name: string; category: PosterTemplateCategory; description?: string; fields?: PosterTemplateFieldBinding[]; project: unknown } })?.editTemplate;
    if (!edit) return;
    lastCloudSaveRef.current = null; // Editing template, not user's cloud project
    loadProject(edit.project, { fieldBindings: edit.fields ?? [] });
    const isCloudEdit =
      edit.id.startsWith('cloud_') || /^[a-f0-9]{24}$/i.test(edit.id);
    setTemplateAuthoring({
      templateId: edit.id,
      name: edit.name,
      category: edit.category,
      description: edit.description,
      fields: edit.fields ?? [],
      editSource: isCloudEdit ? 'cloud' : undefined,
    });
    navigate('/poster', { replace: true, state: {} });
  }, [location.state, loadProject, navigate]);

  // Show canvas size modal when starting with empty canvas
  useEffect(() => {
    if (elements.length === 0) setShowCanvasSizeModal(true);
  }, []);
  // Close modal when project is loaded (elements populated)
  useEffect(() => {
    if (elements.length > 0) setShowCanvasSizeModal(false);
  }, [elements.length]);

  // Auto-save to localStorage only (cloud save is manual via Save button)
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePosterStore.subscribe(() => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        savePosterProjectToStorage(usePosterStore.getState().getProject());
      }, 1000);
    });
    return () => {
      unsubscribe();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, []);

  // Track cloud dirty state (only when logged in) and beforeunload warning
  useEffect(() => {
    if (!user) {
      lastCloudSaveRef.current = null;
      setCloudDirty(false);
      return;
    }
    let checkTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePosterStore.subscribe(() => {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(() => {
        checkTimer = null;
        const snap = lastCloudSaveRef.current;
        const project = usePosterStore.getState().getProject();
        const current = JSON.stringify(project);
        const dirty =
          snap === null
            ? project.elements.length > 0
            : snap !== current;
        setCloudDirty(dirty);
      }, 300);
    });
    return () => {
      unsubscribe();
      if (checkTimer) clearTimeout(checkTimer);
    };
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (user && cloudDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [user, cloudDirty]);

  const [savingToCloud, setSavingToCloud] = useState(false);
  const handleSaveToCloud = useCallback(async () => {
    if (!user) return;
    setSavingToCloud(true);
    try {
      const baselineBeforeSave = lastCloudSaveRef.current;
      const project = usePosterStore.getState().getProject();
      const toSave = projectHasBlobImageUrls(project)
        ? await resolveBlobUrlsInProject(project)
        : project;
      const processed = await savePosterProjectToCloud(toSave);
      applyProcessedProjectUrlsToStore(processed);
      setCloudDirty(false);

      // Also save a private snapshot to "My stuff" (per-user library)
      const fabric = getFabricCanvasRef();
      const thumb = fabric ? fabric.toDataURL({ format: 'png', multiplier: 0.35, quality: 0.8 }) : undefined;
      const editId =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('poster_edit_my_project_id')
          : null;
      const editUpdatedAt =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('poster_edit_my_project_updated_at')
          : null;
      if (editId) {
        const base = baselineBeforeSave ? (JSON.parse(baselineBeforeSave) as typeof processed) : processed;
        const patch = computePosterProjectPatch(base, processed);
        if (!patchIsEmpty(patch)) {
          const updated = await updateMyPosterProject({
            id: editId,
            patch,
            thumbnail: thumb,
            ifUnmodifiedSince: editUpdatedAt || undefined,
          });
          // Refresh conflict guard timestamp for next save
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('poster_edit_my_project_updated_at', updated.updatedAt ?? '');
          }
        }
      } else {
        await savePosterProjectToMyCloud({
          name: `Poster ${new Date().toLocaleString()}`,
          project: processed,
          thumbnail: thumb,
        });
      }

      // Set baseline to current after successful save(s)
      lastCloudSaveRef.current = JSON.stringify(processed);
    } finally {
      setSavingToCloud(false);
    }
  }, [user]);

  // Close AI chat when opening 3D text modal (add or edit) so it does not appear in the 3D editor
  useEffect(() => {
    if (threeTextModal) setAiChatOpen(false);
  }, [threeTextModal]);

  const handleCanvasSizeSelect = (width: number, height: number) => {
    setCanvasSize(width, height);
    setShowCanvasSizeModal(false);
  };

  const beginTemplateAuthoring = useCallback(() => {
    setTemplateAuthoring({
      templateId: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: 'My template',
      category: 'general',
      description: undefined,
      fields: [],
    });
    skipAutoOpenForIdRef.current = null;
    setLabelTargetId(null);
  }, []);

  const cancelTemplateAuthoring = useCallback(() => {
    setTemplateAuthoring(null);
    setSaveTemplateModalOpen(false);
    setLabelTargetId(null);
    skipAutoOpenForIdRef.current = null;
  }, []);

  const closeLabelModal = useCallback(() => {
    const id = labelTargetId;
    setLabelTargetId(null);
    if (id) skipAutoOpenForIdRef.current = id;
  }, [labelTargetId]);

  useEffect(() => {
    if (!templateAuthoring) {
      skipAutoOpenForIdRef.current = null;
      return;
    }
    if (labelTargetId !== null) return;

    if (selectedIds.length !== 1) {
      skipAutoOpenForIdRef.current = null;
      return;
    }

    const id = selectedIds[0];
    if (skipAutoOpenForIdRef.current === id) return;

    const el = elements.find((e) => e.id === id);
    if (!el || (el.type !== 'text' && el.type !== 'image')) return;

    setLabelTargetId(id);
  }, [templateAuthoring, selectedIds, elements, labelTargetId]);

  const labelTargetEl =
    labelTargetId != null ? elements.find((e) => e.id === labelTargetId) : undefined;
  const labelModalOpen = Boolean(
    templateAuthoring &&
      labelTargetId &&
      labelTargetEl &&
      (labelTargetEl.type === 'text' || labelTargetEl.type === 'image')
  );
  const labelFieldKind = labelTargetEl?.type === 'image' ? 'image' : 'text';
  const labelTextEl = labelModalOpen && labelTargetEl?.type === 'text' ? (labelTargetEl as PosterTextElement) : null;
  const labelImageEl = labelModalOpen && labelTargetEl?.type === 'image' ? (labelTargetEl as PosterImageElement) : null;

  // Clipboard & keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+D, Ctrl+Z, Ctrl+Y, Ctrl+A, Delete)
  const clipboardRef = useRef<PosterElement[]>([]);
  const duplicateElements = usePosterStore((s) => s.duplicateElements);
  const removeElements = usePosterStore((s) => s.removeElements);
  const pushHistory = usePosterStore((s) => s.pushHistory);
  const undo = usePosterStore((s) => s.undo);
  const redo = usePosterStore((s) => s.redo);
  const setSelected = usePosterStore((s) => s.setSelected);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnly) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      const ctrl = e.ctrlKey || e.metaKey;
      const { selectedIds, elements: els } = usePosterStore.getState();

      // Undo / Redo (skip when typing in inputs)
      if (!inInput) {
        if (ctrl && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (ctrl && e.key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (inInput) return;

      // Cut
      if (ctrl && e.key === 'x') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        clipboardRef.current = els.filter((el) => selectedIds.includes(el.id));
        pushHistory();
        removeElements(selectedIds);
        return;
      }

      // Copy
      if (ctrl && e.key === 'c') {
        if (selectedIds.length === 0) return;
        clipboardRef.current = els.filter((el) => selectedIds.includes(el.id));
        return;
      }

      // Paste
      if (ctrl && e.key === 'v') {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        const store = usePosterStore.getState();
        store.pushHistory();
        const maxZ = Math.max(0, ...store.elements.map((el) => el.zIndex));
        const newIds: string[] = [];
        const newEls = clipboardRef.current.map((el, i) => {
          const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          newIds.push(id);
          return { ...JSON.parse(JSON.stringify(el)), id, left: el.left + 20, top: el.top + 20, zIndex: maxZ + 1 + i };
        });
        usePosterStore.setState((s) => ({
          elements: [...s.elements, ...newEls],
          selectedIds: newIds,
        }));
        return;
      }

      // Duplicate
      if (ctrl && e.key === 'd') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        duplicateElements(selectedIds);
        return;
      }

      // Select all
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        if (els.length > 0) setSelected(els.map((el) => el.id));
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        removeElements(selectedIds);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [readOnly, duplicateElements, removeElements, pushHistory, undo, redo, setSelected]);

  const reservedKeysForLabel = new Set(
    (templateAuthoring?.fields ?? [])
      .filter((f) => f.sourceElementId !== labelTargetId)
      .map((f) => f.key.trim())
  );
  const existingBindingForLabel = templateAuthoring?.fields.find(
    (f) => f.sourceElementId === labelTargetId
  );

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {readOnly && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <span className="hidden sm:inline">Explore the poster editor. Login to edit, download, and use AI features.</span>
          <span className="sm:hidden">Login to edit and use AI features.</span>
          <Link
            to="/login"
            className="rounded bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-500"
          >
            Login
          </Link>
        </div>
      )}
      <PosterTopBar
        readOnly={readOnly}
        onOpenCanvasSize={() => setShowCanvasSizeModal(true)}
        onOpenAiWizard={() => setAiWizardOpen(true)}
        onOpenAiChat={() => setAiChatOpen(true)}
        onBeginTemplateAuthoring={beginTemplateAuthoring}
        templateAuthoringActive={!!templateAuthoring}
        onSaveToCloud={user ? handleSaveToCloud : undefined}
        cloudDirty={cloudDirty}
        savingToCloud={savingToCloud}
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeftSidebar={() => setLeftOpen((v) => !v)}
        onToggleRightSidebar={() => setRightOpen((v) => !v)}
      />
      {templateAuthoring && (
        <TemplateAuthoringBanner
          fieldCount={templateAuthoring.fields.length}
          onCancel={cancelTemplateAuthoring}
          onSaveTemplate={() => {
            if (labelTargetId) skipAutoOpenForIdRef.current = labelTargetId;
            setLabelTargetId(null);
            setSaveTemplateModalOpen(true);
          }}
        />
      )}
      {templateAuthoring && (
        <SavePosterTemplateModal
          open={saveTemplateModalOpen}
          onClose={() => setSaveTemplateModalOpen(false)}
          onSaved={() => {
            setSaveTemplateModalOpen(false);
            setTemplateAuthoring(null);
            setLabelTargetId(null);
            skipAutoOpenForIdRef.current = null;
          }}
          template={{
            id: templateAuthoring.templateId,
            name: templateAuthoring.name,
            category: templateAuthoring.category,
            description: templateAuthoring.description,
            fields: templateAuthoring.fields,
          }}
          isCloudEdit={templateAuthoring.editSource === 'cloud'}
        />
      )}
      {labelModalOpen && labelTargetId && templateAuthoring && (labelTextEl || labelImageEl) && (
        <TemplateElementLabelModal
          open
          elementId={labelTargetId}
          fieldKind={labelFieldKind}
          textPreview={labelTextEl?.text ?? ''}
          imageSrcPreview={labelImageEl?.src ?? ''}
          existing={existingBindingForLabel}
          reservedKeys={reservedKeysForLabel}
          onClose={closeLabelModal}
          onSave={(binding) => {
            setTemplateAuthoring((a) => {
              if (!a) return a;
              const rest = a.fields.filter((f) => f.sourceElementId !== binding.sourceElementId);
              return { ...a, fields: [...rest, binding] };
            });
          }}
          onRemove={() => {
            setTemplateAuthoring((a) => {
              if (!a) return a;
              return { ...a, fields: a.fields.filter((f) => f.sourceElementId !== labelTargetId) };
            });
          }}
        />
      )}
      <PosterAiWizardModal open={aiWizardOpen} onClose={() => setAiWizardOpen(false)} />
      <PosterAiChatPanel open={aiChatOpen} onClose={() => setAiChatOpen(false)} />
      {showCanvasSizeModal && (
        <CanvasSizeModal
          onSelect={handleCanvasSizeSelect}
          onClose={elements.length > 0 ? () => setShowCanvasSizeModal(false) : undefined}
          currentWidth={canvasWidth}
          currentHeight={canvasHeight}
          isNewProject={elements.length === 0}
        />
      )}
      {/* Mobile backdrop — closes left sidebar drawer */}
      {leftOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setLeftOpen(false)}
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Left sidebar — fixed drawer on mobile/tablet, inline on desktop */}
        <aside
          className={[
            'flex flex-col overflow-y-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'fixed inset-y-0 left-0 z-40 w-64 pt-0 transition-transform duration-300 ease-in-out',
            'lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-56 lg:shrink-0 lg:translate-x-0 lg:transform-none lg:transition-none',
            leftOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <PosterLeftSidebar readOnly={readOnly} onOpen3DModal={(m) => setThreeTextModal(m)} />
        </aside>

        <main ref={mainRef} className="flex min-w-0 flex-1 overflow-hidden p-1 pb-9 sm:p-3 sm:pb-9 lg:overflow-auto lg:p-6 lg:pb-6">
          <PosterCanvas readOnly={readOnly} viewportWidth={viewportSize.width} viewportHeight={viewportSize.height} />
        </main>

        {/* Right sidebar — hidden on mobile, inline on desktop */}
        <aside className="hidden overflow-y-auto border-l border-zinc-200 bg-white lg:flex lg:w-64 lg:shrink-0 lg:flex-col dark:border-zinc-800 dark:bg-zinc-900">
          <PosterRightSidebar readOnly={readOnly} onOpenEdit3D={(id) => setThreeTextModal({ editId: id })} />
        </aside>
      </div>

      {/* Mobile bottom property bar — full right sidebar in a bottom sheet */}
      <MobilePropertyBar readOnly={readOnly} onOpenEdit3D={(id) => setThreeTextModal({ editId: id })} />
      {threeTextModal && (
        <ThreeTextModal
          mode={threeTextModal}
          onClose={() => setThreeTextModal(null)}
          onSendToPoster={(image, config) => {
            addElement({
              type: '3d-text',
              image,
              config,
              left: 100,
              top: 100,
              scaleX: 1,
              scaleY: 1,
              angle: 0,
              opacity: 1,
            });
            setThreeTextModal(null);
          }}
          onEditComplete={() => setThreeTextModal(null)}
        />
      )}
    </div>
  );
}
