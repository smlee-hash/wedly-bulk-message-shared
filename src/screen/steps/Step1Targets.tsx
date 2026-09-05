"use client";

// 1단계 — 받을 분 고르기.
// JSX 는 BulkMessageScreen 에서 **글자 그대로** 옮겼다(문구·클래스·들여쓰기까지 그대로).
// 상태·핸들러는 useBulkState 가 들고 있고, 이 파일은 받아서 그리기만 한다.

import { AlertTriangle, RotateCcw, Search, UserCheck, Users, X } from "lucide-react";
import { Checkbox, StatCard, StatusBox } from "@wedly/ui-shared/ui";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import CustomSelect from "../../ui/CustomSelect";
import { cn } from "../../ui/cn";
import { MAX_RECIPIENTS } from "../limits";
import {
  LOADING_TARGETS_HINT,
  MANAGER_LOCKED_LABEL,
  MANAGER_UNKNOWN_LABEL,
  SEARCH_PLACEHOLDER,
  droppedSummary,
  isRefunded,
  managerControl,
  statusBadgesOf,
  type ManagerLock,
  type PickedDrop,
  type Step1ListPhase,
} from "../step1-helpers";
import { LoadingStat, SectionHead, displayPhone, won } from "../bulk-ui";
import { keyOf, type Step, type Target } from "../useBulkState";

export interface Step1TargetsProps {
  lockedToMe: ManagerLock;
  managerFilter: string;
  onManagerChange: (value: string) => void;
  managerOptions: Array<{ value: string; label: string }>;
  search: string;
  setSearch: (value: string) => void;
  listPhase: Step1ListPhase;
  loadError: string;
  retryLoad: () => void;
  droppedPicked: PickedDrop[];
  setDroppedPicked: (rows: PickedDrop[]) => void;
  loadingTargets: boolean;
  loadedOnce: boolean;
  visibleTargets: Target[];
  sendableTargets: Target[];
  excluded: Target[];
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
  listPhase,
  loadError,
  retryLoad,
  droppedPicked,
  setDroppedPicked,
  loadingTargets,
  loadedOnce,
  visibleTargets,
  sendableTargets,
  excluded,
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
  return (
        <Card>
          <SectionHead
            no="01"
            tone="accent"
            icon={Users}
            title="받을 분 고르기"
            desc="계약일이 적힌 고객이 자동으로 올라와요. 보낼 분을 체크해 주세요"
          />

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
                상호명 · 대표자명 · 연락처 검색
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

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy={loadingTargets}>
            {loadingTargets ? (
              <>
                <LoadingStat />
                <LoadingStat />
                <LoadingStat />
              </>
            ) : (
              <>
                <StatCard
                  icon={Users}
                  label={search.trim() ? "검색에 걸린 고객" : "계약한 고객"}
                  value={`${won(visibleTargets.length)}명`}
                />
                <StatCard icon={UserCheck} label="발송 가능" value={`${won(sendableTargets.length)}명`} />
                <StatCard
                  icon={AlertTriangle}
                  label={excludeSummary ? `자동 제외 · ${excludeSummary}` : "자동 제외"}
                  value={`${won(excluded.length)}명`}
                />
              </>
            )}
          </div>

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
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">계약일</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">진행상태</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">담당</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">발송</th>
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted">
                      불러오는 중…
                    </td>
                  </tr>
                ) : visibleTargets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted break-keep">
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
                      <td className="px-3 py-2">
                        {t.sendable ? (
                          <Badge variant="blue">가능</Badge>
                        ) : t.excludeReason === "번호 없음" ? (
                          <Badge variant="yellow">번호 없음</Badge>
                        ) : (
                          <Badge variant="red">{t.excludeReason || "제외"}</Badge>
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
                지금 고른 사람 <b className="font-semibold text-wedly-t1">{won(selectedCount)}명</b>
                {hiddenPicked > 0 && `  (그중 ${won(hiddenPicked)}명은 지금 화면에 안 보여요)`}
                {selectedCount > MAX_RECIPIENTS && ` — 한 번에 ${MAX_RECIPIENTS}명까지만 보낼 수 있어요`}
              </span>
            )}
          </div>
          </>)}
        </Card>
  );
}
