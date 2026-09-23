import { adminClient } from './supabase';
import { decrypt, encrypt } from './security';
import { required } from './config';

type Connection = { user_id: string; access_token_encrypted: string; refresh_token_encrypted: string | null; expires_at: string; google_email: string | null; last_sheet_sync_at: string | null; last_calendar_sync_at: string | null };
export async function connectionFor(userId: string): Promise<Connection | null> {
  const { data, error } = await adminClient().from('google_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}
export async function accessToken(userId: string) {
  const connection = await connectionFor(userId);
  if (!connection) throw new Error('Google 계정을 연결해 주세요.');
  if (new Date(connection.expires_at).getTime() > Date.now() + 60_000) return decrypt(connection.access_token_encrypted);
  if (!connection.refresh_token_encrypted) throw new Error('Google 인증이 만료되었습니다. 다시 연결해 주세요.');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), refresh_token: decrypt(connection.refresh_token_encrypted), grant_type: 'refresh_token' }), cache: 'no-store' });
  if (!response.ok) throw new Error('Google 토큰 갱신에 실패했습니다. 다시 연결해 주세요.');
  const token = await response.json() as { access_token: string; expires_in: number };
  await adminClient().from('google_connections').update({ access_token_encrypted: encrypt(token.access_token), expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString() }).eq('user_id', userId);
  return token.access_token;
}
export type CalendarEvent = { id: string; title: string; startsAt: string; endsAt: string; allDay: boolean; url: string | null };
export async function calendarEvents(token: string): Promise<CalendarEvent[]> {
  const start = new Date(); start.setDate(start.getDate() - 30);
  const end = new Date(); end.setDate(end.getDate() + 90);
  const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Google Calendar 읽기 실패 (${response.status})`);
  const data = await response.json() as { items?: { id: string; summary?: string; htmlLink?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; status?: string }[] };
  return (data.items ?? []).filter(item => item.status !== 'cancelled' && (item.start?.dateTime || item.start?.date)).map(item => ({ id: item.id, title: item.summary || '(제목 없음)', startsAt: item.start?.dateTime || item.start?.date || '', endsAt: item.end?.dateTime || item.end?.date || '', allDay: Boolean(item.start?.date), url: item.htmlLink || null }));
}
