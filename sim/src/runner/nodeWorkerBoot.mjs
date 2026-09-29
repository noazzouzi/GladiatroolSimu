// Amorce du worker Node du runner : enregistre le chargeur TypeScript de tsx (API programmatique, fiable dans un
// worker, contrairement à « --import tsx » qu'ignore le chargement du module d'entrée), puis charge nodeWorker.ts.
// NODE UNIQUEMENT.
import { register } from 'tsx/esm/api';

register();
await import('./nodeWorker.ts');
