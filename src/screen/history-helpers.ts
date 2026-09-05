// 「발송 기록」 탭이 쓰는 판정·문구 — 순수 함수만. 그림은 screen/HistoryTab.tsx 가 그린다.
//
// 응답의 정본은 서버 `src/lib/services/bulk-message/history.ts` 다
// (`listJobsHistory` · `listCompaniesHistory` · `companyHistory`).
// 여기 타입은 그 반환 모양을 **그대로** 옮긴 것이라, 서버가 칸을 늘리면 여기도 늘린다.
//
// ★신호 글자를 화면이 새로 만들지 않는다 — 서버가 준 한 마디(`emailSignal`·`chatSignal`)를
//  딱지 모양으로만 바꾼다. 두 곳이 각자 세면 발송 현황과 발송 기록이 같은 사람을 다르게 말한다.

// 3단계 발송 현황이 쓰는 이메일 신호 판정을 그대로 빌린다 — 같은 줄을 두 화면이 다르게 말하지 않게.
import { emailSignalOf } from "./step3-helpers";

/** 딱지 색 — `ui/Badge.tsx` 의 variant 와 같은 값(그 파일이 타입을 안 내보내 여기 다시 적는다). */
type BadgeVariant = "default" | "blue" | "green" | "red" | "yellow" | "purple";

export interface HistoryBadge {
  label: string;
  variant: BadgeVariant;
  /** 「확인함」·「열어 봄」처럼 **고객이 실제로 반응한** 신호만 굵게. 모양·색은 그대로다. */
  strong?: boolean;
}

export type HistoryMode = "jobs" | "companies";

/** 채널 — 서버 `channelOf` 가 주는 네 값. 빈 글자는 「통로를 모름」(옛 작업). */
export type HistoryChannel = "chat" | "email" | "both" | "";

/** 발송별 한 줄 — 서버 `JobHistoryRow`. */
export interface HistoryJobRow {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  senderName: string;
  senderEmail: string;
  sourceApp: string;
  channel: HistoryChannel;
  title: string;
  status: string;
  total: number;
  sent: number;
  chatViewed: number;
  emailSent: number;
  delivered: number;
  viewed: number;
  bounced: number;
}

/** 사업장별 한 줄 — 서버 `CompanyHistoryRow`. 연락처·주소는 서버가 이미 가려서 준다. */
export interface HistoryCompanyRow {
  key: string;
  companyName: string;
  representative: string;
  phone: string;
  email: string;
  count: number;
  lastReceivedAt: string | null;
  lastSignal: string;
}

/** 회사 한 곳이 받은 안내 한 줄 — 서버 `CompanyHistoryItem`. */
export interface HistoryCompanyItem {
  jobId: string;
  createdAt: string;
  title: string;
  channel: HistoryChannel;
  senderName: string;
  emailSignal: string;
  chatSignal: string;
  emailSource: string;
  emailError: string;
  status: string;
  error: string;
}

/** 회사 상세 — 서버 `CompanyHistoryDetail`. */
export interface HistoryCompanyDetail {
  key: string;
  companyName: string;
  representative: string;
  phone: string;
  email: string;
  bizNo: string;
  sourceRowId: string;
  items: HistoryCompanyItem[];
}

/** 검색을 서버에 묻기 전 기다리는 시간 — 한 글자마다 조회를 던지지 않게. */
export const HISTORY_DEBOUNCE_MS = 300;

export const HISTORY_SEARCH_PLACEHOLDER =
  "회사명 · 대표자명 · 연락처 뒷자리 · 이메일 · 제목 · 보낸 사람으로 검색";

/**
 * 남이 보낸 발송의 상세를 눌렀을 때.
 *
 * ★목록은 같은 앱의 **모든 직원 발송**을 보여 주지만, 상세를 여는 통로는 「내가 보낸 것」만 연다
 *  (서버 `getJob` 의 senderEmail 검문). 「불러오지 못했어요」로 뭉뚱그리면 담당자가
 *  고장으로 읽고 계속 다시 누른다.
 */
export const HISTORY_JOB_FORBIDDEN =
  "이 발송은 다른 담당자가 보낸 것이라 수신자 목록을 열 수 없어요. 사업장별 보기에서는 그 회사가 받은 안내를 볼 수 있어요.";

