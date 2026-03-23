import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.BACKEND_PORT || env.API_PORT || env.PORT || '5174';
  const target = `http://127.0.0.1:${backendPort}`;

  const apiProxy = {
    '/api': {
      target,
      changeOrigin: true,
    },
  };

  return {
    root: __dirname,
    build: { outDir: 'dist' },
    plugins: [react()],
    server: {
      proxy: apiProxy,
    },
    preview: {
      proxy: apiProxy,
    },
  };
});
