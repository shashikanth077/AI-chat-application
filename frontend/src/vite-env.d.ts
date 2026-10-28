/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "true" builds the self-contained demo: simulated AI, data kept in the browser, no backend. */
  readonly VITE_DEMO?: string;
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_PORTFOLIO_URL?: string;
}