export function historyModeLabel(mode: HistoryMode): string {
  return mode === "companies" ? "사업장별" : "발송별";
}

export const HISTORY_MODE_OPTIONS: Array<{ value: HistoryMode; label: string }> = [
  { value: "jobs", label: "발송별" },
  { value: "companies", label: "사업장별" },
];

/* ────────────────────────────── 검색 ────────────────────────────── */

/**
 * 검색어·비교할 글자를 같은 모양으로 눕힌다 — 대소문자·띄어쓰기·가림표(•)·하이픈을 지운다.
 *
 * ★번호는 화면에서 가려져 있다(010-2•••-4567) — 사람이 「4567」만 치는데 가림표가 섞여 있으면
 *  글자 그대로는 안 걸린다. 그래서 비교 전에 양쪽에서 그 기호들을 뺀다.
 */
export function normalizeHistoryQuery(v: string): string {
  return String(v ?? "").toLowerCase().replace(/[\s•·\-_.]/g, "");
}

/**
 * 응답 안에서 발송별 목록을 한 번 더 좁힌다.
 *
 * ★서버가 이미 걸러 준다 — 이것은 **응답이 오기 전까지** 화면이 멈춰 보이지 않게 하는 즉시
 *  좁히기다(디바운스 300ms 동안 옛 목록이 그대로 보이는 것을 막는다).
 * ★수신자(회사명·대표)로 걸린 발송은 이 함수가 못 살린다 — 목록 줄에 회사 이름이 없기 때문이다.
 *  그래서 **검색어가 있으면 서버 응답을 그대로 믿고**, 즉시 좁히기는 서버 응답이 도착하기 전
 *  옛 목록에만 쓴다(HistoryTab 이 그렇게 부른다).
 */
export function filterJobs(jobs: HistoryJobRow[], q: string): HistoryJobRow[] {
  const needle = normalizeHistoryQuery(q);
  if (!needle) return jobs;
  return jobs.filter((j) =>
    [j.title, j.senderName, j.senderEmail, j.sourceApp, formatHistoryTime(j.createdAt)].some((v) =>
      normalizeHistoryQuery(v).includes(needle),
    ),
  );
}

/* ────────────────────────────── 신호 딱지 ────────────────────────────── */

/**
 * 서버가 준 신호 한 마디 → 딱지.
 *
 * ★순서·글자는 서버 `emailSignalOf`·`chatSignalOf` 가 정본이다. 여기서는 색과 굵기만 정한다.
 * ★「보냄」은 **점 없는 기본형**이다 — 딱지 정본이 「뜻 없는 회색 점」을 없앴다(3단계와 같다).
 * ★모르는 글자(제외 사유처럼 서버가 자유롭게 적는 말)는 노란 딱지로 그대로 보여 준다 —
 *  「—」로 지우면 왜 안 갔는지가 화면에서 사라진다.
 */
export function signalBadge(sig: string): HistoryBadge | null {
  const s = String(sig ?? "").trim();
  if (!s) return null;
  if (s === "확인함") return { label: "확인함", variant: "green", strong: true };
  if (s === "열어 봄") return { label: "열어 봄", variant: "green", strong: true };
  if (s === "도착") return { label: "도착", variant: "blue" };
  if (s === "알림 보냄") return { label: "알림 보냄", variant: "blue" };
  if (s === "보냄") return { label: "보냄", variant: "default" };
  if (s === "반송·거부") return { label: "반송·거부", variant: "red" };
  if (s === "발송 대기") return { label: "발송 대기", variant: "default" };
  if (s === "중단됨") return { label: "중단됨", variant: "yellow" };
  if (s === "보내지 못함") return { label: "보내지 못함", variant: "red" };
  return { label: s, variant: "yellow" };
}

/**
 * 서버가 **빈 신호**를 줄 때 원본 `emailStatus` 로 갈라 보는 한 마디.
 *
 * ★서버 `emailSignalOf` 는 아직 안 나간 줄(`pending`)·중단된 줄(`revoked`)·못 보낸 줄(`failed`)에
 *  전부 빈 글자를 준다 — 시각 칸이 하나도 안 찍혀 있어서다. 화면이 그대로 「—」로 그리면
 *  「중단해서 안 나갔다」와 「아직 안 나갔다」와 「보내다 실패했다」가 한 모양이 된다.
 * ★모르는 상태에는 아무 말도 만들지 않는다(빈 글자) — 지어낸 글자를 딱지로 그리지 않는다.
 */
