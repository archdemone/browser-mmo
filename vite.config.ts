import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    sourcemap: true,
  },
  esbuild: {
    keepNames: true,
    sourcemap: true,
  },
});

