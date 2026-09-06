"use client";

// 1단계 — 받을 분 고르기.
// JSX 는 BulkMessageScreen 에서 **글자 그대로** 옮겼다(문구·클래스·들여쓰기까지 그대로).
// 상태·핸들러는 useBulkState 가 들고 있고, 이 파일은 받아서 그리기만 한다.

import { AlertTriangle, Mail, MessageSquare, RotateCcw, Search, Users, X } from "lucide-react";
import { Checkbox, SegmentedControl, StatCard, StatusBox } from "@wedly/ui-shared/ui";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import CustomSelect from "../../ui/CustomSelect";
import { Input } from "../../ui/Input";
import { cn } from "../../ui/cn";
import { MAX_RECIPIENTS } from "../limits";
import {
  CHANNEL_OPTIONS,
  LOADING_TARGETS_HINT,
  MANAGER_LOCKED_LABEL,
  MANAGER_UNKNOWN_LABEL,
  SEARCH_PLACEHOLDER,
  channelNote,
  droppedSummary,
  emailMode,
  excludeChipVariant,
  isRefunded,
  managerControl,
  statusBadgesOf,
  type BulkChannel,
  type EmailTargetCounts,
  type ManagerLock,
  type ManualEmail,
  type PickedDrop,
  type Step1ListPhase,
} from "../step1-helpers";
import { LoadingStat, SectionHead, displayPhone, won } from "../bulk-ui";
import { keyOf, type ManualEmailEdit, type Step, type Target } from "../useBulkState";

/**
 * 표의 이메일 칸 하나 — 세 가지 모습.
 *  ① 고치는 중: 입력창 + 확인·취소 + 「고객 자료에도 저장」 + (오류면) 빨간 한 줄
 *  ② 주소가 있음: 주소 + (손으로 넣은 것이면) 「직접 입력」 딱지
 *  ③ 주소가 없음: — 과 「직접 입력」 단추
 */
