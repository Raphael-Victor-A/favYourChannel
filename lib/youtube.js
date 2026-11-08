// Helpers do lado do servidor para falar com o YouTube sem chave de API.

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

// Cookie que evita a página de consentimento (relevante fora do Brasil, ex.: Europa)
const YT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Cookie: 'SOCS=CAI; CONSENT=YES+1',
};

export function isChannelId(s) {
  return CHANNEL_ID_RE.test(s);
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function tagText(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1].trim()) : null;
}

/**
 * Transforma o que o usuário digitou (link, @handle, ID) numa URL de página do YouTube.
 */
function inputToUrl(raw) {
  const q = raw.trim();
  if (isChannelId(q)) return `https://www.youtube.com/channel/${q}`;
  if (q.startsWith('@')) return `https://www.youtube.com/${encodeURI(q)}`;
  if (/^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(q)) {
    return q.startsWith('http') ? q : `https://${q}`;
  }
  // Palavra solta: tratamos como handle
  if (/^[\w.-]+$/.test(q)) return `https://www.youtube.com/@${q}`;
  return null;
}

/**
 * Descobre ID, nome e avatar de um canal a partir de link / @handle / ID / link de vídeo.
 */
export async function resolveChannel(raw) {
  const url = inputToUrl(raw);
  if (!url) throw new Error('Formato não reconhecido. Use um link do canal, @handle ou ID (UC...).');

  let id = isChannelId(raw.trim()) ? raw.trim() : null;
  let title = null;
  let avatar = null;

  const res = await fetch(url, { headers: YT_HEADERS, cache: 'no-store' });
  if (res.ok) {
    const html = await res.text();
    const isVideoPage = /\/watch|youtu\.be\/|\/shorts\//.test(url);

    if (!id && !isVideoPage) {
      id =
        html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ||
        html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ||
        html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)?.[1] ||
        null;
    }
    if (!id && isVideoPage) {
      id = html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] || null;
    }

    if (!isVideoPage) {
      title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? null;
      avatar = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? null;
      if (title) title = decodeEntities(title);
      if (avatar) avatar = decodeEntities(avatar);
    }
  } else if (!id) {
    throw new Error(`Canal não encontrado (YouTube respondeu ${res.status}).`);
  }

  if (!id) throw new Error('Não consegui descobrir o ID desse canal.');

  if (!title) {
    // Ex.: link de vídeo — pega o nome do canal pela listagem
    const feed = await getChannelVideos(id);
    title = feed.title;
    avatar = avatar || feed.avatar || null;
  }
  return { id, title: title || id, avatar };
}

// ---------------------------------------------------------------------------
// Busca de vídeos: tenta API oficial (se houver chave) -> RSS -> página do canal
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // channelId -> { at, data }

/**
 * Retorna { title, avatar?, source, videos: [...] } com os vídeos mais recentes do canal.
 * Resultado fica 10 min em cache na memória do servidor.
 */
