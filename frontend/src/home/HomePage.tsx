import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { UserMenu } from '../auth/UserMenu';
import { useAuthStore } from '../auth/authStore';
import { usePosterStore } from '../poster/store/posterStore';
import type { PosterTemplateDefinition } from '../poster/templateTypes';
import { recreateDesignFromImage } from '../poster/services/recreateDesignApi';

/** Typographic wordmark: script “Sanaa” + caps “Studio” on one line (shown on large screens next to mark). */
function HomeBrandWordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-row flex-wrap items-baseline gap-x-2 ${className}`}>
      <span
        className="text-[2.15rem] leading-none text-zinc-900 dark:text-zinc-50"
        style={{ fontFamily: "'Great Vibes', cursive", fontWeight: 400 }}
      >
        Sanaa
      </span>
      <span className="text-base font-semibold uppercase tracking-[0.26em] text-zinc-700 dark:text-zinc-300">
        Studio
      </span>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  church: 'from-gold-100 to-gold-200 dark:from-gold-900/40 dark:to-gold-800/20',
  conference: 'from-accent-100 to-accent-200 dark:from-accent-900/40 dark:to-accent-800/20',
  business: 'from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700',
  event: 'from-danger-100 to-danger-200 dark:from-danger-900/40 dark:to-danger-800/20',
  general: 'from-accent-50 to-gold-100 dark:from-accent-950/30 dark:to-gold-900/20',
};

const FALLBACK_GRADIENTS = [
  'from-accent-100 to-accent-200 dark:from-accent-900/40 dark:to-accent-800/20',
  'from-gold-100 to-gold-200 dark:from-gold-900/40 dark:to-gold-800/20',
  'from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700',
  'from-danger-100 to-danger-200 dark:from-danger-900/40 dark:to-danger-800/20',
  'from-accent-50 to-gold-100 dark:from-accent-950/30 dark:to-gold-900/20',
  'from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-600',
  'from-gold-50 to-accent-100 dark:from-gold-950/30 dark:to-accent-900/20',
  'from-danger-50 to-zinc-100 dark:from-danger-950/20 dark:to-zinc-800',
  'from-accent-200 to-accent-300 dark:from-accent-900/60 dark:to-accent-800/40',
  'from-gold-200 to-gold-300 dark:from-gold-900/60 dark:to-gold-800/40',
];

const FEATURES = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    colorClass: 'text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/50',
    title: 'AI-Powered Design',
    desc: 'Describe your vision and our AI generates professional designs, adjusts styles, and edits elements — just by chatting.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" />
      </svg>
    ),
    colorClass: 'text-gold-600 dark:text-gold-400 bg-gold-50 dark:bg-gold-950/30',
    title: '3D Text Effects',
    desc: 'Add stunning metallic, glass, and neon 3D text to your designs. Fully customizable with real-time preview.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    colorClass: 'text-danger-500 dark:text-danger-400 bg-danger-50 dark:bg-danger-950/30',
    title: 'Export & Share',
    desc: 'Export high-quality PNG files. Save projects to the cloud and access them from anywhere, any time.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    colorClass: 'text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/50',
    title: 'Image Effects',
    desc: 'Import images, remove backgrounds, apply masks, textures, and image adjustments for professional results.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    colorClass: 'text-gold-600 dark:text-gold-400 bg-gold-50 dark:bg-gold-950/30',
    title: 'Ready-Made Templates',
    desc: 'Start from professionally designed templates for posters, social media, invitations, business and more.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    colorClass: 'text-danger-500 dark:text-danger-400 bg-danger-50 dark:bg-danger-950/30',
    title: 'Shapes & Elements',
    desc: 'Add custom shapes, icons, and graphic elements. Full control over fill, border, effects and layering.',
  },
];

function TemplateCard({ template, index }: { template: PosterTemplateDefinition; index: number }) {
  const gradient = CATEGORY_COLORS[template.category] ?? FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
  return (
    <Link
      to="/poster/templates"
      className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-accent-500"
    >
      {template.thumbnail ? (
        <img
          src={template.thumbnail}
          alt={template.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className={`flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br p-3 ${gradient}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60 dark:bg-black/20">
            <svg className="h-4 w-4 text-zinc-600 dark:text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <span className="line-clamp-2 text-center text-xs font-medium text-zinc-700 dark:text-zinc-300">{template.name}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-xs font-medium text-white">{template.name}</p>
      </div>
    </Link>
  );
}

