import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { SignupPage } from './auth/SignupPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuthStore } from './auth/authStore';

const HomePage = lazy(() =>
  import('./home/HomePage').then((m) => ({ default: m.HomePage }))
);
const AppLayout = lazy(() =>
  import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout }))
);
const PosterLayout = lazy(() =>
  import('./poster/components/PosterLayout').then((m) => ({ default: m.PosterLayout }))
);
const TemplateGalleryPage = lazy(() =>
  import('./poster/components/TemplateGalleryPage').then((m) => ({
    default: m.TemplateGalleryPage,
  }))
);
const PosterMyStuffPage = lazy(() =>
  import('./poster/components/PosterMyStuffPage').then((m) => ({
    default: m.PosterMyStuffPage,
  }))
);

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
      <div className="text-zinc-500 dark:text-zinc-400">Loading…</div>
    </div>
  );
}

function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <HashRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/3d"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
          <Route path="/poster" element={<PosterLayout />} />
          <Route path="/poster/templates" element={<TemplateGalleryPage />} />
          <Route path="/poster/my" element={<PosterMyStuffPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

export default App;
