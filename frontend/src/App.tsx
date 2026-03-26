import { useEffect } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PosterLayout } from './poster/components/PosterLayout';
import { TemplateGalleryPage } from './poster/components/TemplateGalleryPage';
import { PosterMyStuffPage } from './poster/components/PosterMyStuffPage';
import { LoginPage } from './auth/LoginPage';
import { SignupPage } from './auth/SignupPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuthStore } from './auth/authStore';

function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<Navigate to="/poster" replace />} />
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
        <Route path="*" element={<Navigate to="/poster" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
