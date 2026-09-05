export * from "./checks";
export * from "./notice-category";
// 서버(ERP 라우트)도 쓰는 순수 판정 — 화면 폴더에 있지만 react 를 안 쓴다.
export { resolveManagerScope, managerQueryOf, MANAGER_ALL, MANAGER_MINE } from "../screen/step1-helpers";
export type { ManagerScope } from "../screen/step1-helpers";
// 서버(변환 라우트)가 스트림이 비었을 때 쓰는 문구 — 화면과 같은 글자여야 한다.
export { CONVERT_INCOMPLETE_MESSAGE } from "../screen/step2-helpers";
// 이메일 8구획 본문 모양 — ERP 프롬프트 파일과 같은 계약.
export * from "./email-body";
