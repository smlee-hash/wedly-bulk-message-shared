/** 알림톡 문안 `#{안내구분}` 에 그대로 들어가는 값. 비면 카카오가 거절할 수 있다. */
import { isNoticeCategory } from "../rules/notice-category";
import type { EmailFactLock } from "../rules/email-body";
// 사유별 건수 문법(「수신거부 1 · 중복 번호 1」)과 환불 판정은 1단계 도우미가 정본이다 —
// 같은 뜻을 두 모양으로 그리거나, 표와 발송 확인이 서로 다른 기준으로 환불을 세지 않게.
import { emailMode, isRefunded, reasonCountsText, type BulkChannel } from "./step1-helpers";
// 제목 규칙·첨부 상한은 2단계가 정본이다 — 여기에 다시 적으면 2단계는 조용한데 3단계만 빨개진다.
import { attachmentTotalOk, subjectHints } from "./step2-helpers";
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

/**
 * 「보내기」가 눌리는 조건 — 통로별로 본다.
 *
 * ★대상·상한(`targetsOk`·`tooMany`)은 통로와 상관없는 검문이라 늘 본다 — 이메일만 보낼 때도
 *  0명·상한 초과는 막아야 한다.
 * ★안내구분은 **알림톡 문안의 칸**이다. 이메일에는 그 칸이 없으므로 「이메일」에서는 안 본다
 *  (보면 이메일만 보내려는 담당자가 영영 못 보낸다).
 * ★채널 칸이 없는 옛 호출은 지금까지처럼 「알림톡·채팅」으로 읽힌다(index.ts 가 내보내는 함수다).
 */
export function canConfirmSend(opts: {
  targetsOk: boolean;
  tooMany: boolean;
  noticeCategory: string;
  channel?: BulkChannel;
  /** `emailChecklist(...)` 결과. 이메일이 켜져 있는데 안 주면 **닫힌 쪽으로** 판정한다. */
  emailChecks?: EmailChecklistItem[];
}): boolean {
  if (!opts.targetsOk || opts.tooMany) return false;
  const channel = opts.channel ?? "chat";
  if (channel !== "email" && !isNoticeCategory(opts.noticeCategory)) return false;
  if (emailMode(channel)) {
    const checks = opts.emailChecks ?? [];
    if (checks.length === 0) return false;
    if (checks.some((c) => !c.ok)) return false;
  }
  return true;
}

/** 진행 표 머리글. ★진행을 아직 못 받은 동안(되살린 직후)을 「발송이 멈췄어요」로 그리면 담당자가 사고로 읽는다. */
export const PROGRESS_LOADING_HEADLINE = "진행 상황을 불러오는 중…";

/** 머리글 글자는 한 벌뿐이다 — 통로별 머리글(`sendHeadline`)도 같은 글자를 쓴다. */
export const HEADLINE_RUNNING = "보내는 중이에요";
export const HEADLINE_DONE = "발송이 끝났어요";
export const HEADLINE_STOPPED = "발송이 멈췄어요";
export const HEADLINE_CANCELLED = "발송을 중단했어요";

