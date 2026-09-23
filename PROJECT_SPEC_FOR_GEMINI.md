# [MASTER CONTEXT] NXR Work 앱 아키텍처 및 개발 명세서

> **안내**: 이 문서는 Web Gemini에 프로젝트 컨텍스트를 주입(Context Injection)하여, Gemini가 코드베이스의 내부 사양과 제약 조건을 완벽히 이해한 상태로 Antigravity 에이전트용 개발 프롬프트를 작성할 수 있도록 설계된 마스터 명세서입니다.

---

## 1. 프로젝트 개요 (Overview)

- **앱 이름**: `nxr-work` (NXR Work)
- **핵심 목적**: 개인의 **Google Sheets 업무 데이터**와 **Google Calendar 미팅 일정**을 한곳에서 실시간으로 융합·조회하고 관리하는 개인 업무 생산성 대시보드
- **기준 시간대**: 모든 날짜와 시각은 **`Asia/Seoul` (한국 표준시)** 기준
- **기술 스택**:
  - **Framework**: Next.js 15.5 (App Router, Server Components + Client Components)
  - **Core**: React 19, TypeScript 5.9
  - **Styling**: 바닐라 CSS (`src/app/globals.css`, TailwindCSS 미사용, 모던 글래스/플랫 UI)
  - **Database & Auth**: Supabase (PostgreSQL, Supabase Auth via Google OAuth, RLS, `@supabase/ssr` 0.6.1)
  - **External APIs**: Google Sheets API v4, Google Calendar API v3
  - **Automation**: Google Apps Script (시간 기반 트리거 - 1시간 주기 자동 동기화)
  - **Testing**: Vitest (`npm test`, 14개 테스트 파일, 42개 케이스 100% 통과)
  - **Icons**: Lucide React (`lucide-react`)

---

## 2. 프로젝트 디렉토리 및 파일 역할

```text
nxr-work/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/sheet-export/route.ts  # 1시간 주기 Apps Script 크론 트리거 수신 (Bearer 토큰 인증)
│   │   │   ├── google/
│   │   │   │   ├── connect/route.ts       # 별도 Google API 권한(Sheets/Calendar) OAuth 시작
│   │   │   │   └── callback/route.ts      # Google API OAuth 콜백 및 토큰 암호화 저장
│   │   │   ├── sync/
│   │   │   │   ├── route.ts               # 시트 → NXR Work 최초 1회 초기 가져오기 (Import)
│   │   │   │   └── export/route.ts        # NXR Work → 시트 수동 내보내기 (Export)
│   │   │   └── tasks/[id]/route.ts        # 업무 완료(override_completed)/상태 오버라이드 PATCH
│   │   ├── auth/callback/route.ts         # Supabase Google 로그인 세션 교환 콜백
│   │   ├── login/
│   │   │   ├── page.tsx                   # 로그인 페이지 서버 컴포넌트
│   │   │   └── screen.tsx                 # 로그인 화면 클라이언트 컴포넌트
│   │   ├── dashboard.tsx                  # 메인 대시보드 UI (오늘/업무목록/미팅일정/타임라인)
│   │   ├── globals.css                    # 전체 애플리케이션 디자인 시스템 (248px 사이드바, 카드, 뱃지 등)
│   │   ├── page.tsx                       # 홈 진입점 (인증 검증, tasks/events 서버 페칭)
│   │   └── layout.tsx                     # 전역 HTML 레이아웃
│   ├── lib/
│   │   ├── config.ts                      # 환경변수 검증, 사이트 URL(로컬/운영) 안전 판별
│   │   ├── dates.ts                       # 시트 날짜 파싱 ('09/29 (화)' → '2026-09-29' 변환)
│   │   ├── google.ts                      # Google OAuth 토큰 갱신, Calendar 실시간 페칭 (-30일 ~ +90일)
│   │   ├── security.ts                    # AES-256-GCM 토큰 암복호화, sameOrigin CSRF 검증
│   │   ├── sheet-export.ts                # 시트 L, M열 배치 업데이트 및 DB 동기화 결과 기록
│   │   ├── sheets.ts                      # 시트 A~N열 파싱, 헤더 검증, batchUpdate 페이로드 빌드
│   │   ├── supabase.ts                    # User Client (@supabase/ssr 쿠키 기반) & Admin Client (Service Role)
│   │   ├── sync-lock.ts                   # 수동/자동 동기화 간 충돌 방지 DB 분산 락 (15분 타임아웃)
│   │   └── today.ts                       # 점심 필터링, 긴급도 판별, 주간 범위 계산 등 핵심 비즈니스 로직
│   └── middleware.ts                      # 세션 갱신 및 비인증 접근 시 /login 리디렉션
├── scripts/
│   └── apps-script-hourly.gs              # Google Apps Script 1시간 타이머 스크립트 원본
└── supabase/
    └── migrations/
        ├── 202609230001_init.sql          # tasks, google_connections 테이블, RLS, 불변 트리거
        └── 202609230002_sheet_export.sql   # 내보내기 이력 및 동기화 락 컬럼 추가
```

