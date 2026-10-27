// Which environment this build talks to. A normal build (npm run build /
// npm run dev) is production; `vite --mode staging` loads .env.staging and
// points the whole app at the staging Supabase project instead (see the
// "Staging environment" section in CLAUDE.md).
export const APP_ENV = import.meta.env.VITE_APP_ENV === 'staging' ? 'staging' : 'production';
export const IS_STAGING = APP_ENV === 'staging';
