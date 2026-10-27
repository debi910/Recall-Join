import { defineConfig } from 'vite';
export default defineConfig({ root: 'web', envDir: '..', server: { fs: { allow: ['..'] } }, build: { outDir: 'dist', emptyOutDir: true } });
