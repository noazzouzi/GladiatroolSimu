/// <reference types="vite/client" />

declare module 'virtual:resultats' {
  const results: Record<string, import('./model/resultsExtract').ExperimentSummary>;
  export default results;
}
