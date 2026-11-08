'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const LS_CHANNELS = 'meus-canais:channels';
const LS_WATCHED = 'meus-canais:watched';
const LS_PREFS = 'meus-canais:prefs';
const LS_LAST_VISIT = 'meus-canais:lastVisit';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
function timeAgo(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return 'agora mesmo';
}

const nf = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
function formatViews(n) {
  if (n == null) return null;
  return `${nf.format(n)} visualizaç${n === 1 ? 'ão' : 'ões'}`;
}

function Avatar({ channel }) {
  if (channel?.avatar) return <img src={channel.avatar} alt="" referrerPolicy="no-referrer" />;
  const letter = (channel?.title || '?').trim().charAt(0).toUpperCase();
  return <span className="avatar-fallback">{letter}</span>;
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [channels, setChannels] = useState([]);
  const [watched, setWatched] = useState({});
  const [prefs, setPrefs] = useState({ hideShorts: false, hideWatched: false });
  const [prevVisit, setPrevVisit] = useState(null);

  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState('');

  const [videos, setVideos] = useState([]);
  const [feedErrors, setFeedErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);

  const [activeChannel, setActiveChannel] = useState(null);
  const [playing, setPlaying] = useState(null);

  // Carrega do localStorage
  useEffect(() => {
    setChannels(load(LS_CHANNELS, []));
    setWatched(load(LS_WATCHED, {}));
    setPrefs((p) => ({ ...p, ...load(LS_PREFS, {}) }));
    setPrevVisit(load(LS_LAST_VISIT, null));
    save(LS_LAST_VISIT, new Date().toISOString());
    setReady(true);
  }, []);

  useEffect(() => { if (ready) save(LS_CHANNELS, channels); }, [channels, ready]);
  useEffect(() => { if (ready) save(LS_WATCHED, watched); }, [watched, ready]);
  useEffect(() => { if (ready) save(LS_PREFS, prefs); }, [prefs, ready]);

  const channelIds = useMemo(() => channels.map((c) => c.id).join(','), [channels]);
  const reqId = useRef(0);

  const loadFeed = useCallback(async (force = false) => {
    if (!channelIds) {
      setVideos([]);
      setFeedErrors([]);
      return;
    }
    const my = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?ids=${encodeURIComponent(channelIds)}${force ? '&force=1' : ''}`);
      const data = await res.json();
      if (my !== reqId.current) return;
      setVideos(data.videos || []);
      setFeedErrors(data.errors || []);
      setFetchedAt(data.fetchedAt);
    } catch {
      if (my === reqId.current) setFeedErrors([{ channelId: '*', error: 'Falha de rede ao buscar o feed.' }]);
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [channelIds]);

  useEffect(() => { if (ready) loadFeed(); }, [ready, loadFeed]);

  async function addChannel(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setAdding(true);
    setFormError('');
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao adicionar canal.');
      if (channels.some((c) => c.id === data.id)) {
        setFormError(`"${data.title}" já está na sua lista.`);
      } else {
        setChannels((cs) => [...cs, data]);
        setInput('');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setAdding(false);
    }
  }

  function removeChannel(id) {
    const ch = channels.find((c) => c.id === id);
    if (!confirm(`Remover "${ch?.title}" dos seus canais?`)) return;
    setChannels((cs) => cs.filter((c) => c.id !== id));
    if (activeChannel === id) setActiveChannel(null);
  }

  function openVideo(v) {
    setPlaying(v);
    setWatched((w) => ({ ...w, [v.id]: Date.now() }));
  }

  function toggleWatched(v, e) {
    e.stopPropagation();
    setWatched((w) => {
      const next = { ...w };
      if (next[v.id]) delete next[v.id];
      else next[v.id] = Date.now();
      return next;
    });
  }

  // Fecha o player com ESC
  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => e.key === 'Escape' && setPlaying(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const channelMap = useMemo(() => Object.fromEntries(channels.map((c) => [c.id, c])), [channels]);

  const visible = videos.filter((v) => {
    if (!channelMap[v.channelId]) return false;
    if (activeChannel && v.channelId !== activeChannel) return false;
    if (prefs.hideShorts && v.isShort) return false;
    if (prefs.hideWatched && watched[v.id]) return false;
    return true;
  });

  const errorNames = feedErrors
    .map((e) => channelMap[e.channelId]?.title || e.channelId)
    .join(', ');

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo"><span className="logo-dot" /> Meus Canais</div>
          <form className="add-form" onSubmit={addChannel}>
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cole o link do canal, @handle ou ID…"
              aria-label="Adicionar canal"
            />
            <button className="btn btn-primary" disabled={adding || !input.trim()}>
              {adding ? 'Buscando…' : 'Adicionar'}
            </button>
          </form>
        </div>
        {formError && <div className="form-error">{formError}</div>}
      </header>

      <main className="container">
        {channels.length > 0 && (
          <>
            <nav className="channels">
              <button
                className={`chip all ${activeChannel ? '' : 'active'}`}
                onClick={() => setActiveChannel(null)}
              >
                Todos
              </button>
              {channels.map((c) => (
                <div
                  key={c.id}
                  className={`chip ${activeChannel === c.id ? 'active' : ''}`}
                  onClick={() => setActiveChannel(activeChannel === c.id ? null : c.id)}
                  title={c.title}
                >
                  <Avatar channel={c} />
                  <span>{c.title}</span>
                  <button
                    className="chip-remove"
                    aria-label={`Remover ${c.title}`}
                    onClick={(e) => { e.stopPropagation(); removeChannel(c.id); }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </nav>

            <div className="toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={prefs.hideShorts}
                  onChange={(e) => setPrefs((p) => ({ ...p, hideShorts: e.target.checked }))}
                />
                Esconder Shorts
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={prefs.hideWatched}
                  onChange={(e) => setPrefs((p) => ({ ...p, hideWatched: e.target.checked }))}
                />
                Esconder assistidos
              </label>
              <span className="spacer" />
              {fetchedAt && !loading && <span>Atualizado {timeAgo(fetchedAt)}</span>}
              <button className="btn" onClick={() => loadFeed(true)} disabled={loading}>
                {loading ? 'Atualizando…' : '↻ Atualizar'}
              </button>
            </div>

            {feedErrors.length > 0 && (
              <div className="warn">Não consegui carregar: {errorNames}. Tente atualizar daqui a pouco.</div>
            )}
          </>
        )}

        {ready && channels.length === 0 && (
          <div className="empty">
            <h2>Nenhum canal ainda</h2>
            <p>
              Adicione canais no campo lá em cima: pode ser o link (<code>youtube.com/@canal</code>),
              o <code>@handle</code>, o ID (<code>UC…</code>) ou até o link de um vídeo do canal.
            </p>
          </div>
        )}

        {loading && videos.length === 0 && channels.length > 0 && (
          <div className="grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="card skeleton" key={i}>
                <div className="thumb" />
                <div className="line" style={{ width: '90%' }} />
                <div className="line" style={{ width: '60%' }} />
              </div>
            ))}
          </div>
        )}

        {channels.length > 0 && !loading && visible.length === 0 && (
          <div className="empty"><p>Nenhum vídeo para mostrar com esses filtros.</p></div>
        )}

        <div className="grid">
          {visible.map((v) => {
            const ch = channelMap[v.channelId];
            const isNew = prevVisit && new Date(v.published) > new Date(prevVisit) && !watched[v.id];
            const views = formatViews(v.views);
            return (
              <article
                key={v.id}
                className={`card ${watched[v.id] ? 'watched' : ''}`}
                onClick={() => openVideo(v)}
              >
                <div className="thumb">
                  <img src={v.thumbnail} alt="" loading="lazy" />
                  {isNew && <span className="badge new">NOVO</span>}
                  {watched[v.id] && <span className="badge seen">✓ Assistido</span>}
                  {v.isShort && <span className="badge">SHORTS</span>}
                  {!v.isShort && v.duration && <span className="badge">{v.duration}</span>}
                </div>
                <div className="meta">
                  <Avatar channel={ch} />
                  <div>
                    <h3 className="title" title={v.title}>{v.title}</h3>
                    <div className="sub">{ch?.title || v.channelTitle}</div>
                    <div className="sub">
                      {views && <>{views} · </>}
                      <span title={v.exactDate ? new Date(v.published).toLocaleString('pt-BR') : 'data aproximada'}>
                        {timeAgo(v.published)}
                      </span>
                      {' · '}
                      <a href="#" onClick={(e) => { e.preventDefault(); toggleWatched(v, e); }}>
                        {watched[v.id] ? 'desmarcar' : 'marcar visto'}
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {playing && (
        <div className="overlay" onClick={() => setPlaying(null)}>
          <div className="player" onClick={(e) => e.stopPropagation()}>
            <div className="player-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.id}?autoplay=1&rel=0`}
                title={playing.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
            <div className="player-bar">
              <h3>{playing.title}</h3>
              <a className="btn" href={playing.link} target="_blank" rel="noreferrer">Abrir no YouTube</a>
              <button className="btn" onClick={() => setPlaying(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