function PlaceholderTemplateCard({ index }: { index: number }) {
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
  return (
    <Link
      to="/poster/templates"
      className="group aspect-[3/4] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-accent-500"
    >
      <div className={`h-full bg-gradient-to-br ${gradient}`} />
    </Link>
  );
}

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const templates = usePosterStore((s) => s.remotePosterTemplates);
  const refreshRemotePosterTemplates = usePosterStore((s) => s.refreshRemotePosterTemplates);
  const [recreateStatus, setRecreateStatus] = useState<string | null>(null);
  const recreateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshRemotePosterTemplates();
  }, [refreshRemotePosterTemplates]);

  const showcaseTemplates = templates.slice(0, 10);

  const handleRecreateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      setRecreateStatus('AI is analyzing your design…');
      const { project } = await recreateDesignFromImage(file, setRecreateStatus);
      usePosterStore.getState().loadProject(project);
      navigate('/poster');
    } catch (err) {
      setRecreateStatus(null);
      alert(err instanceof Error ? err.message : 'Failed to recreate design');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 lg:gap-3">
            <img src="/logo.png" alt="Sanaa Studio" className="h-9 w-auto shrink-0 rounded-xl shadow-md ring-1 ring-black/5 dark:shadow-lg dark:ring-white/10 lg:h-10" />
            <HomeBrandWordmark className="hidden lg:flex" />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 md:flex">
            <Link to="/poster/templates" className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
              Templates
            </Link>
            {user && (
              <Link to="/poster/my" className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
                My Designs
              </Link>
            )}
            <Link to="/3d" className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
              3D Text
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle size="md" />
            {user ? (
              <>
                <UserMenu compactUntilMd />
                <Link
                  to="/poster"
                  className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
                >
                  <span className="hidden sm:inline">Open Editor</span>
                  <span className="sm:hidden">Editor</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:block"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
                >
                  Get started
                </Link>
              </>
            )}
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 md:hidden"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
            <div className="flex flex-col gap-1">
              <Link
                to="/poster/templates"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Templates
              </Link>
              {user && (
                <Link
                  to="/poster/my"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  My Designs
                </Link>
              )}
              <Link
                to="/3d"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                3D Text
              </Link>
              {!user && (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-zinc-900 px-4 py-16 dark:bg-zinc-950 sm:py-20 md:py-24">
        {/* Background gradient accents */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-900/50 via-zinc-900 to-gold-950/30 dark:from-accent-950/70 dark:via-zinc-950 dark:to-gold-950/40" />
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent-800/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-gold-800/15 blur-3xl" />

        <div className="relative mx-auto max-w-5xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent-900/60 px-4 py-1.5 text-sm font-medium text-accent-300 ring-1 ring-accent-700/60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
            AI-Powered Design
          </div>

          <h1 className="mb-5 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Design anything.{' '}
            <span className="bg-gradient-to-r from-accent-400 to-gold-300 bg-clip-text text-transparent">
              Express everything.
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-base text-zinc-400 sm:text-lg">
            Create stunning posters, social graphics, and more with AI assistance, professional templates, and real-time 3D text effects.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/poster"
              className="w-full rounded-xl bg-accent-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent-900/40 transition-colors hover:bg-accent-500 sm:w-auto"
            >
              Start Designing — Free
            </Link>
            <Link
              to="/poster"
              state={{ openAiWizard: true }}
              className="w-full rounded-xl border border-accent-500 bg-accent-900/40 px-8 py-3.5 text-base font-semibold text-accent-200 shadow-lg transition-colors hover:bg-accent-800/60 sm:w-auto"
            >
              <span className="mr-1.5 inline-block">
                <svg className="inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </span>
              Create with AI
            </Link>
            <button
              type="button"
              onClick={() => recreateInputRef.current?.click()}
              disabled={!!recreateStatus}
              className="w-full rounded-xl border border-gold-500 bg-gold-900/30 px-8 py-3.5 text-base font-semibold text-gold-200 shadow-lg transition-colors hover:bg-gold-800/50 disabled:opacity-60 sm:w-auto"
            >
              <span className="mr-1.5 inline-block">
                <svg className="inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              {recreateStatus || 'Recreate from Image'}
            </button>
            <input
              ref={recreateInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleRecreateUpload}
            />
            <Link
              to="/poster/templates"
              className="w-full rounded-xl border border-zinc-600 px-8 py-3.5 text-base font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 sm:w-auto"
            >
              Browse Templates
            </Link>
          </div>

          {/* Editor mockup */}
          <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-zinc-700 shadow-2xl">
            {/* Fake toolbar */}
            <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-zinc-800/90 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-danger-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-gold-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent-400/70" />
              <span className="ml-3 text-xs font-medium text-zinc-500">Sanaa Studio Editor</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden h-4 w-16 rounded bg-zinc-700 sm:block" />
                <span className="h-4 w-20 rounded bg-zinc-700" />
                <span className="h-5 w-14 rounded bg-accent-600/60" />
              </div>
            </div>

            {/* Fake editor body */}
            <div className="flex bg-zinc-800" style={{ height: 'clamp(150px, 42vw, 320px)' }}>
              {/* Left panel */}
              <div className="flex w-9 shrink-0 flex-col gap-1.5 border-r border-zinc-700 bg-zinc-900 p-1.5 sm:w-12 sm:gap-2 sm:p-2 md:w-16">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-4 rounded bg-zinc-700/60 sm:h-5 md:h-6" />
                ))}
              </div>
              {/* Canvas area */}
              <div className="flex flex-1 items-center justify-center p-2 sm:p-4 md:p-6">
                <div className="flex w-[68%] max-w-[11rem] items-center justify-center rounded-lg border border-zinc-600 bg-gradient-to-br from-accent-800/50 to-zinc-700 shadow-lg sm:w-[72%] sm:max-w-[15rem] md:max-w-xs lg:max-w-sm" style={{ aspectRatio: '4/3' }}>
                  <div className="text-center">
                    <p className="text-base font-black tracking-tight text-white/90 drop-shadow sm:text-xl md:text-2xl lg:text-3xl">
                      YOUR DESIGN
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-400 sm:text-xs md:text-sm">Canvas preview</p>
                  </div>
                </div>
              </div>
              {/* Right panel */}
              <div className="flex w-9 shrink-0 flex-col gap-1.5 border-l border-zinc-700 bg-zinc-900 p-1.5 sm:w-12 sm:gap-2 sm:p-2 md:w-16 lg:w-20">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-4 rounded bg-zinc-700/60 sm:h-5" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-zinc-50 px-4 py-14 dark:bg-zinc-950 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              Everything you need to create
            </h2>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">
              Professional tools built for creators of all skill levels
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white p-2.5 text-center transition-colors hover:border-zinc-300 sm:min-h-[9.5rem] sm:p-3 lg:min-h-[14rem] lg:rounded-2xl lg:p-6 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className={`mb-2 inline-flex rounded-lg p-1.5 sm:mb-3 sm:p-2 lg:mb-4 lg:rounded-xl lg:p-2.5 ${f.colorClass}`}>
                  {f.icon}
                </div>
                <h3 className="line-clamp-2 text-center text-xs font-semibold text-zinc-900 sm:text-sm lg:mb-2 lg:text-base dark:text-zinc-100">
                  {f.title}
                </h3>
                <p className="mt-1 hidden text-center text-sm leading-relaxed text-zinc-500 lg:block dark:text-zinc-400">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Template showcase ── */}
      <section className="bg-zinc-100 px-4 py-14 dark:bg-zinc-900 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
                Start with a template
              </h2>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                Professionally designed, ready for your touch
              </p>
            </div>
            <Link
              to="/poster/templates"
              className="hidden rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:block"
            >
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {showcaseTemplates.length > 0
              ? showcaseTemplates.map((t, i) => <TemplateCard key={t.id} template={t} index={i} />)
              : [...Array(10)].map((_, i) => <PlaceholderTemplateCard key={i} index={i} />)}
          </div>

          <div className="mt-6 text-center sm:hidden">
            <Link
              to="/poster/templates"
              className="inline-block rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              View all templates →
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-accent-600 px-4 py-14 dark:bg-accent-800 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Start creating for free
          </h2>
          <p className="mt-3 text-base text-accent-100 sm:text-lg">
            Join thousands of creators. No credit card required.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to={user ? '/poster' : '/signup'}
              className="w-full rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-accent-700 shadow-lg transition-colors hover:bg-accent-50 sm:w-auto"
            >
              {user ? 'Open Editor' : 'Sign up free'}
            </Link>
            <Link
              to="/poster/templates"
              className="w-full rounded-xl border-2 border-accent-400 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-500 sm:w-auto"
            >
              Browse templates
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-200 bg-white px-4 py-10 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <Link to="/" className="flex items-center gap-2 lg:gap-3">
              <img src="/logo.png" alt="Sanaa Studio" className="h-8 w-auto shrink-0 rounded-xl shadow-md ring-1 ring-black/5 dark:shadow-lg dark:ring-white/10 lg:h-9" />
              <HomeBrandWordmark className="flex" />
            </Link>

            <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link to="/poster" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                Editor
              </Link>
              <Link to="/poster/templates" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                Templates
              </Link>
              <Link to="/3d" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                3D Text
              </Link>
              {!user && (
                <>
                  <Link to="/login" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                    Login
                  </Link>
                  <Link to="/signup" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                    Sign up
                  </Link>
                </>
              )}
            </nav>

            <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Sanaa Studio. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
