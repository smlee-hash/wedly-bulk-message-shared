"use client";

// 발송 기록 탭 — 발송별 · 사업장별 · 검색.
// 시각 계약(정본): docs/superpowers/specs/2026-09-04-email-send-preview.html 의 「발송 기록」 판.
//
// ★이 판은 **읽기 전용**이다 — 여기서 무엇을 눌러도 발송이 일어나지 않는다.
// ★신호 글자는 화면이 만들지 않는다(history-helpers 가 서버 값을 딱지로만 바꾼다).
// ★안 쓰는 통로의 숫자는 「0」이 아니라 「—」다. 알림톡만 보낸 발송에 「도착 0」이 서면
//  담당자는 「메일이 하나도 안 갔다」로 읽는다.

import { Building2, History, Inbox, Search, X } from "lucide-react";
import { SegmentedControl, StatusBox } from "@wedly/ui-shared/ui";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { won } from "./bulk-ui";
import { HistoryMailModal } from "./HistoryMailModal";
import {
  HISTORY_MODE_OPTIONS,
  HISTORY_SEARCH_PLACEHOLDER,
  MAIL_MISSING_NOTE,
  channelBadges,
  companyItemMailEnabled,
  companyJumpKey,
  companyMetaLine,
  emailSourceLabel,
  filterJobs,
  formatHistoryTime,
  historyCountLine,
  historyEmptyText,
  jobMetaLine,
  lastSignalAt,
  rowSignalBadge,
  signalBadge,
  type HistoryBadge,
  type HistoryCompanyDetail,
  type HistoryCompanyItem,
  type HistoryCompanyRow,
  type HistoryJobRecipient,
  type HistoryJobRow,
  type HistoryMailState,
  type HistoryMode,
} from "./history-helpers";

/* ────────────────────────────── 작은 조각 ────────────────────────────── */

/** 신호 딱지 한 칸 — 없으면 「—」(없는 상태를 성공으로 위장하지 않는다). */
function Signal({ badge }: { badge: HistoryBadge | null }) {
  if (!badge) return <span className="text-wedly-sub text-wedly-t2">—</span>;
  return (
    <Badge variant={badge.variant} className={badge.strong ? "font-semibold" : undefined}>
      {badge.label}
    </Badge>
  );
}

/** 통로 딱지 — 「둘 다」면 두 장. 통로를 모르는 옛 작업은 「—」. */
function Channel({ badges }: { badges: HistoryBadge[] }) {
  if (badges.length === 0) return <span className="text-wedly-sub text-wedly-t2">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badges.map((b) => (
        <Badge key={b.label} variant={b.variant}>
          {b.label}
        </Badge>
      ))}
    </span>
  );
}

/** 숫자 한 칸 — 그 통로를 안 썼으면 「—」. */
function Num({ value, shown }: { value: number; shown: boolean }) {
  if (!shown) return <span className="text-wedly-t2">—</span>;
  return <>{won(value)}</>;
}

const TH = "sticky top-0 z-10 bg-wedly-accent px-3 py-2.5";
const TH_NUM = `${TH} text-right`;
const TD = "px-3 py-2 text-wedly-sub text-wedly-t1";
const TD_NUM = "px-3 py-2 text-wedly-sub text-wedly-t1 text-right tabular-nums";

/** 불러오는 동안의 자리지킴 — 표 칸이 흔들리지 않게 같은 칸 수로 그린다. */
function TableSkeleton({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-wedly-bd">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-3 py-3">
              <span className="block h-3 w-full rounded-full bg-wedly-bg-gray motion-safe:animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** 빈 상태 — 아이콘 타일 + 한 줄 + 다음 행동. */
function EmptyRow({
  cols,
  title,
  hint,
}: {
  cols: number;
  title: string;
  hint: string;
}) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-2 text-center">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wedly-bg-gray">
            <Inbox className="h-5 w-5 text-wedly-t2" aria-hidden />
          </span>
          <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{title}</p>
          <p className="text-wedly-hint text-wedly-t2 break-keep">{hint}</p>
        </div>
      </td>
    </tr>
  );
}

