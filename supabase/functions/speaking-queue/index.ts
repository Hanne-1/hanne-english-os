import { createSpeakingService } from './speaking-service.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const deviceKey = 'hanne_primary_20260913';
// Existing English OS is a shared personal app without user login. This is project-key
// authentication, not user authentication. The server never accepts a caller-supplied device.
const publishedKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'));
const legacyAnon = Deno.env.get('SUPABASE_ANON_KEY');
const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
async function rest(path: string, options: RequestInit = {}) {
  const response = await fetch(url + '/rest/v1/' + path, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) { if (response.status === 409) return null; throw new Error('Speaking 儲存服務暫時無法使用。'); }
  return response.status === 204 ? [] : await response.json();
}
const execute = createSpeakingService({
  async source() {
    const rows = await rest('english_os_state?device_key=eq.' + deviceKey + '&select=state');
    if (!rows?.[0]) throw new Error('請先完成 Cloud Sync。');
    return rows[0].state;
  },
  async latest(lessonId: string) { return (await rest('english_os_speaking_sessions?lesson_id=eq.' + encodeURIComponent(lessonId) + '&order=created_at.desc&limit=1'))?.[0] || null; },
  async get(id: string) { return (await rest('english_os_speaking_sessions?id=eq.' + encodeURIComponent(id || '') + '&limit=1'))?.[0] || null; },
  async save(state: any, revision: number | null) {
    const row = { id: state.speakingSessionId, lesson_id: state.lessonId, state, revision: (revision || 0) + 1, closed: state.completed, updated_at: new Date().toISOString() };
    const result = await rest('english_os_speaking_sessions' + (revision === null ? '' : '?id=eq.' + encodeURIComponent(row.id) + '&revision=eq.' + revision), { method: revision === null ? 'POST' : 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    return Array.isArray(result) && result.length === 1;
  }
});
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const key = req.headers.get('apikey');
  if (!key || !(publishedKeys.includes(key) || (legacyAnon && key === legacyAnon))) return Response.json({ error: '請從 English OS 開啟 Speaking。' }, { status: 401, headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  try {
    const body = await req.text();
    if (body.length > 1_000_000) return Response.json({ error: 'Report 過大。' }, { status: 413, headers: cors });
    return Response.json(await execute(JSON.parse(body)), { headers: cors });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Speaking 驗證失敗。' }, { status: 400, headers: cors }); }
});