function EmailCell({
  row,
  edit,
  manual,
  onStart,
  onChange,
  onTogglePersist,
  onCancel,
  onSave,
}: {
  row: Target;
  edit?: ManualEmailEdit;
  manual?: ManualEmail;
  onStart: () => void;
  onChange: (value: string) => void;
  onTogglePersist: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const who = row.companyName || row.representative || "이 회사";
  if (edit) {
    const errorId = `bm-email-err-${keyOf(row)}`;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={edit.draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter 로 확인, Esc 로 취소 — 여러 줄을 이어서 채울 때 손이 자판을 안 떠나게.
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoFocus
          placeholder="ceo@company.co.kr"
          aria-label={`${who} 이메일 주소`}
          aria-invalid={edit.error ? true : undefined}
          aria-describedby={edit.error ? errorId : undefined}
          /* ★고정 폭 — 늘어나는 칸이면 같은 줄의 「발송」 딱지가 눌려 3~4줄로 무너진다(1280px 실측). */
          className={cn("h-8 w-56", edit.error && "border-wedly-red")}
        />
        <Button type="button" size="xs" onClick={onSave}>
          확인
        </Button>
        <Button type="button" size="xs" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Checkbox
          checked={edit.persist}
          onChange={onTogglePersist}
          label="고객 자료에도 저장"
          className="[&>span]:text-wedly-hint [&>span]:text-wedly-t2"
        />
        {edit.error && (
          <p
            id={errorId}
            role="alert"
            className="basis-full text-wedly-hint font-semibold text-wedly-red break-keep"
          >
            {edit.error}
          </p>
        )}
      </div>
    );
  }
  if (row.email) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {/* 주소에는 띄어쓰기가 없어 break-keep 으로는 못 접는다 — 여기만 글자 단위로 접는다. */}
        <span className="min-w-0 break-all">{row.email}</span>
        {manual && <Badge variant="blue">직접 입력 · {manual.persist ? "자료 저장" : "이번만"}</Badge>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-wedly-t2">—</span>
      <Button type="button" size="xs" variant="secondary" onClick={onStart}>
        직접 입력
      </Button>
    </span>
  );
}

export interface Step1TargetsProps {
  lockedToMe: ManagerLock;
  managerFilter: string;
  onManagerChange: (value: string) => void;
  managerOptions: Array<{ value: string; label: string }>;
  search: string;
  setSearch: (value: string) => void;
  channel: BulkChannel;
  setChannel: (value: BulkChannel) => void;
  targetCounts: EmailTargetCounts;
  noEmailCount: number;
  pickedTotals: { total: number; email: number };
  manualEmails: Map<string, ManualEmail>;
  manualEdits: Map<string, ManualEmailEdit>;
  startManualEmail: (key: string) => void;
  changeManualEmail: (key: string, draft: string) => void;
  toggleManualPersist: (key: string) => void;
  cancelManualEmail: (key: string) => void;
  saveManualEmail: (row: Target) => void;
  listPhase: Step1ListPhase;
  loadError: string;
  retryLoad: () => void;
  droppedPicked: PickedDrop[];
  setDroppedPicked: (rows: PickedDrop[]) => void;
  loadingTargets: boolean;
  loadedOnce: boolean;
  visibleTargets: Target[];
  sendableTargets: Target[];
  excludeSummary: string;
  allChecked: boolean;
  toggleAll: () => void;
  picked: Map<string, Target>;
  toggleOne: (row: Target) => void;
  goStep: (s: Step) => void;
  targetsOk: boolean;
  selectedCount: number;
  hiddenPicked: number;
}

export function Step1Targets({
  lockedToMe,
  managerFilter,
  onManagerChange,
  managerOptions,
  search,
  setSearch,
  channel,
  setChannel,
  targetCounts,
  noEmailCount,
  pickedTotals,
  manualEmails,
  manualEdits,
  startManualEmail,
  changeManualEmail,
  toggleManualPersist,
  cancelManualEmail,
  saveManualEmail,
  listPhase,
  loadError,
  retryLoad,
  droppedPicked,
  setDroppedPicked,
  loadingTargets,
  loadedOnce,
  visibleTargets,
  sendableTargets,
  excludeSummary,
  allChecked,
  toggleAll,
  picked,
  toggleOne,
  goStep,
  targetsOk,
  selectedCount,
  hiddenPicked,
}: Step1TargetsProps) {
  const emailShown = emailMode(channel);
  return (
        <Card>
          <SectionHead
            no="01"
            tone="accent"
            icon={Users}
            title="받을 분 고르기"
            desc="계약일이 적힌 고객이 자동으로 올라와요. 보낼 분을 체크해 주세요"
          />

          {/* ★통로를 맨 위에서 고른다 — 이 하나가 표의 이메일 열·숫자 카드·「전체 고르기」까지 다 가른다. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="어떤 통로로 보낼까요" className="flex min-w-0 flex-col gap-1">
              <span className="text-wedly-label font-semibold text-wedly-muted">어떤 통로로 보낼까요</span>
              <SegmentedControl
                options={CHANNEL_OPTIONS}
                value={channel}
                onChange={(v) => setChannel(v as BulkChannel)}
                // 시안의 구간 단추 모양(회색 트랙 + 테두리 + 둥근 네모)을 토큰으로.
                className="rounded-xl border border-wedly-bd bg-wedly-bg-gray p-[3px] [&>button]:rounded-[9px]"
              />
            </div>
            <p className="min-w-0 max-w-[460px] flex-1 basis-[260px] self-end pb-1 text-wedly-hint text-wedly-muted break-keep">
              {channelNote(channel)}
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            {/* ★화면의 잠금은 거들 뿐이다 — 실제 방어는 서버(lockedToMe 를 내려주는 쪽)에 있다.
                ★아직 답을 못 받았으면(모름) 고르개를 **아예 안 그린다** — 파트너 앱에서 첫 조회가
                  실패했을 때 「전체」를 고를 수 있는 것처럼 보이면 화면이 거짓말을 한다. */}
            {managerControl(lockedToMe) === "picker" ? (
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="bm-manager" className="text-wedly-label font-semibold text-wedly-muted">
                  담당 컨설턴트
                </label>
                <CustomSelect
                  id="bm-manager"
                  aria-label="담당 컨설턴트"
                  value={managerFilter}
                  onChange={onManagerChange}
                  options={managerOptions}
                  // 알약 — 옆의 검색 칸과 같은 모양으로(공용 부품은 안 건드리고 이 화면만).
                  className="w-[200px] [&>button]:rounded-full [&>button]:pl-4"
                />
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-wedly-label font-semibold text-wedly-muted">담당 컨설턴트</span>
                <div
                  className="flex h-10 w-[200px] items-center rounded-full border border-wedly-bd bg-wedly-bg-gray px-4 text-wedly-sub text-wedly-t2"
                  aria-live="polite"
                >
                  {managerControl(lockedToMe) === "locked" ? MANAGER_LOCKED_LABEL : MANAGER_UNKNOWN_LABEL}
                </div>
              </div>
            )}

            <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1">
              <label htmlFor="bm-search" className="text-wedly-label font-semibold text-wedly-muted">
                {emailShown ? "상호명 · 대표자명 · 연락처 · 이메일 검색" : "상호명 · 대표자명 · 연락처 검색"}
              </label>
              <div className="flex h-10 items-center gap-2 rounded-full border border-wedly-bd bg-white px-4 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wedly-accent">
                <Search className="h-4 w-4 shrink-0 text-wedly-muted" aria-hidden />
                {/*
                  ★`type="search"` 를 쓰지 않는다 — 크롬·사파리가 **자기 지우개(✕)를 덧그려**
                   우리 지우개 단추와 나란히 ✕ 가 둘로 보인다(배포본 실측 1178px·1206px).
                   브라우저 기본 지우개는 WEDLY 토큰을 안 따르므로 우리 것만 남긴다.
                  ★`type="search"` 를 버리며 잃는 둘은 표준 속성으로 되찾는다 —
                   읽어 주는 도구의 「검색 칸」 안내는 role, 휴대폰 자판의 「검색」 키는 enterKeyHint.
                */}
                <input
                  id="bm-search"
                  type="text"
                  role="searchbox"
                  enterKeyHint="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={SEARCH_PLACEHOLDER}
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-wedly-sub text-wedly-t1 outline-none placeholder:text-wedly-muted"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="검색어 지우기"
                    className="shrink-0 rounded-full p-0.5 text-wedly-muted transition-colors duration-150 ease-out hover:text-wedly-t1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="-mt-2 mb-4 text-wedly-hint text-wedly-muted break-keep">
            상세창 계약정보에 <b className="font-semibold text-wedly-t1">계약일이 적힌 고객만</b> 올라옵니다.
            회사명·대표자명은 일부만 쳐도 찾아지고, 연락처는 뒷자리 네 개나 전체 번호 모두 됩니다.
            {emailShown && " 이메일은 기본정보 「이메일」 → 경정청구 「53이메일」 → 「신청자이메일」 순서로 찾습니다."}
          </p>

          {listPhase === "error" && (
            <StatusBox tone="error" title="목록을 불러오지 못했어요" className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-keep">{loadError}</span>
                <Button type="button" variant="secondary" size="sm" onClick={retryLoad}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  다시 시도
                </Button>
              </div>
            </StatusBox>
          )}

          {listPhase !== "error" && (<>
          {/* ★알림은 쌓이고, 사람이 닫거나 발송이 시작될 때만 사라진다 — 다음 조회가 지우면
              검색어를 천천히 치는 동안 「누가 왜 빠졌는지」를 놓친다. */}
          {droppedPicked.length > 0 && (
            <StatusBox
              tone="warning"
              title={`${won(droppedPicked.length)}명은 고른 명단에서 자동으로 뺐어요`}
              className="mb-4"
              actions={
                <Button type="button" variant="secondary" size="sm" onClick={() => setDroppedPicked([])}>
                  알림 닫기
                </Button>
              }
            >
              보낼 수 없게 바뀐 분이라 뺐습니다 — {droppedSummary(droppedPicked)}. 표에는 그대로 남아 있지만 체크가 잠깁니다.
            </StatusBox>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loadingTargets}>
            {loadingTargets ? (
              <>
                <LoadingStat />
                <LoadingStat />
                <LoadingStat />
                <LoadingStat />
              </>
            ) : (
              <>
                <StatCard
                  icon={Users}
                  label={search.trim() ? "검색에 걸린 고객" : "계약한 고객"}
                  value={`${won(targetCounts.contract)}명`}
                />
                <StatCard icon={MessageSquare} label="알림톡 가능" value={`${won(targetCounts.chatOk)}명`} />
                {/* ★알림톡·채팅만 보낼 때는 숫자 대신 「—」 — 안 쓰는 통로의 인원을 세어 두면 오해한다. */}
                <StatCard
                  icon={Mail}
                  label="이메일 가능"
                  value={emailShown ? `${won(targetCounts.emailOk)}명` : "—"}
                />
                <StatCard
                  icon={AlertTriangle}
                  label={excludeSummary ? `자동 제외 · ${excludeSummary}` : "자동 제외"}
                  value={`${won(targetCounts.excluded)}명`}
                />
              </>
            )}
          </div>

          {/* ★이메일이 없는 분을 숨기지 않는다 — 표에 남겨 두고 칸에서 주소를 넣게 한다(설계서 §4-3-1).
              ★「둘 다」에서는 **자동 제외가 아니다** — 알림톡·채팅으로는 그대로 나간다(2026-09-06 반려 2).
                그때는 같은 자리에 정보 톤으로 「어떻게 받는지」를 적는다. */}
          {channel === "both" && !loadingTargets && noEmailCount > 0 && (
            <StatusBox
              tone="info"
              title={`이메일이 없는 ${won(noEmailCount)}명은 알림톡·채팅으로만 받아요 — 표에서 직접 입력하면 이메일도 함께 갑니다`}
              className="mb-4"
            />
          )}

          {channel === "email" && !loadingTargets && noEmailCount > 0 && (
            <StatusBox
              tone="warning"
              title={`이메일이 없는 분 ${won(noEmailCount)}명은 이 발송에서 자동 제외됩니다`}
              className="mb-4"
            >
              표의 「이메일 없음」 줄에서 <b className="font-semibold text-wedly-t1">직접 입력</b>을 누르면 주소를
              넣어 바로 보낼 수 있어요(기본으로 고객 자료에도 저장, 누가 언제 넣었는지 기록). 여러 명이면
              알림톡·채팅으로 「이메일 주소를 알려 주세요」 안내를 먼저 보내는 단추를 준비하고 있어요.
            </StatusBox>
          )}

          <div className="max-h-[440px] overflow-auto rounded-2xl border border-wedly-bd" aria-busy={loadingTargets}>
            <table className="w-full min-w-[720px] border-collapse">
              {/* 표 머리 글자 크기는 머리 묶음이 정한다 — 줄·칸에 크기를 적으면 그것이 이겨서 층이 어긋난다 */}
              <thead className="text-wedly-tablehead">
                <tr className="bg-wedly-accent text-left font-semibold text-white">
                  <th scope="col" className="sticky top-0 z-10 w-10 bg-wedly-accent px-3 py-2.5">
                    <Checkbox
                      checked={allChecked}
                      onChange={toggleAll}
                      disabled={sendableTargets.length === 0}
                      aria-label="보낼 수 있는 사람 전체 고르기"
                    />
                  </th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">회사명</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">대표명</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">연락처</th>
                  {emailShown && (
                    // 「직접 입력」을 여는 동안에도 이 열이 다른 열을 밀지 않게 최소 폭을 준다.
                    <th scope="col" className="sticky top-0 z-10 min-w-[280px] bg-wedly-accent px-3 py-2.5">이메일</th>
                  )}
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">계약일</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">진행상태</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">담당</th>
                  {/* 딱지가 한 줄로 서려면 이 열이 그만큼은 있어야 한다(「번호 없음 · 이메일 없음」 기준). */}
                  <th scope="col" className="sticky top-0 z-10 min-w-[150px] bg-wedly-accent px-3 py-2.5">발송</th>
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr>
                    <td colSpan={emailShown ? 9 : 8} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted">
                      불러오는 중…
                    </td>
                  </tr>
                ) : visibleTargets.length === 0 ? (
                  <tr>
                    <td colSpan={emailShown ? 9 : 8} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted break-keep">
                      {search.trim()
                        ? "검색어와 맞는 고객이 없어요. 다른 말로 찾아 보세요."
                        : loadedOnce
                          ? "이 담당자의 계약 고객이 없어요. 담당을 바꿔 보세요."
                          : "잠시만요, 대상을 불러오고 있어요."}
                    </td>
                  </tr>
                ) : (
                  visibleTargets.map((t, i) => {
                    // 환불 판정은 **환불일이 채워졌는지** 하나로 한다(2026-09-04 사장님 확정).
                    // 3단계 경고도 같은 함수(isRefunded)를 봐야 표와 경고가 어긋나지 않는다.
                    const refunded = isRefunded(t);
                    const statusBadges = statusBadgesOf(t.statuses);
                    return (
                    <tr
                      key={`${keyOf(t)}-${i}`}
                      className={cn(
                        "border-t border-wedly-bd transition-colors duration-150 ease-out",
                        // 제외 줄은 회색 층 위라 글자를 t2 까지만 낮춘다(muted 는 색 바탕에서 안 읽힌다)
                        t.sendable ? "hover:bg-wedly-bg-page" : "bg-wedly-bg-gray/50 text-wedly-t2",
                        refunded && t.sendable && "shadow-[inset_3px_0_0_var(--wedly-red)]",
                      )}
                    >
                      <td className="px-3 py-2 align-middle">
                        <Checkbox
                          checked={picked.has(keyOf(t))}
                          disabled={!t.sendable}
                          onChange={() => toggleOne(t)}
                          aria-label={`${t.companyName || displayPhone(t)} 고르기`}
                        />
                      </td>
                      <td className={cn("min-w-0 px-3 py-2 text-wedly-sub break-keep", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.companyName || "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-wedly-sub break-keep", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.representative || "—"}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {displayPhone(t)}
                      </td>
                      {emailShown && (
                        <td className={cn("min-w-[280px] px-3 py-2 text-wedly-sub", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                          <EmailCell
                            row={t}
                            edit={manualEdits.get(keyOf(t))}
                            manual={manualEmails.get(keyOf(t))}
                            onStart={() => startManualEmail(keyOf(t))}
                            onChange={(v) => changeManualEmail(keyOf(t), v)}
                            onTogglePersist={() => toggleManualPersist(keyOf(t))}
                            onCancel={() => cancelManualEmail(keyOf(t))}
                            onSave={() => saveManualEmail(t)}
                          />
                        </td>
                      )}
                      <td className={cn("whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.contractDate || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {refunded ? (
                          <Badge variant="red">환불 {t.refundedAt}</Badge>
                        ) : statusBadges.length > 0 ? (
                          // ★딱지마다 색과 글자가 같은 값에서 나온다(statusBadgesOf). 「계약완료」가 있어도
                          //  다른 상태를 숨기지 않는다 — 진행상태 「환불」인데 환불일이 빈 줄을 못 보게 된다.
                          <span className="flex flex-wrap items-center gap-1">
                            {statusBadges.map((b) => (
                              <Badge key={b.label} variant={b.variant}>{b.label}</Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-wedly-hint text-wedly-t2">—</span>
                        )}
                      </td>
                      <td className={cn("px-3 py-2 text-wedly-sub break-keep", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.manager || "—"}
                      </td>
                      <td className="min-w-[150px] px-3 py-2">
                        {/* ★사유 글자와 칩 색이 같은 값에서 나온다(excludeChipVariant) — 색이 거짓말을 하지 않게.
                            줄의 sendable·excludeReason 은 고른 채널 기준으로 이미 갈아 끼운 값이다. */}
                        {/* ★딱지 글자는 한 줄로 세운다 — 1280px 실측에서 「발송 가 / 능」으로 끊겼다. */}
                        {t.sendable ? (
                          <Badge variant="green" className="whitespace-nowrap">발송 가능</Badge>
                        ) : (
                          <Badge variant={excludeChipVariant(t.excludeReason)} className="whitespace-nowrap">
                            {t.excludeReason || "제외"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => goStep(2)} disabled={!targetsOk}>
              안내문 만들러 가기
            </Button>
            {loadingTargets ? (
              <span className="text-wedly-hint text-wedly-muted break-keep">{LOADING_TARGETS_HINT}</span>
            ) : (
              <span className="text-wedly-hint text-wedly-muted tabular-nums break-keep">
                지금 고른 사람 <b className="font-semibold text-wedly-t1">{won(pickedTotals.total)}명</b>
                {emailShown && (
                  <>
                    {" · 이메일 "}
                    <b className="font-semibold text-wedly-t1">{won(pickedTotals.email)}명</b>
                  </>
                )}
                {hiddenPicked > 0 && `  (그중 ${won(hiddenPicked)}명은 지금 화면에 안 보여요)`}
                {selectedCount > MAX_RECIPIENTS && ` — 한 번에 ${MAX_RECIPIENTS}명까지만 보낼 수 있어요`}
              </span>
            )}
          </div>
          </>)}
        </Card>
  );
}
