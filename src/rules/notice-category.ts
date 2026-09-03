// 「안내 내용」 선택지 — **화면과 서버가 같은 정본을 본다.**
//
// ★서버에도 검문이 있어야 한다. 화면만 막으면 로그인한 직원이 통로를 직접 불러
//  「지금 신청하면 100만원 할인!」 같은 글자를 알림톡 본문에 실을 수 있고,
//  이 발신 프로필은 이미 광고성 판정으로 3건 반려된 이력이 있다 — 제재되면 위들리 알림톡이 전부 멈춘다.

export const NOTICE_CATEGORIES = [
  "서류 준비 안내",
  "심사 일정 안내",
  "결과 통보",
  "기타 안내",
] as const;

export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

export function isNoticeCategory(v: string): v is NoticeCategory {
  return (NOTICE_CATEGORIES as readonly string[]).includes(v);
}
