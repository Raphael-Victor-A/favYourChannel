import { createClient } from '@supabase/supabase-js';

// Precisam ser lidas de forma literal para o Next embutir no código do navegador.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** true quando as variáveis do Supabase foram configuradas */
export const supabaseConfigured = Boolean(url && key);

/** Login com Google aparece só se você ativar o provedor no Supabase e marcar esta variável */
export const googleLoginEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'true';

/** Cliente do Supabase no navegador (null se não configurado → app funciona só no modo local) */
export const supabase = supabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
