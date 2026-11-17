import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'version-json',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version }) }); },
  }],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
