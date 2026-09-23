import { exportToSheet } from '@/lib/sheet-export';
import { adminClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      console.warn('[CRON EXPORT WARNING]: 인증되지 않은 크론 요청입니다.');
      return Response.json(
        { success: false, error: '인증에 실패했습니다. 올바른 Bearer 토큰이 필요합니다.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let exported = 0;
    let failed = 0;
    const errors: { userId: string; error: string }[] = [];
    let totalConnections = 0;

    for (let offset = 0; ; offset += 500) {
      const { data, error } = await adminClient()
        .from('google_connections')
        .select('user_id')
        .not('initial_imported_at', 'is', null)
        .order('user_id')
        .range(offset, offset + 499);

      if (error) {
        console.error('[CRON EXPORT ERROR]: google_connections 조회 실패:', error);
        return Response.json(
          { success: false, error: `데이터베이스 연결 조회 실패: ${error.message}` },
          { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      const connections = data ?? [];
      totalConnections += connections.length;

      for (const connection of connections) {
        try {
          const result = await exportToSheet(connection.user_id);
          exported++;
          console.log(
            `[CRON EXPORT SUCCESS]: user=${connection.user_id}, exported=${result.exported}`,
          );
        } catch (userError) {
          failed++;
          const errorMessage =
            userError instanceof Error
              ? userError.message
              : '시트 동기화 실패';
          console.error(
            `[CRON EXPORT ERROR]: user=${connection.user_id}:`,
            userError,
          );
          errors.push({ userId: connection.user_id, error: errorMessage });
        }
      }

      if (connections.length < 500) break;
    }

    if (totalConnections === 0) {
      console.warn('[CRON EXPORT WARNING]: 동기화 대상 유저가 없습니다.');
      return Response.json(
        {
          success: false,
          error: '동기화 대상 유저가 없습니다. 먼저 초기 가져오기(Import)를 완료해 주세요.',
          exported: 0,
          failed: 0,
        },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const isAllFailed = failed > 0 && exported === 0;
    const hasAuthError = errors.some((e) =>
      /token|auth|권한|인증|Google 계정/i.test(e.error),
    );

    const statusCode = isAllFailed ? (hasAuthError ? 401 : 500) : 200;

    return Response.json(
      {
        success: failed === 0,
        exported,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      },
      {
        status: statusCode,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('[CRON EXPORT FATAL ERROR]:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '크론 실행 중 알 수 없는 오류 발생',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

