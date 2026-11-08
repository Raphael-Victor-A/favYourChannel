import { resolveChannel } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

// GET /api/resolve?q=@canal  ->  { id, title, avatar }
export async function GET(request) {
  const q = request.nextUrl.searchParams.get('q');
  if (!q || !q.trim()) {
    return Response.json({ error: 'Informe um canal.' }, { status: 400 });
  }
  try {
    const channel = await resolveChannel(q);
    return Response.json(channel);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 404 });
  }
}
