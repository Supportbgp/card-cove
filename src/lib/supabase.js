import { createClient } from '@supabase/supabase-js';
import { IS_STAGING } from './appEnv.js';

// Production is hardcoded, as it always was. A staging build reads its
// project from .env.staging and never falls back to production: a missing
// value stops the app instead of quietly opening the live data.
const PROD_URL = "https://pkyeytypgifgyiartgii.supabase.co";
const PROD_ANON_KEY = "sb_publishable_lchh9HW3bAxH4-zzZERUWg_Fv0MtvGN";

if (IS_STAGING && (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
  throw new Error('Staging build is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env.staging).');
}

export const SUPABASE_URL = IS_STAGING ? import.meta.env.VITE_SUPABASE_URL : PROD_URL;
export const SUPABASE_ANON_KEY = IS_STAGING ? import.meta.env.VITE_SUPABASE_ANON_KEY : PROD_ANON_KEY;
export const SHARED_LOGIN_EMAIL = "rafaelromero.dev@gmail.com";

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
