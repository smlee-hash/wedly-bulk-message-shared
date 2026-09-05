# @wedly/bulk-message-shared

WEDLY 「문자 및 이메일 발송」 화면과 순수 규칙의 공용 부품. ERP·일루아 두 앱이 **같은 커밋을 물어** 같은 화면·같은 판정을 쓴다.

## 무엇이 들어 있나

| 경로 | 내용 |
|---|---|
| `src/screen/BulkMessageScreen.tsx` | 3단계 화면(받을 분 고르기 → 안내문 만들기 → 발송 확인) |
| `src/screen/step{1,2,3}-helpers.ts` | 단계 판정(순수 함수) |
| `src/rules/checks.ts` · `notice-category.ts` | 안내문 검사·안내 내용 분류(순수 규칙 — 서버도 쓴다) |
| `src/ui/*` | 화면이 쓰는 기본 부품 사본(WEDLY 디자인 토큰만 사용) |

## 화면이 부르는 주소

화면은 **상대 주소만** 부른다 — 어느 앱에 올려도 그 앱의 통로로 간다.

- `POST /api/bulk-message/targets` · `convert` · `test-send` · `send`
- `GET /api/bulk-message/jobs/[id]`
- `GET /api/auth/me`

앱은 이 주소들을 자기 서버에 열어 두기만 하면 된다.

## 설치

두 앱의 `package.json` 에 커밋을 못 박는다.

```json
"@wedly/bulk-message-shared": "github:smlee-hash/wedly-bulk-message-shared#<commit>"
```

`next.config.ts` 에 소스 배포 패키지를 컴파일 대상으로 넣는다.

```ts
transpilePackages: ["@wedly/detail-modal-shared", "@wedly/ui-shared", "@wedly/bulk-message-shared"],
```

ERP 는 Tailwind 가 이 패키지의 클래스를 훑도록 `src/app/globals.css` 에 한 줄 더한다.

```css
@source "../../node_modules/@wedly/bulk-message-shared/src/**/*.{ts,tsx}";
```

## 쓰는 법

```tsx
import { BulkMessageScreen } from "@wedly/bulk-message-shared";

export default function Page() {
  return <BulkMessageScreen />;
}
```

순수 규칙만 필요하면(서버 라우트 등) `@wedly/bulk-message-shared/rules` 를 쓴다.

## 개발

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```
