'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Sessão do usuário logado.
 * - user: usuário atual ou null
 * - loading: true até sabermos se há sessão salva
 * - recovering: true quando o usuário chegou pelo link de "esqueci a senha"
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Importante: não chamar o Supabase dentro deste callback, só atualizar estado.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading, recovering, setRecovering };
}
