'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { CircleAlert, Layers3, Link2 } from 'lucide-react';

type Props = { configured: boolean; error?: string; callbackUrl: string };

const messages: Record<string, string> = {
  cancelled: 'Google 로그인이 취소되었습니다. 다시 시도해 주세요.',
  callback: 'Google 로그인 결과를 확인하지 못했습니다. 다시 시도해 주세요.',
  exchange: '로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.',
  session: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
};

export default function LoginScreen({ configured, error, callbackUrl }: Props) {
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');

  async function signIn() {
    setPending(true);
    setLocalError('');
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl },
      });
      if (authError) throw authError;
    } catch {
      setLocalError(
        'Google 로그인을 시작하지 못했습니다. Supabase Google 제공자 설정을 확인해 주세요.',
      );
      setPending(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={20} />
          </div>
          <div>
            <b>NXR Work</b>
            <small>나의 업무 공간</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>개인 업무 공간</span>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">WORKSPACE / LOGIN</p>
              <h1>로그인</h1>
              <p className="subtitle">업무와 미팅을 한곳에서 확인하세요.</p>
            </div>
          </div>
          {(localError || error) && (
            <div className="notice error" role="alert">
              <CircleAlert size={16} />
              {localError || messages[error ?? ''] || messages.callback}
            </div>
          )}
          <div className="setup">
            <Link2 size={22} />
            {configured ? (
              <>
                <h2>Google 계정으로 시작하기</h2>
                <p>
                  Google 기본 프로필로 로그인합니다. 시트와 캘린더 읽기 권한은
                  로그인 후 별도 연동 단계에서 요청합니다.
                </p>
                <button className="primary" onClick={signIn} disabled={pending}>
                  {pending ? 'Google 로그인으로 이동 중…' : 'Google로 로그인'}
                </button>
              </>
            ) : (
              <>
                <h2>Supabase 연결이 필요합니다</h2>
                <p>README의 환경 변수 설정을 완료한 뒤 다시 열어 주세요.</p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