/** 표를 감싸는 상자 — 넓은 표는 이 안에서만 옆으로 밀린다(본문이 옆으로 안 밀리게). */
function TableBox({ children, min }: { children: React.ReactNode; min: string }) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-2xl border border-wedly-bd">
      <table className={cn("w-full border-collapse", min)}>{children}</table>
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="link" size="sm" onClick={onClick} className="mb-3">
      ‹ {label}
    </Button>
  );
}

/** 상세 머리 카드 — 왼쪽에 이름·설명, 오른쪽에 딱지·단추. */
function DetailHead({
  title,
  meta,
  right,
}: {
  title: string;
  meta: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-wedly-bd bg-white px-4 py-3 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
      <div className="min-w-0">
        <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{title || "—"}</p>
        <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{meta}</p>
      </div>
      {right != null && (
        <div className="flex flex-wrap items-center justify-end gap-2">{right}</div>
      )}
    </div>
  );
}

/* ────────────────────────────── 본체 ────────────────────────────── */

export interface HistoryTabProps {
  mode: HistoryMode;
  setMode: (v: HistoryMode) => void;
  q: string;
  setQ: (v: string) => void;
  /** 지금 목록이 답하고 있는 검색어 — 이 값과 `q` 가 다를 때만 화면이 스스로 좁힌다. */
  loadedQ: string;
  /**
   * 지금 들고 있는 목록이 **어느 보기**의 것인가(아직 아무것도 안 읽었으면 null).
   * ★건수 문구는 이 값이 지금 보기와 같을 때만 적는다 — 「이 회사의 다른 발송 ›」로 뛰면
   *  보기만 사업장별로 바뀌고 목록은 안 읽어, 예전에는 「사업장 0곳」이라고 거짓말했다.
   */
  loadedMode: HistoryMode | null;
  jobs: HistoryJobRow[];
  companies: HistoryCompanyRow[];
  view: "list" | "job" | "company";
  job: HistoryJobRow | null;
  jobRecipients: HistoryJobRecipient[];
  company: HistoryCompanyDetail | null;
  loading: boolean;
  error: string;
  openJob: (job: HistoryJobRow) => void;
  openCompany: (key: string) => void;
  closeDetail: () => void;
  retry: () => void;
  /** 「서식 보기」 모달 — `null` 이면 닫힘. */
  mail: HistoryMailState | null;
  openMail: (r: HistoryJobRecipient) => void;
  /** 회사 상세 표의 「서식 보기」— 발송 상세와 같은 모달을 연다. */
  openCompanyMail: (item: HistoryCompanyItem) => void;
  closeMail: () => void;
  retryMail: () => void;
}

