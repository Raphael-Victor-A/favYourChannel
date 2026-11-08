'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const LS_CHANNELS = 'meus-canais:channels';

function readLocal() {
  try {
    const v = localStorage.getItem(LS_CHANNELS);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}
function writeLocal(list) {
  try {
    if (list.length) localStorage.setItem(LS_CHANNELS, JSON.stringify(list));
    else localStorage.removeItem(LS_CHANNELS);
  } catch {}
}

const fromRow = (r) => ({ id: r.channel_id, title: r.title, avatar: r.avatar });
const toRow = (c) => ({ channel_id: c.id, title: c.title, avatar: c.avatar ?? null });

/**
 * Lista de canais favoritos.
 * - Sem login: fica no localStorage deste navegador.
 * - Com login: fica na conta (tabela `channels` do Supabase).
 *   No primeiro login, canais salvos localmente são enviados para a conta.
 */
export function useChannels(user, authLoading) {
  const [channels, setChannels] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState(0);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setReady(false);
    setError('');

    (async () => {
      if (!userId || !supabase) {
        if (!cancelled) {
          setChannels(readLocal());
          setReady(true);
        }
        return;
      }

      // Leva os canais do modo local para a conta (sem duplicar)
      const local = readLocal();
      if (local.length) {
        const { error: upErr } = await supabase
          .from('channels')
          .upsert(local.map((c) => ({ ...toRow(c), user_id: userId })), { onConflict: 'user_id,channel_id', ignoreDuplicates: true });
        if (!upErr) {
          writeLocal([]);
          if (!cancelled) setImported(local.length);
        }
      }

      const { data, error: selErr } = await supabase
        .from('channels')
        .select('channel_id, title, avatar')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (selErr) setError('Não consegui carregar seus canais: ' + selErr.message);
      setChannels((data || []).map(fromRow));
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  const addChannel = useCallback(
    async (channel) => {
      if (userId && supabase) {
        const { error: insErr } = await supabase.from('channels').insert({ ...toRow(channel), user_id: userId });
        if (insErr) throw new Error('Não consegui salvar na conta: ' + insErr.message);
      }
      setChannels((cs) => {
        const next = [...cs, channel];
        if (!userId) writeLocal(next);
        return next;
      });
    },
    [userId]
  );

  const removeChannel = useCallback(
    async (id) => {
      if (userId && supabase) {
        const { error: delErr } = await supabase.from('channels').delete().eq('channel_id', id);
        if (delErr) throw new Error('Não consegui remover da conta: ' + delErr.message);
      }
      setChannels((cs) => {
        const next = cs.filter((c) => c.id !== id);
        if (!userId) writeLocal(next);
        return next;
      });
    },
    [userId]
  );

  return { channels, ready, error, imported, clearImported: () => setImported(0), addChannel, removeChannel };
}
