export { default as BulkMessageScreen } from "./screen/BulkMessageScreen";
export * from "./rules";
// step1~3 판정은 이름 충돌(NOTICE_CATEGORIES·resolveManagerScope 등)을 피해 앱이 쓸 것만 내보낸다.
// 화면 파일은 상대경로로 직접 가져오므로 여기서 전부 열 필요가 없다.
export { canProceedWithTargets } from "./screen/step1-helpers";
export { testSendAllowed, conversionReady, CONVERT_INCOMPLETE_MESSAGE } from "./screen/step2-helpers";
export { failureReasonOf, alimtalkBadgeOf, alimtalkFailedCountOf, canConfirmSend } from "./screen/step3-helpers";
