# NXR Work

개인 업무와 Google Calendar 미팅을 한곳에서 보는 Next.js MVP입니다. UI는 한국어, 날짜 기준은 `Asia/Seoul`입니다. Google Sheets는 최초 한 번 읽어 NXR Work에 저장하고, 이후에는 NXR Work의 값을 시트에 씁니다. Google Calendar는 계속 읽기 전용입니다.

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
- **미팅 일정** 탭에서 오늘, 이번 주(월~일), +5일(오늘부터 주말을 제외한 평일 5일), 지난 회의(오늘 이전 시작), 전체 보기를 전환합니다. +5일은 수요일 시작이면 수·목·금·월·화를 표시하고, 주말 시작이면 다음 월요일부터 셉니다. 지난 회의는 가장 최근 회의가 있는 주부터 월~일 단위로 이전 주·다음 주를 넘겨 볼 수 있습니다. 모든 보기는 서울 날짜와 시작 시간순이며 점심을 제외합니다. 전체는 Google Calendar에서 현재 조회하는 지난 30일·향후 90일 범위입니다. 오늘의 업무에는 오늘 미팅만 한 번 보여 주고, 전체 보기는 미팅 일정 탭으로 이동합니다.

## 1. Supabase 설정

1. 사용자가 Supabase 프로젝트를 생성합니다. 이 앱은 프로젝트를 자동 생성하지 않습니다.
2. SQL Editor에서 [`supabase/migrations/202609230001_init.sql`](supabase/migrations/202609230001_init.sql)을 실행합니다. 기존 프로젝트에는 이미 적용됐는지 확인하고 다시 실행하지 않습니다. 이어서 [`supabase/migrations/202609230002_sheet_export.sql`](supabase/migrations/202609230002_sheet_export.sql)을 수동 적용합니다. 이 마이그레이션은 과거 `last_sheet_sync_at`이 있는 연결을 초기 가져오기 완료로 표시합니다. `tasks`에는 사용자별 RLS가 적용됩니다. `google_connections`는 일반 사용자 접근을 막고 서버의 secret/service role 권한만 사용합니다.
3. Authentication → Providers → Google을 활성화하고 Google Cloud의 웹 OAuth 클라이언트 ID와 비밀값을 **Supabase 대시보드에 직접** 입력합니다. 앱의 `.env.local`에 있는 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`는 별도의 Sheets·Calendar 연동에 쓰이며, Google 로그인 버튼에는 사용하지 않습니다.
4. Authentication → URL Configuration에서 Site URL을 `http://localhost:3000`으로, Redirect URLs에 `http://localhost:3000/auth/callback`을 설정합니다. Google Cloud 웹 OAuth 클라이언트의 승인된 JavaScript 원본에 `http://localhost:3000`을 추가합니다. **승인된 리디렉션 URI**에는 앱 경로가 아니라 Supabase Google 제공자 화면에 표시된 콜백 URL을 등록합니다. 형식은 `NEXT_PUBLIC_SUPABASE_URL` 값 뒤에 `/auth/v1/callback`을 붙인 주소입니다. 임의의 프로젝트 주소를 사용하지 말고 대시보드의 실제 주소와 일치하는지 확인하세요. OAuth 동의 화면에는 로그인용 `openid`, `userinfo.email`, `userinfo.profile` 범위만 설정합니다.
5. Project URL, publishable/anon key, secret key 또는 기존 service role key를 프로젝트 설정에서 확인합니다. secret/service role key는 서버 환경 변수에만 넣습니다.

## 2. Google 설정

