/** 알림톡 문안 `#{안내구분}` 에 그대로 들어가는 값. 비면 카카오가 거절할 수 있다. */
import { isNoticeCategory } from "../rules/notice-category";
// 사유별 건수 문법(「수신거부 1 · 중복 번호 1」)은 1단계 도우미가 정본이다 — 같은 뜻을 두 모양으로 그리지 않게.
import { reasonCountsText } from "./step1-helpers";
export { NOTICE_CATEGORIES, isNoticeCategory } from "../rules/notice-category";
export type { NoticeCategory } from "../rules/notice-category";

export function canConfirmSend(opts: {
  targetsOk: boolean;
  tooMany: boolean;
  noticeCategory: string;
}): boolean {
  return opts.targetsOk && !opts.tooMany && isNoticeCategory(opts.noticeCategory);
}

/** 진행 표 머리글. ★진행을 아직 못 받은 동안(되살린 직후)을 「발송이 멈췄어요」로 그리면 담당자가 사고로 읽는다. */
export const PROGRESS_LOADING_HEADLINE = "진행 상황을 불러오는 중…";

export function progressHeadline(status: string | null | undefined): string {
  if (!status) return PROGRESS_LOADING_HEADLINE;
  if (status === "running") return "보내는 중이에요";
  if (status === "done") return "발송이 끝났어요";
  return "발송이 멈췄어요";
}

/** 화면이 처음 뜰 때 보관한 작업 번호로 되살릴지 — 되살릴 값이 없으면 null. */
export function restoredJobFromStore(saved: string | null | undefined): { jobId: string } | null {
  const jobId = (saved ?? "").trim();
  return jobId ? { jobId } : null;
}

/** 되살린 작업이 사라졌을 때(404) 담당자에게 보이는 한 줄 — 그냥 1단계로 돌려보내면 왜 돌아왔는지 모른다. */
export const JOB_GONE_NOTICE = "이전 발송 기록을 찾을 수 없어 처음부터 시작합니다.";

export interface SkippedNotice {
  /** 발송 통로가 걸러낸 사람 수 합계. */
  total: number;
  /** 「수신거부 1 · 중복 번호 1」 — 1단계와 같은 문법(reasonCountsText). */
  text: string;
}

/**
 * 발송 응답의 `skipped` 를 화면 문구로.
 *
 * ★고른 인원과 실제로 나간 인원이 다른 이유를 사람이 알아야 한다 — 조용히 줄어들면 사고로 읽는다.
 * ★서버가 `skipped` 를 안 주던 **옛 응답도 견딘다** → null 이면 화면은 아무것도 안 그린다.
 *  사유 순서(대상 아님 · 번호 없음 · 수신거부 · 중복 번호 · 범위 밖)는 서버가 정한 대로 지킨다 —
 *  여기서 다시 정렬하면 앱마다 다른 순서로 보인다.
 */
export function skippedNotice(raw: unknown): SkippedNotice | null {
  if (!Array.isArray(raw)) return null;
  const pairs: Array<{ reason: string; count: number }> = [];
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { reason, count } = item as { reason?: unknown; count?: unknown };
    if (typeof reason !== "string" || !reason.trim()) continue;
    const n = typeof count === "number" && Number.isFinite(count) ? Math.trunc(count) : 0;
    if (n <= 0) continue; // 0건 사유까지 늘어놓으면 「안 빠졌는데 빠졌다」로 읽힌다
    pairs.push({ reason: reason.trim(), count: n });
    total += n;
  }
  if (total === 0) return null;
  return { total, text: reasonCountsText(pairs) };
}

type BadgeVariant = "default" | "blue" | "green" | "red" | "yellow" | "purple";

export interface AlimtalkBadge {
  label: string;
  variant: BadgeVariant;
}

/**
 * 알림톡 결과 딱지.
 *
 * ★「도착했어요」는 쓰지 않는다 — 우리가 아는 것은 발송사 접수(보냄)까지다.
 *  열어 봄은 링크를 연 기록(미리보기가 훑은 경우 포함)이라 참고용이다.
 */
/**
 * 알림 상태 딱지.
 *
 * ★`rowStatus`(pending/sent/failed)를 반드시 함께 본다. 500명 발송은 20분 넘게 도는데,
 *  아직 차례가 안 온 사람까지 「모름」으로 그리면 담당자가 **「아무것도 안 갔다」로 읽는다.**
 * ★「도착했어요」라고 쓰지 않는다 — 우리가 아는 것은 발송사가 접수했다는 것까지다.
 */
export function alimtalkBadgeOf(
  alimtalkStatus: string,
  viewedAt: string | Date | null,
  rowStatus?: string,
): AlimtalkBadge {
  if (viewedAt) return { label: "열어 봄", variant: "blue" };
  if (alimtalkStatus === "sent") return { label: "알림 보냄", variant: "green" };
  if (alimtalkStatus === "failed") return { label: "알림 실패", variant: "red" };
  if (rowStatus === "pending") return { label: "발송 대기", variant: "default" };
  if (rowStatus === "failed") return { label: "안내 실패", variant: "red" };
  return { label: "모름", variant: "default" };
}

export function alimtalkFailedCountOf(rows: { alimtalkStatus: string }[]): number {
  return rows.filter((r) => r.alimtalkStatus === "failed").length;
}

/** 「실패한 이유」 칸 — 안내(채널톡) 실패면 그 이유, 알림톡만 실패면 알림톡 사유, 아니면 「—」. */
export const ALIMTALK_REASON_MISSING = "알림톡 실패 — 사유가 기록되지 않았어요";

export function failureReasonOf(r: {
  status: string;
  error: string;
  alimtalkStatus: string;
  /** 통로가 안 내려보내던 옛 응답에는 없다. */
  alimtalkError?: string;
}): string {
  if (r.status === "failed") return r.error?.trim() || "알 수 없음";
  // ★알림톡만 실패한 사람은 status 가 sent 라 여기로 온다 — 사유가 없으면 「—」로 숨기지 않는다.
  if (r.alimtalkStatus === "failed") return r.alimtalkError?.trim() || ALIMTALK_REASON_MISSING;
  return "—";
}