export async function getChannelVideos(channelId, { force = false } = {}) {
  const hit = cache.get(channelId);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const strategies = [];
  if (process.env.YOUTUBE_API_KEY) strategies.push(fetchViaApi);
  strategies.push(fetchViaRss, fetchViaChannelPage);

  const errors = [];
  for (const fn of strategies) {
    try {
      const data = await fn(channelId);
      cache.set(channelId, { at: Date.now(), data });
      return data;
    } catch (err) {
      errors.push(`${fn.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

/** 1) YouTube Data API v3 — datas exatas. Custa ~1 unidade de cota por canal. */
async function fetchViaApi(channelId) {
  const key = process.env.YOUTUBE_API_KEY;
  const uploads = 'UU' + channelId.slice(2);
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${uploads}&key=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API respondeu ${res.status}`);
  const data = await res.json();
  const items = data.items || [];
  const title = items[0]?.snippet?.channelTitle || null;
  return {
    title,
    source: 'api',
    videos: items.map((it) => {
      const id = it.contentDetails.videoId;
      return {
        id,
        title: it.snippet.title,
        published: it.contentDetails.videoPublishedAt || it.snippet.publishedAt,
        exactDate: true,
        link: `https://www.youtube.com/watch?v=${id}`,
        isShort: false,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        views: null,
        duration: null,
        channelId,
        channelTitle: title,
      };
    }),
  };
}

/** 3) Página /videos do canal — sem chave, datas aproximadas ("há 3 dias"). */
async function fetchViaChannelPage(channelId) {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/videos?hl=en&gl=US`, {
    headers: { ...YT_HEADERS, 'Accept-Language': 'en-US,en;q=0.9' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`página respondeu ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('ytInitialData não encontrado');
  const data = JSON.parse(m[1]);

  const meta = data?.metadata?.channelMetadataRenderer || {};
  const title = meta.title || null;
  const avatar = meta.avatar?.thumbnails?.[0]?.url || null;

  const lockups = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.lockupViewModel) lockups.push(o.lockupViewModel);
    else if (o.videoRenderer) lockups.push({ legacy: o.videoRenderer });
    for (const k in o) walk(o[k]);
  })(data?.contents);

  const now = Date.now();
  const videos = [];
  lockups.slice(0, 15).forEach((l, index) => {
    let id, vTitle, viewsLabel, agoLabel, duration;
    if (l.legacy) {
      const v = l.legacy;
      id = v.videoId;
      vTitle = v.title?.runs?.[0]?.text;
      viewsLabel = v.viewCountText?.simpleText;
      agoLabel = v.publishedTimeText?.simpleText;
      duration = v.lengthText?.simpleText;
    } else {
      if (l.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return;
      id = l.contentId;
      const md = l.metadata?.lockupMetadataViewModel;
      vTitle = md?.title?.content;
      const parts = (md?.metadata?.contentMetadataViewModel?.metadataRows || []).flatMap(
        (r) => r.metadataParts || []
      );
      const labels = parts.map((p) => p.accessibilityLabel || p.text?.content || '');
      viewsLabel = labels.find((s) => /view/i.test(s));
      agoLabel = labels.find((s) => /ago/i.test(s));
      const badges = [];
      (function walkBadges(o) {
        if (!o || typeof o !== 'object') return;
        if (o.thumbnailBadgeViewModel?.text) badges.push(o.thumbnailBadgeViewModel.text);
        for (const k in o) walkBadges(o[k]);
      })(l.contentImage);
      duration = badges.find((t) => /^\d+(:\d{2})+$/.test(t)) || null;
    }
    if (!id || !agoLabel) return; // ignora agendados/estreias sem data
    // Mantém a ordem do canal dentro do mesmo "balde" de tempo
    const published = new Date(parseAgo(agoLabel, now) - index * 1000).toISOString();
    videos.push({
      id,
      title: vTitle,
      published,
      exactDate: false,
      link: `https://www.youtube.com/watch?v=${id}`,
      isShort: false,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      views: parseViews(viewsLabel),
      duration,
      channelId,
      channelTitle: title,
    });
  });

  if (videos.length === 0) throw new Error('nenhum vídeo encontrado na página');
  return { title, avatar, source: 'page', videos };
}

function parseAgo(label, now) {
  const m = label.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return now;
  const secs = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  return now - Number(m[1]) * secs[m[2].toLowerCase()] * 1000;
}

function parseViews(label) {
  if (!label) return null;
  if (/no views/i.test(label)) return 0;
  const m = label.replace(/,/g, '').match(/([\d.]+)\s*(thousand|million|billion|K|M|B)?/i);
  if (!m) return null;
  const mult = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9 };
  return Math.round(Number(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1));
}

/** 2) Feed RSS público (últimos ~15 vídeos, datas exatas). Às vezes o YouTube deixa fora do ar. */
async function fetchViaRss(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: YT_HEADERS,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RSS respondeu ${res.status}`);
  const xml = await res.text();

  const head = xml.split('<entry>')[0];
  const channelTitle = tagText(head, 'title');

  const entries = xml.split('<entry>').slice(1).map((chunk) => chunk.split('</entry>')[0]);
  const videos = entries.map((e) => {
    const videoId = tagText(e, 'yt:videoId');
    const link = e.match(/<link rel="alternate" href="([^"]+)"/)?.[1] || `https://www.youtube.com/watch?v=${videoId}`;
    const views = e.match(/<media:statistics views="(\d+)"/)?.[1];
    return {
      id: videoId,
      title: tagText(e, 'title'),
      published: tagText(e, 'published'),
      exactDate: true,
      link,
      isShort: link.includes('/shorts/'),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      views: views ? Number(views) : null,
      duration: null,
      channelId,
      channelTitle: tagText(e, 'name') || channelTitle,
    };
  });

  return { title: channelTitle, source: 'rss', videos };
}