export function HistoryTab({
  mode,
  setMode,
  q,
  setQ,
  loadedQ,
  loadedMode,
  jobs,
  companies,
  view,
  job,
  jobRecipients,
  company,
  loading,
  error,
  openJob,
  openCompany,
  closeDetail,
  retry,
  mail,
  openMail,
  openCompanyMail,
  closeMail,
  retryMail,
}: HistoryTabProps) {
  // ★응답이 도착한 뒤에는 서버 결과를 그대로 믿는다 — 수신자 이름으로 걸린 발송은 목록 줄에
  //  회사 이름이 없어, 화면이 한 번 더 거르면 **맞는 결과가 조용히 사라진다.**
  const shownJobs = loadedQ === q ? jobs : filterJobs(jobs, q);
  const listCount = mode === "companies" ? companies.length : shownJobs.length;
  const empty = historyEmptyText(mode, q);

  return (
    <Card>
      {/* 머리 — 시계 타일 + 제목 + 설명 */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-wedly-accent shadow-sm">
            <History className="h-[18px] w-[18px] text-white" aria-hidden />
          </span>
          <h2 className="min-w-0 text-wedly-section font-semibold text-wedly-t1 break-keep">발송 기록</h2>
          <span className="ml-auto text-wedly-hint text-wedly-muted break-keep">
            발송별로도, 사업장별로도 봅니다 — 검색하면 두 보기 모두 좁혀집니다
          </span>
        </div>
        <div className="ml-[42px] mt-2 h-1 w-10 rounded-full bg-wedly-accent" />
      </div>

      {/* 구간 단추 · 검색창 · 건수 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="어떻게 볼까요">
          <SegmentedControl
            options={HISTORY_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={mode}
            onChange={(v) => setMode(v as HistoryMode)}
            // 1단계 통로 구간 단추와 같은 모양(회색 트랙 + 테두리 + 둥근 네모).
            className="rounded-xl border border-wedly-bd bg-wedly-bg-gray p-[3px] [&>button]:rounded-[9px]"
          />
        </div>

        <div className="min-w-0 flex-1 basis-[280px]">
          <label htmlFor="bm-hist-q" className="sr-only">
            {HISTORY_SEARCH_PLACEHOLDER}
          </label>
          <div className="flex h-10 items-center gap-2 rounded-full border border-wedly-bd bg-white px-4 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wedly-accent">
            <Search className="h-4 w-4 shrink-0 text-wedly-muted" aria-hidden />
            {/* 1단계 검색 칸과 같은 이유로 type="search" 를 쓰지 않는다 — 브라우저가 지우개를 덧그린다. */}
            <input
              id="bm-hist-q"
              type="text"
              role="searchbox"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={HISTORY_SEARCH_PLACEHOLDER}
              autoComplete="off"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-wedly-sub text-wedly-t1 outline-none placeholder:text-wedly-muted"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="검색어 지우기"
                className="shrink-0 rounded-full p-0.5 text-wedly-muted transition-colors duration-150 ease-out hover:text-wedly-t1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <span className="text-wedly-hint text-wedly-muted tabular-nums break-keep" aria-live="polite">
          {loadedMode === mode ? historyCountLine(mode, listCount, q) : ""}
        </span>
      </div>

      {error && (
        <StatusBox tone="error" title="기록을 불러오지 못했어요" className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-keep">{error}</span>
            {/* 회사 이력만 빼고 다시 눌러 볼 수 있다 — 목록·발송 상세는 같은 조회를 다시 던진다. */}
            {view !== "company" && (
              <Button type="button" variant="secondary" size="sm" onClick={retry}>
                다시 시도
              </Button>
            )}
          </div>
        </StatusBox>
      )}

      {/* ══════════ 발송별 목록 ══════════ */}
      {view === "list" && mode === "jobs" && (
        <>
          <TableBox min="min-w-[980px]">
            <thead className="text-wedly-tablehead">
              <tr className="bg-wedly-accent text-left font-semibold text-white">
                <th scope="col" className={TH}>보낸 시각</th>
                <th scope="col" className={TH}>보낸 사람</th>
                <th scope="col" className={TH}>채널</th>
                <th scope="col" className={TH}>제목 / 안내</th>
                <th scope="col" className={TH_NUM}>받는 사람</th>
                <th scope="col" className={TH_NUM}>도착</th>
                <th scope="col" className={TH_NUM}>확인</th>
                <th scope="col" className={TH_NUM}>열어 봄</th>
                <th scope="col" className={TH_NUM}>반송·거부</th>
                <th scope="col" className={TH}>앱</th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {loading && shownJobs.length === 0 ? (
                <TableSkeleton cols={10} />
              ) : shownJobs.length === 0 ? (
                <EmptyRow cols={10} title={empty.title} hint={empty.hint} />
              ) : (
                shownJobs.map((j) => {
                  const badges = channelBadges(j.channel);
                  const hasEmail = j.channel === "email" || j.channel === "both";
                  const hasChat = j.channel === "chat" || j.channel === "both";
                  return (
                    <tr
                      key={j.id}
                      // 줄 전체가 눌리지만 글쇠로도 열려야 한다 — 표 줄에 role/tabIndex 를 준다.
                      role="button"
                      tabIndex={0}
                      onClick={() => openJob(j)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        openJob(j);
                      }}
                      className="cursor-pointer border-t border-wedly-bd transition-colors duration-150 ease-out hover:bg-wedly-bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-wedly-accent"
                    >
                      <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatHistoryTime(j.createdAt)}</td>
                      <td className={cn(TD, "break-keep")}>{j.senderName || "—"}</td>
                      <td className="px-3 py-2"><Channel badges={badges} /></td>
                      <td className={cn(TD, "min-w-0 break-keep")}>{j.title || "—"}</td>
                      <td className={TD_NUM}>{won(j.total)}</td>
                      <td className={TD_NUM}><Num value={j.delivered} shown={hasEmail} /></td>
                      <td className={TD_NUM}><Num value={j.viewed} shown={hasEmail} /></td>
                      <td className={TD_NUM}><Num value={j.chatViewed} shown={hasChat} /></td>
                      <td className={TD_NUM}><Num value={j.bounced} shown={hasEmail} /></td>
                      <td className={cn(TD, "whitespace-nowrap")}>{j.sourceApp || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableBox>
          <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
            줄을 누르면 그 발송의 수신자별 신호가 열립니다. 「도착·확인·반송」은 이메일, 「열어 봄」은
            알림톡·채팅 숫자예요 — 안 쓴 통로는 「—」로 둡니다.
          </p>
        </>
      )}

      {/* ══════════ 사업장별 목록 ══════════ */}
      {view === "list" && mode === "companies" && (
        <>
          <TableBox min="min-w-[860px]">
            <thead className="text-wedly-tablehead">
              <tr className="bg-wedly-accent text-left font-semibold text-white">
                <th scope="col" className={TH}>회사명</th>
                <th scope="col" className={TH}>대표명</th>
                <th scope="col" className={TH}>연락처</th>
                <th scope="col" className={TH}>이메일</th>
                <th scope="col" className={TH_NUM}>받은 안내</th>
                <th scope="col" className={TH}>마지막 수신</th>
                <th scope="col" className={TH}>마지막 신호</th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {loading && companies.length === 0 ? (
                <TableSkeleton cols={7} />
              ) : companies.length === 0 ? (
                <EmptyRow cols={7} title={empty.title} hint={empty.hint} />
              ) : (
                companies.map((c) => (
                  <tr
                    key={c.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCompany(c.key)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      openCompany(c.key);
                    }}
                    className="cursor-pointer border-t border-wedly-bd transition-colors duration-150 ease-out hover:bg-wedly-bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-wedly-accent"
                  >
                    <td className={cn(TD, "min-w-0 font-semibold break-keep")}>{c.companyName || "—"}</td>
                    <td className={cn(TD, "break-keep")}>{c.representative || "—"}</td>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{c.phone || "—"}</td>
                    {/* 주소에는 띄어쓰기가 없어 break-keep 으로는 못 접는다 — 여기만 글자 단위로. */}
                    <td className={cn(TD, "min-w-0 break-all")}>{c.email || "—"}</td>
                    <td className={TD_NUM}>{won(c.count)}건</td>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatHistoryTime(c.lastReceivedAt)}</td>
                    <td className="px-3 py-2"><Signal badge={signalBadge(c.lastSignal)} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </TableBox>
          <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
            회사는 사업자번호 → 줄 번호 → 연락처·이메일 순서로 묶습니다(자료에 같은 회사가 여러 줄이어도
            한 회사로). 연락처·이메일은 가려서 보여 드립니다.
          </p>
        </>
      )}

      {/* ══════════ 발송 상세 ══════════ */}
      {view === "job" && job && (
        <>
          <BackButton onClick={closeDetail} label="발송 목록으로" />
          <DetailHead
            title={job.title}
            meta={jobMetaLine(job)}
          />
          <TableBox min="min-w-[880px]">
            <thead className="text-wedly-tablehead">
              <tr className="bg-wedly-accent text-left font-semibold text-white">
                <th scope="col" className={TH}>회사명</th>
                <th scope="col" className={TH}>대표명</th>
                <th scope="col" className={TH}>연락처</th>
                <th scope="col" className={TH}>이메일</th>
                <th scope="col" className={TH}>신호</th>
                <th scope="col" className={TH}>마지막 신호</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">이 회사의 다른 발송 · 서식 보기</span>
                </th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {loading && jobRecipients.length === 0 ? (
                <TableSkeleton cols={7} />
              ) : jobRecipients.length === 0 ? (
                <EmptyRow
                  cols={7}
                  title="보여 줄 수신자가 없어요"
                  hint={error ? "위 안내를 확인해 주세요." : "이 발송에 남아 있는 수신자 기록이 없습니다."}
                />
              ) : (
                jobRecipients.map((r, i) => (
                  <tr key={r.id || `${r.phone}-${i}`} className="border-t border-wedly-bd">
                    <td className={cn(TD, "min-w-0 break-keep")}>{r.companyName || "—"}</td>
                    <td className={cn(TD, "break-keep")}>{r.representative || "—"}</td>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{r.phone || "—"}</td>
                    <td className={cn(TD, "min-w-0 break-all")}>{r.email || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2"><Signal badge={rowSignalBadge(r)} /></td>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums text-wedly-t2")}>
                      {formatHistoryTime(lastSignalAt(r))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {/* 서식이 남아 있는 줄에만 열린다 — 없는 줄을 눌러 빈 모달을 띄우지 않는다. */}
                        <Button
                          type="button"
                          variant="secondary"
                          size="xs"
                          onClick={() => openMail(r)}
                          disabled={!r.hasMail}
                        >
                          서식 보기
                        </Button>
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={() => openCompany(companyJumpKey(r))}
                          disabled={!companyJumpKey(r)}
                        >
                          이 회사의 다른 발송 ›
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableBox>
          <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
            {MAIL_MISSING_NOTE} 「이 회사의 다른 발송」은 그 회사가 받은 모든 안내를 바로 엽니다.
          </p>
        </>
      )}

      {/* ══════════ 회사 상세 ══════════ */}
      {view === "company" && company && (
        <>
          <BackButton onClick={closeDetail} label="사업장 목록으로" />
          <DetailHead
            title={company.companyName}
            meta={companyMetaLine(company)}
            right={
              <>
                <Badge variant="blue">받은 안내 {won(company.items.length)}건</Badge>
                <Signal badge={rowSignalBadge(company.items[0] ?? {})} />
              </>
            }
          />
          <TableBox min="min-w-[920px]">
            <thead className="text-wedly-tablehead">
              <tr className="bg-wedly-accent text-left font-semibold text-white">
                <th scope="col" className={TH}>받은 시각</th>
                <th scope="col" className={TH}>채널</th>
                <th scope="col" className={TH}>제목 / 안내</th>
                <th scope="col" className={TH}>보낸 사람</th>
                <th scope="col" className={TH}>신호</th>
                <th scope="col" className={TH}>주소 출처</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">서식 보기</span>
                </th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {company.items.length === 0 ? (
                <EmptyRow
                  cols={7}
                  title="받은 안내가 없어요"
                  hint="이 회사에 보낸 안내 기록이 아직 없습니다."
                />
              ) : (
                company.items.map((it, i) => (
                  <tr key={`${it.jobId}-${i}`} className="border-t border-wedly-bd">
                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatHistoryTime(it.createdAt)}</td>
                    <td className="px-3 py-2"><Channel badges={channelBadges(it.channel)} /></td>
                    <td className={cn(TD, "min-w-0 break-keep")}>{it.title || "—"}</td>
                    <td className={cn(TD, "break-keep")}>{it.senderName || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2"><Signal badge={rowSignalBadge(it)} /></td>
                    <td className={cn(TD, "whitespace-nowrap text-wedly-t2")}>
                      {emailSourceLabel(it.emailSource, it.channel)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {/* 서식이 남아 있는 줄에만 열린다 — 발송 상세와 같은 조회 함수·같은 모달. */}
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => openCompanyMail(it)}
                        disabled={!companyItemMailEnabled(it)}
                      >
                        서식 보기
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableBox>
          <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
            {MAIL_MISSING_NOTE} 이메일 서식은 90일 뒤 지워지지만 제목·보낸 시각·신호는 남습니다.
          </p>
          {/* 회사 상세는 열쇠가 무엇이었는지도 밝힌다 — 「왜 이 줄들이 한 회사인가」의 근거다. */}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-wedly-hint text-wedly-muted break-keep">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {company.bizNo
              ? `사업자번호 ${company.bizNo} 로 묶은 이력입니다.`
              : company.sourceRowId
                ? "자료의 줄 번호로 묶은 이력입니다(사업자번호가 없는 회사)."
                : "연락처·이메일로 묶은 이력입니다(사업자번호·줄 번호가 없는 회사)."}
          </p>
        </>
      )}

      {/* 서식 보기 — 어느 판에서 눌러도 이 하나가 뜬다. */}
      <HistoryMailModal mail={mail} onClose={closeMail} onRetry={retryMail} />
    </Card>
  );
}
