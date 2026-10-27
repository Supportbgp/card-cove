import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Playwright's E2E suite runs the real app (main.jsx/App.jsx/BinderView.jsx,
// unmodified) against a mocked Supabase client instead of the live backend —
// see src/test/harness/mockSupabaseClient.js and CLAUDE.md's testing section.
// `vite --mode harness` (only ever invoked by playwright.config.js) swaps in
// that mock via this alias; a normal `vite`/`vite build` never sets this mode,
// so production always gets the real src/lib/supabase.js.
//
// `vite --mode staging` (npm run dev:staging / build:staging) loads
// .env.staging, which points the app at the staging Supabase project, and
// serves it under /card-cove/staging/ (see CLAUDE.md's "Staging
// environment"). The build stops here if .env.staging still has its
// placeholders, rather than producing a staging site that can't connect.
export default defineConfig(({ mode }) => {
  if (mode === 'staging') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
      .filter((k) => !env[k] || env[k].includes('YOUR_'));
    if (missing.length) throw new Error(`.env.staging is missing real values for ${missing.join(', ')}`);
  }
  return {
    base: mode === 'staging' ? '/card-cove/staging/' : '/card-cove/',
    plugins: [react()],
    resolve: mode === 'harness' ? {
      // Exact-string aliases, not a regex — every relative form actually used
      // in the codebase (`./supabase.js`, `./lib/supabase.js`,
      // `../lib/supabase.js`) needs its own entry since @rollup/plugin-alias
      // matches the literal import specifier as written, not a resolved path.
      alias: ['./supabase.js', './lib/supabase.js', '../lib/supabase.js'].map((find) => ({
        find,
        replacement: fileURLToPath(new URL('./src/test/harness/mockSupabaseClient.js', import.meta.url)),
      })),
    } : undefined,
  };
});
