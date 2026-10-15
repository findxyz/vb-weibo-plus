import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.API_PROXY_TARGET || 'http://127.0.0.1:18080';
  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_API_PROXY_TARGET': JSON.stringify(backendUrl) },
    server: {
      strictPort: true,
      proxy: {
        '^/post/(?:bloggers|calendar|list|image|video-cover)(?:\\?.*)?$': {
          target: backendUrl,
        },
      },
    },
    build: {
      outDir: '../target/generated-resources/frontend',
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          post: fileURLToPath(new URL('./preview/post/index.html', import.meta.url)),
          chat: fileURLToPath(new URL('./preview/chat/index.html', import.meta.url)),
        },
      },
    },
  };
});
