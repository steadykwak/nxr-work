import { exportToSheet } from '@/lib/sheet-export';
import { adminClient } from '@/lib/supabase';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let exported = 0;
  let failed = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await adminClient()
      .from('google_connections')
      .select('user_id')
      .not('initial_imported_at', 'is', null)
      .order('user_id')
      .range(offset, offset + 499);
    if (error)
      return Response.json({ error: '연결 조회 실패' }, { status: 500 });
    for (const connection of data ?? []) {
      try {
        await exportToSheet(connection.user_id);
        exported++;
      } catch {
        failed++;
      }
    }
    if ((data ?? []).length < 500) break;
  }
  return Response.json(
    { exported, failed },
    { status: failed ? 500 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