1. Google Cloud 프로젝트에서 **Google Sheets API**와 **Google Calendar API**를 활성화합니다.
2. OAuth 동의 화면을 설정하고 테스트 모드라면 사용할 Google 계정을 테스트 사용자로 추가합니다. 시트에 접근 가능한 계정을 OAuth 화면에서 선택해야 합니다.
3. OAuth 클라이언트 유형을 **웹 애플리케이션**으로 만들고 승인된 리디렉션 URI에 `http://localhost:3000/api/google/callback`을 추가합니다.
4. 별도 시트·캘린더 연결은 `https://www.googleapis.com/auth/spreadsheets`(시트 읽기·쓰기)와 `https://www.googleapis.com/auth/calendar.events.readonly`(캘린더 읽기) 범위를 요청합니다. Supabase의 Google **로그인** 권한과는 별개입니다. 이전 `spreadsheets.readonly` 연결은 쓰기 권한이 없으므로 앱에서 **Google 쓰기 권한 연결**을 눌러 재인증해야 합니다. Google Cloud OAuth 동의 화면에도 새 범위를 설정하고, 필요한 경우 검증 절차를 완료합니다. 승인된 권한을 실제 토큰 응답에서 확인하며 거부되면 시트 쓰기를 실행하지 않습니다. 캘린더는 선택한 계정의 기본 캘린더를 읽습니다.
5. 32바이트 암호화 키를 생성합니다: `openssl rand -base64 32`. 이 값은 로컬 `.env.local`에 직접 넣습니다. 채팅에 키나 토큰을 붙여 넣지 마세요.

## 3. 로컬 실행

```bash
# .env.local이 아직 없을 때만 실행
cp -n .env.example .env.local
npm install
npm run dev
```

현재 입력된 Supabase URL·publishable key·스프레드시트 설정은 Git에서 제외되는 `.env.local`에 보존돼 있습니다. 나머지 값은 `.env.local`에 직접 설정합니다. `GOOGLE_SPREADSHEET_ID`는 위 ID, `GOOGLE_SHEET_NAME`은 `곽운도`, `GOOGLE_SHEET_DATE_YEAR`는 현재 데이터 기준 `2026`, `NEXT_PUBLIC_SITE_URL`은 `http://localhost:3000`을 입력합니다. `.env.example`은 변수명만 제공하고 `.env.local`은 Git에서 제외합니다. Supabase 브라우저 키는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용합니다. 서버 관리자 키는 `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY` 중 하나를 설정합니다. 브라우저에서 `http://localhost:3000`을 열어 **Google로 로그인** → 별도 Google Sheets·Calendar 연결 → **초기 동기화** 순서로 진행합니다. 설정 전에는 안내 화면을 표시하며 샘플 데이터를 실제 연동 데이터처럼 보여주지 않습니다.

## 동기화 규칙

- 업무 ID는 A열 값을 그대로 사용합니다. 빈 ID와 중복 ID 행은 저장하지 않고 결과 경고에 표시합니다. 행 번호를 ID로 대체하지 않습니다.
- 초기 가져오기는 사용자별 `initial_imported_at`이 없을 때 수동으로 한 번만 가능합니다. `(user_id, source, source_id)` 고유 인덱스와 중복 무시 insert로 기존 업무와 오버라이드를 보존합니다. 완료 후에는 시트 원본 필드를 다시 가져오지 않습니다. 과거 가져오기 기록이 있으면 마이그레이션이 완료 상태로 승계합니다.
- 앱의 완료 버튼은 Supabase `override_completed`를 바꿉니다. 상태 오버라이드 API도 있으나 현재 화면에서 직접 상태 수정은 제공하지 않습니다. 이후 수동 **지금 동기화** 또는 서버의 시간별 실행이 시트의 L열 체크박스와 M열 상태만 기록합니다. 오버라이드가 없으면 최초 가져온 값을 기록하므로 재시도해도 값이 같습니다. 쓰기 전에 시트 A열의 고유 ID를 다시 확인하며, 중복 또는 누락 ID가 있으면 쓰기를 중단합니다. 시트의 변경 내용을 NXR Work에 다시 반영하지 않습니다.
- 직접 생성, 삭제 및 시트 행 추가·삭제는 현재 화면에서 지원하지 않으며 내보내기도 하지 않습니다. `source = manual` 업무는 시트 내보내기 대상이 아닙니다.
- Calendar 일정은 서버에서 매 화면 요청 시 지난 30일과 향후 90일을 읽으며 생성·수정·삭제하지 않습니다.
- 시트 원본이 삭제된 업무는 앱에서 자동 삭제하지 않습니다. ID가 사라진 업무가 있으면 쓰기를 중단하고 오류를 표시합니다.
- Google 토큰은 서버에서 AES-256-GCM으로 암호화해 저장합니다. 브라우저에 전달하지 않습니다.

