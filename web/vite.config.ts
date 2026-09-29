/**
 * Interface web du simulateur (Vite + React). `npm run web:build` produit `web/dist/index.html`, FICHIER UNIQUE
 * (vite-plugin-singlefile) : JS, CSS, données du jeu, worker du planificateur et synthèse des résultats inlinés.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { extractResults } from './src/model/resultsExtract';

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, '../sim/results');

/** Module virtuel `virtual:resultats` : synthèse compacte de sim/results/*.json (sans les combats bruts). */
function resultsPlugin(): Plugin {
  const id = 'virtual:resultats';
  const resolved = '\0' + id;
  return {
    name: 'gladiatrool-resultats',
    resolveId(source) {
      return source === id ? resolved : null;
    },
    load(source) {
      if (source !== resolved) return null;
      const files = readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort();
      const raw = files.map((f) => {
        this.addWatchFile(resolve(resultsDir, f));
        return JSON.parse(readFileSync(resolve(resultsDir, f), 'utf8'));
      });
      return `export default ${JSON.stringify(extractResults(raw))};`;
    },
  };
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [react(), resultsPlugin(), viteSingleFile({ removeViteModuleLoader: true })],
  // worker classique (iife) : un worker « module » depuis une URL blob échoue dans un cadre à origine opaque (iframe sandboxée, file://)
  worker: { format: 'iife' },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: 100_000_000,
  },
  server: { fs: { allow: [resolve(here, '..')] } },
});