export function fallbackSignalLabel(emailStatus: string | null | undefined): string {
  const st = String(emailStatus ?? "").trim();
  if (st === "pending") return "발송 대기";
  if (st === "revoked") return "중단됨";
  if (st === "failed") return "보내지 못함";
  return "";
}

/**
 * 한 줄에 그릴 신호 하나 — 이메일 신호가 먼저, 없으면 채팅 신호, 그것도 없으면 원본 상태.
 *
 * ★이메일을 먼저 본다 — 「둘 다」로 보낸 줄에서 이메일이 반송됐는데 채팅이 「알림 보냄」이면
 *  나쁜 소식이 좋은 소식에 가려진다.
 */
export function rowSignalBadge(row: {
  emailSignal?: string | null;
  chatSignal?: string | null;
  emailStatus?: string | null;
}): HistoryBadge | null {
  const told = String(row.emailSignal ?? "").trim() || String(row.chatSignal ?? "").trim();
  return signalBadge(told || fallbackSignalLabel(row.emailStatus));
}

/* ────────────────────────────── 통로 ────────────────────────────── */

/**
 * 통로 딱지 — 「둘 다」는 **두 장**으로 그린다.
 * 한 장에 「알림톡·채팅 + 이메일」로 적으면 표 칸이 넘치고, 어느 쪽이 반송됐는지도 안 보인다.
 */
export function channelBadges(channel: HistoryChannel): HistoryBadge[] {
  const chat: HistoryBadge = { label: "알림톡·채팅", variant: "blue" };
  const email: HistoryBadge = { label: "이메일", variant: "purple" };
  if (channel === "both") return [chat, email];
  if (channel === "email") return [email];
  if (channel === "chat") return [chat];
  return [];
}

/* ────────────────────────────── 주소 출처 ────────────────────────────── */

const SOURCE_LABELS: Record<string, string> = {
  basic: "기본정보 이메일",
  tax53: "경정청구 53이메일",
  applicant: "신청자이메일",
  manual: "직접 입력",
};

/**
 * 주소 출처 한 마디(설계서 §4-8).
 * ★채팅만 나간 줄에는 주소가 없다 — 그 줄은 「대표연락처」로 간 것이다.
 */
export function emailSourceLabel(source: string | null | undefined, channel: HistoryChannel): string {
  const s = String(source ?? "").trim();
  if (SOURCE_LABELS[s]) return SOURCE_LABELS[s];
  if (s) return s;
  return channel === "chat" ? "대표연락처" : "—";
}

/* ────────────────────────────── 문구 ────────────────────────────── */

/**
 * 회사 머리 카드의 한 줄 — 「홍길동 대표 · 010-2•••-4567 · ho***@wedly.kr · 사업자번호 …」.
 *
 * ★담당·계약일은 **서버 응답에 없다**(`CompanyHistoryDetail` 에 그 칸이 없다) — 시안에는 있지만
 *  화면이 지어낼 수 없어 적지 않는다. 값이 없으면 「원문에서 확인하세요」로 떠넘기지도 않는다.
 */