---

## 3. 핵심 비즈니스 로직 및 동작 규칙

### 1) Google Sheets 연동 규칙 (단방향 임포트 → 오버라이드 익스포트)
- **스프레드시트 구조**:
  - **1행은 비어 있고 헤더가 없음. 2행부터 실제 데이터가 시작됨.**
  - 1행에 값이 생기면 잘못된 매핑을 방지하기 위해 임포트가 즉시 중단됨.
- **열 매핑 (A~N)**:
  - `A`: 업무 고유 ID (예: `SHEET:...`, `SLACK:...`, UUID)
  - `C`: 담당자 (예: `곽운도`)
  - `F`: 업무명 (제목)
  - `I`: 생성일 원문 (`09/29 (화)` 또는 `2026-09-22`)
  - `J`: 기한 원문 (`09/30 (수)`)
  - `L`: 원본 완료 여부 (`TRUE` / `FALSE`)
  - `M`: 원본 상태 (`시작 전`, `진행 중` 등)
  - `N`: 원본 링크 또는 비고 (Notion/Slack 링크)
- **날짜 변환 규칙**:
  - 연도가 없는 날짜(`09/29 (화)`)는 `GOOGLE_SHEET_DATE_YEAR` (현재 `2026`)를 기준으로 보정하며, 실제 캘린더 요일과 표기 요일이 다르면 경고와 함께 null 처리.
- **동기화 파이프라인의 핵심 불변 법칙**:
  - **초기 가져오기(Import)**는 `initial_imported_at`이 없을 때 **단 1회만 수동 실행 가능**.
  - 완료 후에는 시트 원본을 다시 읽어오지 않음 (시트의 직접 변경을 NXR Work로 역반영하지 않음).
  - 앱에서 완료 토글 시 Supabase `override_completed`를 변경.
  - **지금 동기화(수동)** 또는 **Apps Script 1시간 Cron** 실행 시, 앱의 최신 완료/상태값(`override_* ?? source_*`)을 구글 시트의 **L열(완료)과 M열(상태)에만 역반영(Export)**함.
  - 내보내기 전 시트 A열의 ID 목록을 조회하여 중복/누락/불일치가 있으면 시트 오염을 막기 위해 쓰기를 중단함.

### 2) Google Calendar 연동 규칙 (실시간 읽기 전용)
- 앱에서 캘린더 일정을 생성/수정/삭제하지 않으며 **오직 조회(Read-only)**만 수행.
- 홈 화면 요청 시마다 Google Calendar API를 호출하여 **지난 30일 ~ 향후 90일** 범위를 페칭.
- **점심시간 자동 제외 필터 (`isLunchEvent`)**:
  - 이벤트 제목에 `점심`, `중식`, `런치`, `Lunch` 등이 포함되거나, 서울 시간 기준 **12:00 ~ 13:00과 시작·종료 시각이 정확히 일치하는 일정**은 대시보드 미팅 목록에서 자동 제외.
  - 단, 제목에 `미팅`, `회의`, `meeting`, `sync` 등의 업무 키워드가 있으면 제외하지 않고 정상 표시.

