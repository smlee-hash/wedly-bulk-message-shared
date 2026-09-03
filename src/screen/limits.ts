// 단체 안내 발송 — 화면과 사용방법이 함께 쓰는 상한값.
// 화면(BulkMessageScreen)과 사용방법(BulkMessageManual)이 서로를 가져오므로
// 상수를 화면 파일에 두면 고리가 생긴다. 그래서 여기 따로 둔다.

/** 한 번에 보낼 수 있는 최대 인원. 붙여넣기 번호도 이 수에서 자른다. */
export const MAX_RECIPIENTS = 500;

/** 내 번호로 하는 시험 발송 하루 상한(직원). ERP handlers.ts 와 같은 값 — 바꾸면 양쪽. */
export const TEST_SEND_CAP_STAFF = 10;

/** 내 번호로 하는 시험 발송 하루 상한(파트너 앱). ERP handlers.ts 와 같은 값 — 바꾸면 양쪽. */
export const TEST_SEND_CAP_PARTNER = 3;