export function companyMetaLine(company: {
  representative?: string;
  phone?: string;
  email?: string;
  bizNo?: string;
}): string {
  const rep = (company.representative ?? "").trim();
  const parts = [
    rep ? `${rep} 대표` : "",
    (company.phone ?? "").trim(),
    (company.email ?? "").trim() || "이메일 없음",
    (company.bizNo ?? "").trim() ? `사업자번호 ${(company.bizNo ?? "").trim()}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * 오른쪽 건수 문구.
 * ★두 보기의 숫자를 한 줄에 같이 적지 않는다 — 조회는 한 번에 한 보기만 읽어 오므로
 *  안 읽어 온 쪽 숫자는 **옛 숫자**다(같이 적으면 화면이 거짓말을 한다).
 */
export function historyCountLine(mode: HistoryMode, count: number, q: string): string {
  const unit = mode === "companies" ? `사업장 ${count.toLocaleString("ko-KR")}곳` : `발송 ${count.toLocaleString("ko-KR")}건`;
  return q.trim() ? `검색 결과 — ${unit}` : unit;
}

/** 빈 상태 한 줄 + 다음 행동. */
export function historyEmptyText(mode: HistoryMode, q: string): { title: string; hint: string } {
  if (q.trim()) {
    return {
      title: "검색어와 맞는 기록이 없어요",
      hint: "회사명 일부·대표자명·연락처 뒷자리·이메일·제목 중 하나로 다시 찾아 보세요.",
    };
  }
  return mode === "companies"
    ? {
        title: "아직 안내를 받은 사업장이 없어요",
        hint: "「발송하기」 탭에서 첫 안내를 보내면 여기에 사업장별로 쌓입니다.",
      }
    : {
        title: "아직 보낸 안내가 없어요",
        hint: "「발송하기」 탭에서 첫 안내를 보내면 여기에 기록이 남습니다.",
      };
}

/**
 * 시각 한 마디 — 「2026-09-04 10:12」(보는 사람의 시간대).
 * ★값이 없거나 모양이 아니면 「—」 — 「Invalid Date」·「1970-01-01」을 그리지 않는다.
 */
export function formatHistoryTime(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 발송 상세 머리 카드의 한 줄 — 「2026-09-04 10:12 · 김민수 · 이메일 · 받는 사람 31명 · ERP」. */
export function jobMetaLine(job: HistoryJobRow): string {
  const ch = channelBadges(job.channel).map((b) => b.label).join(" + ");
  return [
    formatHistoryTime(job.createdAt),
    job.senderName || "—",
    ch,
    `받는 사람 ${job.total.toLocaleString("ko-KR")}명`,
    job.sourceApp,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ────────────────────── 발송 상세(수신자 줄) ────────────────────── */

/**
 * 발송 상세 표의 신호 딱지.
 *
 * ★이메일 신호는 **3단계 발송 현황이 쓰는 그 함수**(`step3-helpers.emailSignalOf`)를 그대로 쓴다 —
 *  같은 조회(`GET jobs/[id]`)의 같은 줄을 두 화면이 그리므로, 여기서 따로 세면 한 사람이
 *  3단계에서는 「도착」, 발송 기록에서는 다른 말로 보인다.
 * ★이메일 신호가 없으면 채팅 신호를 본다(서버 `chatSignalOf` 와 같은 순서).
 * ★그것도 없으면 원본 상태로 「발송 대기 / 중단됨 / 보내지 못함」을 가른다.
 */
export function recipientSignalBadge(r: {
  emailStatus?: string | null;
  emailSkipReason?: string | null;
  emailSentAt?: string | null;
  emailDeliveredAt?: string | null;
  emailViewedAt?: string | null;
  viewedAt?: string | null;
  alimtalkStatus?: string | null;
}): HistoryBadge | null {
  const email = emailSignalOf(r);
  if (email) return { label: email.label, variant: email.variant, strong: email.label === "확인함" };
  if (r.viewedAt) return signalBadge("열어 봄");
  if (String(r.alimtalkStatus ?? "").trim() === "sent") return signalBadge("알림 보냄");
  return signalBadge(fallbackSignalLabel(r.emailStatus));
}

/**
 * 마지막 신호가 찍힌 시각 — 여러 시각 칸 중 **가장 늦은 것**.
 * ★값이 없거나 모양이 아닌 시각은 아예 안 센다 — 「1970-01-01」이 최댓값으로 뽑히지 않게.
 */
export function lastSignalAt(r: {
  emailViewedAt?: string | null;
  emailBouncedAt?: string | null;
  emailDeliveredAt?: string | null;
  emailSentAt?: string | null;
  viewedAt?: string | null;
}): string {
  let best = "";
  let bestAt = -Infinity;
  for (const v of [r.emailViewedAt, r.emailBouncedAt, r.emailDeliveredAt, r.emailSentAt, r.viewedAt]) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    const at = new Date(s).getTime();
    if (!Number.isFinite(at)) continue;
    if (at > bestAt) { bestAt = at; best = s; }
  }
  return best;
}