### 3) 대시보드 뷰 모드 및 UI 사양
- **오늘 (Today)**:
  - 오늘 마감 업무수, 오늘의 미팅수, 기한 지난 미완료 업무수 카드 요약.
  - **오늘 예정된 미팅**: 시작 시간순 정렬.
  - **진행 중인 미완료 업무**: 시작일 대용값(`source_created_date`)이 오늘 이전이고 유효 상태가 미완료인 업무 표시.
- **업무 목록 (Tasks)**:
  - 전체 / 지난 업무(Overdue) / 다가오는 업무(Upcoming) 필터 및 실시간 텍스트 검색.
  - 기한 긴급도 뱃지:
    - **빨간 점 (`overdue`)**: 오늘 이전 마감 & 미완료
    - **주황 점 (`soon`)**: 오늘부터 3일 이내 마감 & 미완료
    - 점 없음: 기한 4일 이상 남음 또는 완료됨
- **미팅 일정 (Calendar)**:
  - 5가지 뷰: `오늘`, `이번 주(월~일)`, `+5일(오늘부터 평일 5일)`, `지난 회의(주 단위 이전/다음 네비게이션)`, `전체`.
- **날짜별 보기 (Timeline)**:
  - 업무 마감일과 캘린더 미팅을 날짜순(`YYYY-MM-DD`)으로 인터리빙하여 하나의 타임라인으로 렌더링.

---

## 4. 데이터베이스 및 보안 아키텍처 (Supabase)

### 1) 테이블 구조
- **`public.tasks`**:
  - 업무 데이터 저장. `user_id`, `source ('sheet' | 'manual')`, `source_id` 복합 고유 인덱스.
  - `source_*` 컬럼: 시트에서 가져온 원본 필드들 (불변).
  - `override_completed (boolean)`, `override_status (text)`: 앱 사용자가 오버라이드한 값.
- **`public.google_connections`**:
  - 사용자별 Google OAuth 토큰 및 동기화 상태 메타데이터.
  - `access_token_encrypted`, `refresh_token_encrypted` (AES-256-GCM 암호화 저장).
  - `initial_imported_at`, `last_sheet_export_at`, `last_calendar_sync_at`.
  - `sync_lock_id (uuid)`, `sync_lock_at (timestamptz)` (동시성 제어 락).

### 2) 보안 및 무결성 제약 조건
- **Row Level Security (RLS)**:
  - `tasks`: `auth.uid() = user_id` 조건으로 사용자별 격리.
  - `google_connections`: `anon`, `authenticated` 접근이 전면 `REVOKE`됨. 오직 서버의 `service_role` (Admin Client)만 접근 가능.
- **PostgreSQL 불변 트리거 (`guard_task_source_fields`)**:
  - 일반 사용자가 API나 클라이언트를 통해 `source_*` 필드(시트 원본 데이터)를 수정하려고 시도하면 DB 트리거에서 예외(`Source fields are read-only`)를 발생시켜 차단함.
  - 사용자는 오직 `override_completed`, `override_status`만 수정 가능.
- **동시성 락 (`claimSync` / `releaseSync`)**:
  - 수동 동기화 요청과 Apps Script의 1시간 크론 요청이 동시에 들어올 경우 충돌을 막기 위해 UUID 기반의 잠금을 획득해야만 실행됨. 15분이 지난 잠금은 자동 만료(Stale Lock 해제).
- **CSRF & Origin 보호**:
  - 주요 API는 `sameOrigin(request)` 검사를 거침. 크론 경로는 `CRON_SECRET` Bearer 토큰을 검증.

---

## 5. Web Gemini가 프롬프트 작성 시 지켜야 할 원칙 (Guidelines for Gemini)

