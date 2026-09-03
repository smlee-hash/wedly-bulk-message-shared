export { default as BulkMessageScreen } from "./screen/BulkMessageScreen";
export { BulkMessageManual } from "./screen/BulkMessageManual";
export { MAX_RECIPIENTS, TEST_SEND_CAP_PARTNER, TEST_SEND_CAP_STAFF } from "./screen/limits";
export * from "./rules";
// step1~3 판정은 이름 충돌(NOTICE_CATEGORIES·resolveManagerScope 등)을 피해 앱이 쓸 것만 내보낸다.
// 화면 파일은 상대경로로 직접 가져오므로 여기서 전부 열 필요가 없다.
export { canProceedWithTargets } from "./screen/step1-helpers";
export { testSendAllowed, conversionReady } from "./screen/step2-helpers"; // CONVERT_INCOMPLETE_MESSAGE 는 rules 가 내보낸다
export { failureReasonOf, alimtalkBadgeOf, alimtalkFailedCountOf, canConfirmSend } from "./screen/step3-helpers";
