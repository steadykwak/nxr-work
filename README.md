# NXR Work

개인 업무와 Google Calendar 미팅을 한곳에서 보는 Next.js MVP입니다. UI는 한국어, 날짜 기준은 `Asia/Seoul`입니다. Google Sheets와 Calendar에는 읽기 API만 사용합니다. 업무의 앱 내 완료 변경은 Supabase 오버라이드에만 저장됩니다.

## 현재 확인한 시트 구조

2026-09-23에 연결된 Google Sheets에서 스프레드시트 `1Xs4bpyzGFdDERkC1fJ1QlsU0s4C-o7QiGhR7LufpOm4`의 `곽운도` 탭(gid `1677149090`)을 읽어 확인했습니다. **1행은 비어 있고 헤더가 없습니다. 2행부터 데이터입니다.** 따라서 가져오기 로직은 열 위치를 기준으로 하며, 1행에 값이 생기면 잘못된 매핑을 막기 위해 중단합니다.

| 열  | 실제 관찰 값                   | 앱 필드                    |
| --- | ------------------------------ | -------------------------- |
| A   | `SHEET:...`, UUID, `SLACK:...` | 업무 고유 ID               |
| C   | `곽운도`                       | 담당자                     |
| F   | 업무 제목                      | 업무명                     |
| I   | `09/29 (화)` 또는 `2026-09-22` | 생성일 원문 및 해석한 날짜 |
| J   | 같은 형식                      | 기한 원문 및 해석한 날짜   |
| L   | `TRUE` / `FALSE`               | 원본 완료 여부             |
| M   | `시작 전` 등                   | 원본 상태                  |
| N   | 일부 행의 Notion/Slack URL     | 원본 링크 또는 비고        |

시트 자체 시간대는 `Asia/Tokyo`로 확인됐지만 앱 표시는 요청대로 `Asia/Seoul`을 사용합니다. 연도가 없는 날짜는 `GOOGLE_SHEET_DATE_YEAR`를 기준으로 해석하고 표시된 요일과 실제 요일이 다르면 날짜로 저장하지 않고 경고합니다. 현재 확인한 `09/29 (화)`는 2026년에 해당합니다. 원문과 A:N 전체 값은 별도로 보존합니다.

## 오늘의 업무 기준

- 오늘 날짜와 미팅 날짜는 `Asia/Seoul` 기준입니다. 오늘 예정된 미팅은 시작 시간순으로 표시합니다.
- 시트 I열은 원본 생성일(`source_created_date`)입니다. 별도 시작일 필드가 없어 **오늘의 업무 화면에서만 시작일의 대용값**으로 사용합니다. 이 날짜가 오늘보다 이전이고 유효 완료 상태가 미완료인 업무를 표시합니다. 완료 상태는 앱의 `override_completed`가 있으면 우선합니다.
- J열은 기한(`source_due_date`)입니다. 미완료 업무의 기한이 지났으면 빨간 점, 오늘부터 3일 이내면 주황 점을 표시합니다. 기한이 없거나 4일 이상 남았으면 점이 없습니다.
- 캘린더의 점심 제목(`점심시간`, `중식`, `Lunch` 등)이나 점심 유형을 제외합니다. 제목으로 구분되지 않으면 `src/lib/today.ts`의 `LUNCH_WINDOW_SEOUL`에 지정된 서울 시간 12:00–13:00과 **시작·종료 시각이 정확히 일치하는 일정**만 제외합니다. 일부 겹치는 일반 미팅과 미팅·회의 제목은 유지합니다. 이 필터는 표시용이며 캘린더 원본에는 쓰지 않습니다.
- **미팅 일정** 탭에서 오늘, 이번 주(월~일), +5일(오늘 포함 5일), 지난 회의(오늘 이전 시작), 전체 보기를 전환합니다. 모든 보기는 서울 날짜와 시작 시간순이며 점심을 제외합니다. 전체는 Google Calendar에서 현재 조회하는 지난 30일·향후 90일 범위입니다. 오늘의 업무에는 오늘 미팅만 한 번 보여 주고, 전체 보기는 미팅 일정 탭으로 이동합니다.

## 1. Supabase 설정