Web Gemini가 사용자 요청에 따라 Antigravity 에이전트용 프롬프트를 작성할 때, **반드시 아래 원칙을 반영하여 프롬프트를 구성**해야 합니다:

1. **시트 동기화 불변성 유지**:
   - 시트 원본 데이터를 클라이언트에서 직접 조작하거나, `source_*` 필드를 직접 UPDATE하도록 지시하면 안 됩니다.
   - 업무 상태 변경은 항상 `override_*` 컬럼을 통하고, 최종 반영은 `/api/sync/export` 파이프라인을 통하도록 지시해야 합니다.
2. **시간대 일관성 (`Asia/Seoul`)**:
   - 모든 날짜 계산, 캘린더 조회, 마감일 판별 로직은 브라우저 로컬 시간대나 UTC를 임의로 쓰지 않고 `Asia/Seoul` 포맷터(`todaySeoul()`, `eventSeoulDate()` 등)를 사용하도록 명시해야 합니다.
3. **바닐라 CSS 및 디자인 톤앤매너**:
   - TailwindCSS를 추가하거나 ad-hoc 인라인 스타일을 남발하지 말고, `src/app/globals.css`의 디자인 토큰과 BEM/클래스 체계를 확장하여 작성하도록 프롬프트에 명시해야 합니다.
4. **검증 절차 포함**:
   - 기능 수정 후 반드시 `npm run typecheck`, `npm run lint`, `npm test`를 실행하여 42개 이상의 테스트가 계속 통과하는지 검증하도록 지시해야 합니다.
5. **명확한 파일 링크 표기**:
   - 변경이 필요한 타깃 파일을 `[파일명](file:///Users/nxr-edu2/code/nxr-work/...)` 형식으로 명시하도록 프롬프트를 작성하면 Antigravity 에이전트가 오차 없이 즉시 작업할 수 있습니다.

---

## 6. 향후 주요 개발 가능 영역 (Roadmap Examples)

Gemini가 사용자의 요구에 맞춰 구체화할 수 있는 확장 기능 목록입니다:
1. **업무 수동 생성/편집 기능 (Manual Tasks)**:
   - `source = 'manual'` 업무 생성 API 및 UI 모달 추가 (`guard_task_source_fields` 트리거는 이미 `source = 'manual'` 수동 입력을 지원함).
2. **업무 상태(Status) 드롭다운 UI**:
   - 현재 완료 체크박스만 있는 UI에서, DB에 이미 준비된 `override_status` 컬럼을 활용하여 '시작 전 / 진행 중 / 대기 / 완료' 상태를 변경하고 시트 M열에 반영하는 기능.
3. **태그/카테고리 및 정렬 기능**:
   - 기한순 외에 등록일순, 업무명순, 담당자별 필터링 기능 추가.
4. **다크 모드 (Dark Mode)**:
   - `globals.css`에 CSS 변수 기반 다크 테마 추가.
5. **검색 고도화**:
   - 업무명 외에 비고(N열 `source_note`), 담당자(C열 `source_owner`) 대상 통합 검색.

---

## 7. Gemini용 프롬프트 생성 템플릿 (Antigravity 연동용)

Web Gemini가 최종적으로 사용자에게 제공할 프롬프트는 아래 구조를 따르는 것이 가장 효과적입니다:

```markdown
### [기능명 또는 작업 목표]
- **목적**: ...
- **수정/추가 대상 파일**:
  - `[파일 경로](file:///Users/nxr-edu2/code/nxr-work/...)`
- **구현 세부 요구사항**:
  1. ...
  2. ...
- **주의 및 제약 사항**:
  - `Asia/Seoul` 시간대 규칙 유지 (`src/lib/today.ts`)
  - `guard_task_source_fields` DB 트리거 준수 (`override_*` 필드 사용)
  - 바닐라 CSS (`src/app/globals.css`) 스타일 가이드 준수
- **검증 절차**:
  - `npm run typecheck`
  - `npm test`
```