export function progressHeadline(status: string | null | undefined): string {
  if (!status) return PROGRESS_LOADING_HEADLINE;
  if (status === "running") return HEADLINE_RUNNING;
  if (status === "done") return HEADLINE_DONE;
  return HEADLINE_STOPPED;
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
/** 이메일이 실패로 적혔는데 사유가 안 적힌 경우. 「—」로 숨기면 담당자가 원인을 영영 모른다. */
export const EMAIL_REASON_MISSING = "이메일 실패 — 사유가 기록되지 않았어요";

/**
 * 「실패한 이유」 칸.
 *
 * ★한 줄에 두 통로가 산다 — 알림톡은 갔는데 이메일이 반송된 사람이 있다. 한쪽만 적으면
 *  나머지 실패가 표에서 사라지므로 **있는 사유를 모두** 「 · 」로 이어 적는다.
 * ★이메일 칸이 아예 없는 옛 응답·채팅 전용 발송에서는 지금까지와 글자 하나 다르지 않다.
 */
export function failureReasonOf(r: {
  status: string;
  error: string;
  alimtalkStatus: string;
  /** 통로가 안 내려보내던 옛 응답에는 없다. */
  alimtalkError?: string;
  emailStatus?: string;
  emailError?: string;
  emailSkipReason?: string;
}): string {
  const parts: string[] = [];
  if (r.status === "failed") parts.push(r.error?.trim() || "알 수 없음");
  // ★알림톡만 실패한 사람은 status 가 sent 라 여기로 온다 — 사유가 없으면 「—」로 숨기지 않는다.
  else if (r.alimtalkStatus === "failed") parts.push(r.alimtalkError?.trim() || ALIMTALK_REASON_MISSING);

  const emailStatus = (r.emailStatus ?? "").trim();
  const emailError = (r.emailError ?? "").trim();
  const emailSkip = (r.emailSkipReason ?? "").trim();
  if (emailStatus === "failed") parts.push(emailError || EMAIL_REASON_MISSING);
  // 반송·수신거부는 딱지가 이미 말하지만, 적혀 있는 사유(「주소 없음」 등)는 그대로 보여 준다.
  else if (emailError) parts.push(emailError);
  else if (emailSkip) parts.push(emailSkip);

  return parts.length ? parts.join(" · ") : "—";
}

/* ══════════════════ 이메일 3단계 (2026-09-05 신설 · 시안 §3단계) ══════════════════ */

/**
 * 발송 전 점검 한 줄.
 * `goStep` 은 **고치러 갈 단계** — 아홉 항목 모두 2단계에서 고친다(시안 `data-go="2"`).
 * 단계 번호를 `Step` 타입으로 받지 않는 이유: 그 타입은 `useBulkState` 에 있고, 여기서 부르면
 * 판정 파일이 화면 훅을 되부르는 고리가 된다.
 */
export interface EmailChecklistItem {
  label: string;
  ok: boolean;
  goStep: 1 | 2 | 3;
}

export interface EmailChecklistState {
  channel: BulkChannel;
  subject: string;
  preheader: string;
  /** `[확인 필요: …]` 표식들과 담당자가 채운 값. */
  fillMarkers: string[];
  fillValues: Record<string, string>;
  factLock: EmailFactLock | null;
  adSentences: string[];
  attachments: Array<{ bytes: number }>;
}

/**
 * 제목 규칙 검사에 넣는 **비어 있지 않은** 미리보기 문구.
 * `subjectHints` 는 미리보기 문구가 비면 한 줄을 더 내는데, 그 항목은 점검 목록의 둘째 줄이
 * 따로 세므로 여기서는 제목 쪽 규칙만 남긴다.
 */
const PREHEADER_PRESENT = "미리보기 문구";

/** 제목이 규칙(22자·금지 표현·이모지)을 지키나 — 판정 사전은 2단계 노란 줄과 같은 것 하나뿐이다. */
export function subjectRuleOk(subject: string): boolean {
  if (!subject.trim()) return false;
  return subjectHints(subject, PREHEADER_PRESENT).length === 0;
}

/**
 * 발송 전 점검 9항목(시안 §3단계 그대로).
 *
 * ★통로가 「알림톡·채팅」이면 빈 배열이다 — 이메일을 안 쓰는 담당자에게 이메일 점검표를 내밀지 않는다.
 * ★뒤 넷 중 셋(깨진 링크·수신 설정 머리글·발신 도메인)은 늘 통과다. 본문에 들어가는 링크는
 *  첨부 보관함 링크뿐이라 변수가 낀 주소가 만들어지지 않고, 머리글·수신 설정 줄과 도메인 인증은
 *  서버(서식 렌더러·발송 통로)가 붙이는 것이라 화면이 끌 수 있는 값이 아니다.
 */
export function emailChecklist(s: EmailChecklistState): EmailChecklistItem[] {
  if (!emailMode(s.channel)) return [];
  const fillsDone = s.fillMarkers.every((m) => (s.fillValues[m] ?? "").trim().length > 0);
  return [
    { label: "제목 22자 안 · 금지 표현 없음", ok: subjectRuleOk(s.subject), goStep: 2 },
    { label: "미리보기 문구 있음", ok: s.preheader.trim().length > 0, goStep: 2 },
    { label: "[확인 필요] 0개", ok: fillsDone, goStep: 2 },
    { label: "사실 잠금 통과 — 원문의 값이 정리본에 그대로", ok: !!s.factLock && s.factLock.ok, goStep: 2 },
    { label: "광고 표현 없음 — 정보성 안내만 보냅니다", ok: s.adSentences.length === 0, goStep: 2 },
    { label: "깨진 링크 0 (변수 든 링크는 「검사 불가」로 표시)", ok: true, goStep: 2 },
    { label: "첨부는 보관함 링크로 정상", ok: attachmentTotalOk(s.attachments), goStep: 2 },
    { label: "수신 설정 링크·수신거부 머리글 자동 포함", ok: true, goStep: 2 },
    { label: "발신 도메인 wedly.kr 인증(DKIM·DMARC) 정상", ok: true, goStep: 2 },
  ];
}

/** 못 통과한 항목 수 — 「미통과 N건」 안내에 쓴다. */
export function emailChecklistFailedCount(items: EmailChecklistItem[]): number {
  return items.filter((i) => !i.ok).length;
}

export interface EmailSignal {
  label: string;
  variant: BadgeVariant;
}

/**
 * 이메일 신호 딱지 — 「확인함 › 도착 › 보냄 › 반송 › 수신거부 › 제외(사유)」.
 *
 * ★순서는 서버 `bulk-message/history.ts` 의 `emailSignalOf` 와 **같다**(반송·수신거부가 맨 앞).
 *  두 곳이 다른 순서로 세면 발송 현황과 발송 기록이 같은 사람을 다르게 말한다.
 * ★열람 픽셀은 안 쓴다(설계서 §2-4) — 「열람 신호」·「자동 검사 추정」 등급은 만들지 않는다.
 *  「확인함」은 고객이 메일 안 링크·버튼을 실제로 누른 우리 서버 기록이다.
 * ★아직 아무 신호도 없으면 null — 없는 상태를 성공으로 위장하지 않는다(표는 「—」로 그린다).
 */
export function emailSignalOf(r: {
  emailStatus?: string | null;
  emailSkipReason?: string | null;
  emailSentAt?: string | null;
  emailDeliveredAt?: string | null;
  emailViewedAt?: string | null;
}): EmailSignal | null {
  const st = (r.emailStatus ?? "").trim();
  if (st === "unsubscribed" || st === "complained") return { label: "수신거부", variant: "red" };
  if (st === "bounced") return { label: "반송", variant: "red" };
  if (r.emailViewedAt) return { label: "확인함", variant: "green" };
  if (r.emailDeliveredAt) return { label: "도착", variant: "blue" };
  // 시안의 회색 점 자리 — 딱지 정본이 「뜻 없는 회색 점」을 없앴으므로 점 없는 기본형으로 그린다.
  if (r.emailSentAt) return { label: "보냄", variant: "default" };
  const reason = (r.emailSkipReason ?? "").trim();
  if (st === "skipped" || reason) return { label: reason || "제외", variant: "yellow" };
  return null;
}

/** 진행 막대가 읽는 작업 칸. 옛 응답·되살린 화면에서도 안 깨지게 전부 있을 수도 없을 수도 있다. */
export interface JobProgressLike {
  total?: number | null;
  sent?: number | null;
  failed?: number | null;
  /** 발송 응답이 준 통로별 인원. 되살린 화면에는 없다(그때는 `total` 로 접는다). */
  chatTotal?: number | null;
  emailTotal?: number | null;
  emailSent?: number | null;
  emailFailed?: number | null;
  channelChat?: boolean;
  channelEmail?: boolean;
}

/** 숫자 칸 하나 — 숫자가 아니거나 음수면 0. 「NaN / NaN명」을 그리지 않는다. */
function count(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

/**
 * 진행 막대의 「끝난 수 / 전체」.
 *
 * ★통로마다 세는 칸이 다르다 — 알림톡·채팅은 `sent+failed`, 이메일은 `emailSent+emailFailed`.
 *  「둘 다」는 두 통로를 각각 세어 더한다(한 사람이 두 번 세어지는 게 맞다 — 두 번 나가니까).
 * ★새로고침으로 되살린 화면은 통로 고르개가 기본값으로 돌아와 있다 — 작업이 **실제로 쓴** 통로
 *  (`channelChat`·`channelEmail`)를 화면 고르개보다 먼저 믿는다.
 * ★통로별 인원을 모르면(되살린 화면) 작업 전체 인원으로 접는다 — 0으로 두면 막대가 영영 안 찬다.
 */
export function progressOf(
  job: JobProgressLike | null | undefined,
  channel: BulkChannel,
): { done: number; total: number } {
  if (!job) return { done: 0, total: 0 };
  const told = typeof job.channelChat === "boolean" || typeof job.channelEmail === "boolean";
  const useChat = told ? job.channelChat === true : channel !== "email";
  const useEmail = told ? job.channelEmail === true : emailMode(channel);
  const whole = count(job.total);
  // 통로를 하나도 안 쓴 작업은 있을 수 없다 — 그런 응답이 오면 옛 화면처럼 채팅 숫자로 그린다.
  if (!useChat && !useEmail) return { done: count(job.sent) + count(job.failed), total: whole };
  let done = 0;
  let total = 0;
  if (useChat) {
    done += count(job.sent) + count(job.failed);
    total += job.chatTotal == null ? whole : count(job.chatTotal);
  }
  if (useEmail) {
    done += count(job.emailSent) + count(job.emailFailed);
    total += job.emailTotal == null ? whole : count(job.emailTotal);
  }
  return { done, total };
}

/** 진행 막대 백분율(0~100). 통로별 인원을 모를 때 끝난 수가 전체를 넘어도 막대가 안 삐져나가게 접는다. */
export function progressPercent(p: { done: number; total: number }): number {
  if (p.total <= 0) return 0;
  return Math.max(0, Math.min(100, (p.done / p.total) * 100));
}

/**
 * 통로를 함께 보는 진행 머리글.
 *
 * ★`progressHeadline(status)` 만으로는 이메일 작업을 못 읽는다 — 이메일만 보내는 작업의 `status` 는
 *  만들 때부터 "done" 이라 보내기 시작하자마자 「발송이 끝났어요」가 뜬다.
 */
export function sendHeadline(job: {
  status?: string;
  emailStatus?: string;
  stopRequested?: boolean;
  channelChat?: boolean;
  channelEmail?: boolean;
} | null | undefined): string {
  if (!job || !job.status) return PROGRESS_LOADING_HEADLINE;
  if (sendRunning(job)) return HEADLINE_RUNNING;
  if (job.stopRequested === true) return HEADLINE_CANCELLED;
  const chatDone = job.channelChat !== true || job.status === "done";
  const emailDone = job.channelEmail !== true || (job.emailStatus ?? "") === "done";
  return chatDone && emailDone ? HEADLINE_DONE : HEADLINE_STOPPED;
}

/**
 * 아직 도는 중인가 — 종료 시각을 적을 순간과 「보내는 중」 안내를 가른다.
 *
 * ★이메일만 보내는 작업은 `status` 가 만들 때부터 "done" 이다(채팅 러너가 안 돈다).
 *  `status` 만 보면 이메일이 도는 내내 「끝났다」로 읽힌다(서버 getJob 도 같은 이유로 두 칸을 본다).
 */
export function sendRunning(job: {
  status?: string;
  emailStatus?: string;
  channelChat?: boolean;
  channelEmail?: boolean;
} | null | undefined): boolean {
  if (!job) return false;
  const chat = job.channelChat !== false && job.status === "running";
  const email = job.channelEmail === true && job.emailStatus === "running";
  return chat || email;
}

/**
 * 「발송 중단」 단추를 그릴 수 있나.
 *
 * ★**이메일이 도는 동안에만** 먹힌다 — 중단 표식을 다시 읽는 것은 이메일 러너뿐이고
 *  (`bulk-message/email-runner.ts` 가 한 통마다 `stopRequested` 를 다시 조회한다),
 *  알림톡·채팅 러너에는 그 조회가 아예 없다. 안 먹히는 단추를 그려 두면 담당자가 눌러 놓고
 *  멈춘 줄 안다.
 * ★이미 눌렀으면(`stopRequested`) 다시 안 눌리게 닫는다.
 */
export function canStopSend(job: {
  status?: string;
  emailStatus?: string;
  stopRequested?: boolean;
  channelChat?: boolean;
  channelEmail?: boolean;
} | null | undefined): boolean {
  if (!job) return false;
  if (job.stopRequested === true) return false;
  return job.channelEmail === true && job.emailStatus === "running";
}
