/** 알림톡 문안 `#{안내구분}` 에 그대로 들어가는 값. 비면 카카오가 거절할 수 있다. */
import { isNoticeCategory } from "../rules/notice-category";
// 사유별 건수 문법(「수신거부 1 · 중복 번호 1」)과 환불 판정은 1단계 도우미가 정본이다 —
// 같은 뜻을 두 모양으로 그리거나, 표와 발송 확인이 서로 다른 기준으로 환불을 세지 않게.
import { isRefunded, reasonCountsText } from "./step1-helpers";
export { NOTICE_CATEGORIES, isNoticeCategory } from "../rules/notice-category";
export type { NoticeCategory } from "../rules/notice-category";

/**
 * 안내구분을 **안 골랐을 때 서버가 대신 붙이는** 글자 — 화면은 보여 주기만 한다.
 *
 * ★화면이 이 값을 실어 보내지 않는다. 서버 규칙은 「빈 값이면 서버가 기본값을 붙이고,
 *  목록에 없는 값이면 거절」이라 화면이 지어내 보내면 시험 발송이 통째로 거절된다
 *  (이 글자는 NOTICE_CATEGORIES 에 없다 — 그래서 고르개에도 안 나온다).
 */
export const DEFAULT_NOTICE_CATEGORY_LABEL = "진행 상황 안내";

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
    // ★숫자로 받아 낸다 — 통로가 "2" 처럼 글자로 보내도 경고가 통째로 사라지면 안 된다.
    //  같은 응답의 blockedCount·outOfScopeCount 도 화면이 Number(...) 로 받는다(동작을 맞춘다).
    // ★단 숫자·글자만 받는다. `Number(true)` 는 1이라, 망가진 값이 「1명」이라는 **실제보다 작은
    //  거짓 경고**가 되고 그 경고가 옛 blockedCount 안내까지 숨긴다.
    if (typeof count !== "number" && typeof count !== "string") continue;
    const n = Math.trunc(Number(count));
    if (!Number.isFinite(n) || n <= 0) continue; // 0건 사유까지 늘어놓으면 「안 빠졌는데 빠졌다」로 읽힌다
    pairs.push({ reason: reason.trim(), count: n });
    total += n;
  }
  if (total === 0) return null;
  return { total, text: reasonCountsText(pairs) };
}

/** 발송 확인에 띄우는 환불 고객 경고. 없으면 null. */
export interface RefundedNotice {
  count: number;
  /** 「가나다 · 라마바 외 3곳」 — 전부 늘어놓지 않는다. */
  text: string;
}

/** 이름 몇 개만 보여 준다 — 전부 늘어놓으면 경고가 목록이 되어 안 읽힌다. */
export const REFUNDED_NAMES_SHOWN = 2;

/**
 * 고른 명단에 섞인 환불 고객.
 *
 * ★전체 선택이 목록 아래쪽 환불 고객까지 담아도 3단계엔 인원수만 나와 다시 확인할 길이 없었다.
 *  **고르는 동작은 그대로 두고**(사장님은 「표시」만 요구했다) 발송 직전에 알린다.
 * ★판정은 `isRefunded` 하나뿐 — 진행상태 글자로 세지 않는다.
 */
export function refundedNotice(
  selected: Array<{ refundedAt?: string | null; companyName?: string }>,
  maxNames: number = REFUNDED_NAMES_SHOWN,
): RefundedNotice | null {
  const rows = selected.filter(isRefunded);
  if (rows.length === 0) return null;
  const names: string[] = [];
  for (const r of rows) {
    if (names.length >= Math.max(0, maxNames)) break;
    const name = (r.companyName ?? "").trim();
    if (name) names.push(name);
  }
  const rest = rows.length - names.length;
  const text =
    names.length === 0
      ? ""
      : rest > 0
        ? `${names.join(" · ")} 외 ${rest}곳`
        : names.join(" · ");
  return { count: rows.length, text };
}

/**
 * 발송 1건 단가(원, 부가세 별도).
 *
 * ★화면에 상수로 박지 않는다 — 우리가 실제로 무는 값은 비즈톡 계약(알림톡)과 채널톡 요금표(문자)라
 *  요금이 바뀌면 화면 글자만 옛날 값으로 남는다. 서버가 목록 응답에 실어 주는 값을 그대로 쓴다.
 */
export interface BulkPricing {
  /** 카카오 알림톡 1건 — 받는 분 전원에게 나간다. */
  alimtalkWon: number;
  /** 문자 1건 최대(장문) — 채널톡에 번호가 저장된 분에게만, 채널톡이 따로 보낸다. */
  smsMaxWon: number;
}

/** 서버가 값을 안 주던 옛 응답을 위한 기본값 — 2026-09-04 실제 계약 단가. */
export const DEFAULT_PRICING: BulkPricing = { alimtalkWon: 5, smsMaxWon: 28 };

/** 단가 한 칸을 받아 낸다 — 숫자가 아니거나 0 이하·NaN·Infinity 면 그 칸만 기본값으로 접는다. */
function pricePerUnit(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return fallback;
  return raw;
}

/**
 * 목록 응답의 `pricing` 을 화면이 쓸 단가로.
 *
 * ★칸마다 따로 접는다 — 한 칸이 망가졌다고 멀쩡한 다른 칸까지 기본값으로 되돌리면
 *  「서버가 준 값」과 「우리가 아는 값」이 섞여 담당자에게 보이는 금액이 조용히 틀어진다.
 * ★값이 아예 없어도(옛 서버) 화면은 그대로 돈다 — 여기서 던지면 3단계가 통째로 깨진다.
 */
export function parsePricing(v: unknown): BulkPricing {
  if (!v || typeof v !== "object") return { ...DEFAULT_PRICING };
  const raw = v as { alimtalkWon?: unknown; smsMaxWon?: unknown };
  return {
    alimtalkWon: pricePerUnit(raw.alimtalkWon, DEFAULT_PRICING.alimtalkWon),
    smsMaxWon: pricePerUnit(raw.smsMaxWon, DEFAULT_PRICING.smsMaxWon),
  };
}

/**
 * 이번 발송의 예상 비용(원).
 *
 * ★3단계 표와 발송 확인 모달이 **같은 함수**로 센다 — 두 곳에서 따로 곱하면 숫자가 어긋나고,
 *  담당자는 발송 직전에 금액이 바뀐 것으로 읽는다.
 * ★인원이 정수가 아니거나 0 이하면 0 — 「약 NaN원」을 그리느니 0을 그린다.
 */
export function estimateCost(count: number, p: BulkPricing): { alimtalk: number; smsMax: number } {
  if (!Number.isInteger(count) || count <= 0) return { alimtalk: 0, smsMax: 0 };
  return {
    alimtalk: Math.round(count * p.alimtalkWon),
    smsMax: Math.round(count * p.smsMaxWon),
  };
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