## 1시간 자동 동기화

기본 스케줄러는 [Apps Script 시간 기반 설치형 트리거](https://developers.google.com/apps-script/guides/triggers/installable#time-driven_triggers)입니다. [`scripts/apps-script-hourly.gs`](scripts/apps-script-hourly.gs)는 **타이머와 HTTPS 요청만** 담당하며 Google Sheets를 직접 읽거나 쓰지 않습니다. 앱 서버의 `/api/cron/sheet-export` 경로를 1시간마다 호출합니다. 수동 버튼과 이 경로는 같은 `exportToSheet` 함수와 사용자별 DB 잠금을 사용합니다. 서버는 환경 변수 `CRON_SECRET`의 Bearer 토큰을 확인합니다. Vercel Cron 설정은 사용하지 않습니다.

1. 앱을 공개 HTTPS 주소에 배포하고 서버 환경 변수 `CRON_SECRET`을 설정합니다. 로컬 `npm run dev`에는 Apps Script가 접근할 수 없으므로 **지금 동기화** 버튼으로 동기화를 확인합니다.
2. [지정한 Apps Script 프로젝트](https://script.google.com/u/0/home/projects/1VWmmkh74Zg_kUbLf_Uwv9t-9fRgVGdtt75gQJ-rXzaP-uYl8eOLwJoCv/edit)에 기존 파일을 보존한 채 `NxrWorkHourly.gs`를 추가했습니다. **프로젝트 설정 → 스크립트 속성**에 `NXR_WORK_URL`(앱의 HTTPS 기본 주소)과 동일한 `CRON_SECRET`을 직접 입력합니다. 값을 코드나 로그에 넣지 않습니다.
3. 편집기에서 `installNxrWorkHourlyTrigger`를 한 번 실행하고 Apps Script의 외부 URL 요청 권한을 승인합니다. 트리거 목록에 `syncNxrWorkHourly`가 하나인지 확인합니다. 이 스크립트에는 Sheets/Calendar 권한이 필요하지 않습니다.
4. 편집기에서 `syncNxrWorkHourly`를 한 번 실행해 응답과 Apps Script 실행 기록을 확인합니다. 앱에서는 마지막 성공 시각과 오류를 확인합니다. 실패 시 HTTP 상태만 예외에 남고 비밀값이나 응답 본문은 로그에 남기지 않습니다.

Apps Script 트리거는 약 1시간 간격이지만 실행 시각이 조금 달라질 수 있고 [실행 시간·URL Fetch 할당량](https://developers.google.com/apps-script/guides/services/quotas)의 영향을 받습니다. 공개 HTTPS 배포가 없으면 로컬 앱에는 접근할 수 없습니다. `CRON_SECRET`이 저장된 스크립트 프로젝트의 편집 권한을 공유하지 마세요.

저장소에는 기존 배포 설정이 없었으며 앱 배포, DB 마이그레이션 적용, Google 재인증, Apps Script 프로젝트 생성과 트리거 설치는 이 작업에서 실행하지 않습니다. 배포 전에 DB 마이그레이션과 Google Sheets 쓰기 재인증을 완료하고, 배포 후 Apps Script 실행 기록과 앱의 마지막 성공 시각을 확인하세요.

## 검사

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

DB 마이그레이션과 Google 쓰기 재인증이 완료되지 않으면 실제 시트 쓰기는 검증할 수 없습니다. 설정 후 초기 가져오기 완료 상태, 재가져오기 차단, 수동 내보내기, Apps Script의 1시간 트리거 실행과 L/M열 반영을 확인합니다. 트리거와 수동 실행의 중복 요청은 사용자별 DB 잠금으로 막고, 15분 이상 지속된 잠금은 다음 실행이 회수할 수 있습니다.