1. 사용자가 Supabase 프로젝트를 생성합니다. 이 앱은 프로젝트를 자동 생성하지 않습니다.
2. SQL Editor에서 [`supabase/migrations/202609230001_init.sql`](supabase/migrations/202609230001_init.sql)을 실행합니다. `tasks`에는 사용자별 RLS가 적용됩니다. `google_connections`는 일반 사용자 접근을 막고 서버의 secret/service role 권한만 사용합니다.
3. Authentication → Providers → Google을 활성화하고 Google Cloud의 웹 OAuth 클라이언트 ID와 비밀값을 **Supabase 대시보드에 직접** 입력합니다. 앱의 `.env.local`에 있는 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`는 별도의 Sheets·Calendar 연동에 쓰이며, Google 로그인 버튼에는 사용하지 않습니다.
4. Authentication → URL Configuration에서 Site URL을 `http://localhost:3000`으로, Redirect URLs에 `http://localhost:3000/auth/callback`을 설정합니다. Google Cloud 웹 OAuth 클라이언트의 승인된 JavaScript 원본에 `http://localhost:3000`을 추가합니다. **승인된 리디렉션 URI**에는 앱 경로가 아니라 Supabase Google 제공자 화면에 표시된 콜백 URL을 등록합니다. 형식은 `NEXT_PUBLIC_SUPABASE_URL` 값 뒤에 `/auth/v1/callback`을 붙인 주소입니다. 임의의 프로젝트 주소를 사용하지 말고 대시보드의 실제 주소와 일치하는지 확인하세요. OAuth 동의 화면에는 로그인용 `openid`, `userinfo.email`, `userinfo.profile` 범위만 설정합니다.
5. Project URL, publishable/anon key, secret key 또는 기존 service role key를 프로젝트 설정에서 확인합니다. secret/service role key는 서버 환경 변수에만 넣습니다.

## 2. Google 설정

1. Google Cloud 프로젝트에서 **Google Sheets API**와 **Google Calendar API**를 활성화합니다.
2. OAuth 동의 화면을 설정하고 테스트 모드라면 사용할 Google 계정을 테스트 사용자로 추가합니다. 시트에 접근 가능한 계정을 OAuth 화면에서 선택해야 합니다.
3. OAuth 클라이언트 유형을 **웹 애플리케이션**으로 만들고 승인된 리디렉션 URI에 `http://localhost:3000/api/google/callback`을 추가합니다.
4. 앱은 `https://www.googleapis.com/auth/spreadsheets.readonly`, `https://www.googleapis.com/auth/calendar.events.readonly` 두 범위만 요청합니다. 캘린더는 선택한 계정의 기본 캘린더를 읽습니다. Google 계정 선택 화면은 매 연결 시 표시됩니다.
5. 32바이트 암호화 키를 생성합니다: `openssl rand -base64 32`. 이 값은 로컬 `.env.local`에 직접 넣습니다. 채팅에 키나 토큰을 붙여 넣지 마세요.

## 3. 로컬 실행

```bash
# .env.local이 아직 없을 때만 실행
cp -n .env.example .env.local
npm install
npm run dev
```

현재 입력된 Supabase URL·publishable key·스프레드시트 설정은 Git에서 제외되는 `.env.local`에 보존돼 있습니다. 나머지 값은 `.env.local`에 직접 설정합니다. `GOOGLE_SPREADSHEET_ID`는 위 ID, `GOOGLE_SHEET_NAME`은 `곽운도`, `GOOGLE_SHEET_DATE_YEAR`는 현재 데이터 기준 `2026`, `NEXT_PUBLIC_SITE_URL`은 `http://localhost:3000`을 입력합니다. `.env.example`은 변수명만 제공하고 `.env.local`은 Git에서 제외합니다. Supabase 브라우저 키는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용합니다. 서버 관리자 키는 `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY` 중 하나를 설정합니다. 브라우저에서 `http://localhost:3000`을 열어 **Google로 로그인** → 별도 Google Sheets·Calendar 연결 → **시트 동기화** 순서로 진행합니다. 설정 전에는 안내 화면을 표시하며 샘플 데이터를 실제 연동 데이터처럼 보여주지 않습니다.

## 동기화 규칙

- 업무 ID는 A열 값을 그대로 사용합니다. 빈 ID와 중복 ID 행은 저장하지 않고 결과 경고에 표시합니다. 행 번호를 ID로 대체하지 않습니다.
- `(user_id, source, source_id)` 고유 인덱스로 재실행 시 같은 업무를 갱신합니다. 원본 필드만 upsert하며 `override_completed`와 `override_status`는 유지합니다.
- 앱의 완료 버튼은 오버라이드만 바꿉니다. 원본 시트에는 쓰지 않습니다. 상태 오버라이드 열도 준비돼 있으나 MVP 화면에서는 완료 변경만 제공합니다.
- Calendar 일정은 서버에서 매 화면 요청 시 지난 30일과 향후 90일을 읽으며 생성·수정·삭제하지 않습니다.
- 시트 원본이 삭제된 업무는 앱에서 자동 삭제하지 않습니다. 삭제 정책은 추후 결정할 수 있습니다.
- Google 토큰은 서버에서 AES-256-GCM으로 암호화해 저장합니다. 브라우저에 전달하지 않습니다.

## 검사

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Supabase 프로젝트와 Google OAuth 값이 설정되지 않으면 실제 API 연결 및 데이터 가져오기는 로컬에서 검증할 수 없습니다. 그 경우 위 설정을 마친 뒤 OAuth 계정 선택, 시트 동기화, 재동기화 시 중복 여부를 확인합니다.
