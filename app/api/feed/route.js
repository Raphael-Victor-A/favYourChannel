import { getChannelVideos, isChannelId } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

// GET /api/feed?ids=UC...,UC...  ->  { videos: [...], errors: [...] }
export async function GET(request) {
  const ids = (request.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(isChannelId)
    .slice(0, 100);

  const force = request.nextUrl.searchParams.get('force') === '1';
  const results = await Promise.allSettled(ids.map((id) => getChannelVideos(id, { force })));

  const videos = [];
  const errors = [];
  const sources = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      videos.push(...r.value.videos);
      sources[ids[i]] = r.value.source;
    }
    else errors.push({ channelId: ids[i], error: r.reason?.message || 'erro desconhecido' });
  });

  videos.sort((a, b) => new Date(b.published) - new Date(a.published));

  return Response.json({ videos, errors, sources, fetchedAt: new Date().toISOString() });
}
