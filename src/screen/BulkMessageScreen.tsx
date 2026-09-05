"use client";

// 단체 안내 발송 — 3단계 마법사(받을 분 고르기 → 안내문 만들기 → 발송 확인).
// 시각 계약(정본): docs/superpowers/specs/2026-09-01-bulk-message-mockup.html
//  - 이중 베젤 카드(Card 기본) · 알약 탭 · 아이콘 타일 숫자 카드(StatCard) · 흰 칩+색 점 딱지(Badge)
//  - 파란 표 머리 · 상태 박스 v3(StatusBox) · 구역 머리(번호 + 색 타일 + 밑선)
// 금지: 브라우저 confirm/alert, 기본 <select>, raw Tailwind 색.
//
// ★이 파일은 껍데기다 — 탭(발송하기/사용방법)·단계 표시줄·훅 호출·세 단계 배치만 한다.
//  상태·효과·핸들러는 useBulkState.ts, 단계별 그림은 steps/ 아래, 작은 그림 부품은 bulk-ui.tsx 가 맡는다.

import { useCallback, useEffect, useState } from "react";
import { StatusBox } from "@wedly/ui-shared/ui";
import { cn } from "../ui/cn";
import { BulkMessageManual } from "./BulkMessageManual";
import { useBulkState, type Step } from "./useBulkState";
import { Step1Targets } from "./steps/Step1Targets";
import { Step2Chat } from "./steps/Step2Chat";
import { Step3Confirm } from "./steps/Step3Confirm";

// ────────────────────────────────────────────────────────────── 단계 표시

function Stepper({
  step,
  canGo,
  onGo,
}: {
  step: Step;
  canGo: (s: Step) => boolean;
  onGo: (s: Step) => void;
}) {
  const items: Array<{ n: Step; label: string }> = [
    { n: 1, label: "받을 분 고르기" },
    { n: 2, label: "안내문 만들기" },
    { n: 3, label: "발송 확인" },
  ];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {items.map((it, i) => {
        const on = step === it.n;
        const reachable = canGo(it.n);
        return (
          <div key={it.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-wedly-hint text-wedly-bd-blue">›</span>}
            <button
              type="button"
              onClick={() => onGo(it.n)}
              disabled={!reachable}
              aria-current={on ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-wedly-bd bg-white py-1.5 pl-1.5 pr-3.5 shadow-sm",
                "transition-colors duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                reachable ? "hover:bg-wedly-bg-page" : "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-wedly-hint font-bold tabular-nums",
                  // 색 깔린 바탕 위 글자는 t2 까지만 — muted 는 흰 바탕 전용(대비 3.27~4.22 미달)
                  on ? "bg-wedly-accent text-white" : "bg-wedly-bg-gray text-wedly-t2",
                )}
              >
                {it.n}
              </span>
              <span
                className={cn(
                  "text-wedly-tablehead break-keep",
                  on ? "font-semibold text-wedly-t1" : "font-medium text-wedly-muted",
                )}
              >
                {it.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────── 본체

/** 화면 보기 탭 — 두 판을 늘 그려 두고 안 보는 쪽만 숨긴다(탭을 옮겨도 상태가 남게). */
const VIEW_TABS = [
  { id: "send", label: "발송하기", tabId: "bulk-tab-send", paneId: "bulk-pane-send" },
  { id: "manual", label: "사용방법", tabId: "bulk-tab-manual", paneId: "bulk-pane-manual" },
] as const;

export default function BulkMessageScreen() {
  // 화면 보기 — 「발송하기」와 「사용방법」. 발송 쪽 상태는 훅이 들고 있어
  // 사용방법을 보다 돌아와도 고르던 대상·안내문·발송 진행이 그대로 남는다.
  const [view, setView] = useState<"send" | "manual">("send");

  // 주소에 사용방법 구역 표식(#bulk-manual-…)이 붙어 오면 그 판을 열고 그 구역으로 내려 준다.
  // 판은 열려야 자리를 차지하므로 setView 뒤 화면이 한 번 그려진 다음(rAF) 옮긴다.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const hash = window.location.hash;
    if (!hash.startsWith("#bulk-manual-")) return undefined;
    setView("manual");
    const raf = window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  /** 탭 줄 글쇠 이동 — ←/→ 로 옮기고 Home/End 로 끝으로. 옮기면 포커스도 함께 간다. */
  const onViewTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const last = VIEW_TABS.length - 1;
    const cur = VIEW_TABS.findIndex((v) => v.id === view);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? last
      : e.key === "ArrowLeft" ? (cur <= 0 ? last : cur - 1)
      : (cur >= last ? 0 : cur + 1);
    setView(VIEW_TABS[next].id);
    document.getElementById(VIEW_TABS[next].tabId)?.focus();
  }, [view]);

  const s = useBulkState();

  return (
    <>
      {s.errorMsg && (
        <StatusBox tone="error" title="문제가 생겼어요" className="mb-4">
          {s.errorMsg}
        </StatusBox>
      )}

      {/* ══════════ 화면 보기 — 발송하기 / 사용방법 ══════════ */}
      <div role="tablist" aria-label="화면 보기" className="mb-4 flex flex-wrap items-center gap-2">
        {VIEW_TABS.map((v) => {
          const on = view === v.id;
          return (
            <button
              key={v.id}
              id={v.tabId}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={v.paneId}
              // 탭 줄은 화살표로 옮긴다 — 탭 글쇠는 판 안으로 들어가야 한다(활성 탭만 0).
              tabIndex={on ? 0 : -1}
              onClick={() => setView(v.id)}
              onKeyDown={onViewTabKeyDown}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent",
                on
                  ? "border border-wedly-accent bg-wedly-accent text-white"
                  : "border border-wedly-bd bg-white text-wedly-t2 hover:bg-wedly-bg-gray",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* 발송 판 — 떼지 않고 숨긴다(사용방법을 보다 돌아와도 고르던 대상·안내문·진행이 그대로). */}
      <div role="tabpanel" id="bulk-pane-send" aria-labelledby="bulk-tab-send" hidden={view !== "send"}>
      <Stepper step={s.step} canGo={s.canGo} onGo={s.goStep} />

      {/* ══════════ 01 받을 분 고르기 ══════════ */}
      {s.step === 1 && (
        <Step1Targets
          lockedToMe={s.lockedToMe}
          managerFilter={s.managerFilter}
          onManagerChange={s.onManagerChange}
          managerOptions={s.managerOptions}
          search={s.search}
          setSearch={s.setSearch}
          channel={s.channel}
          setChannel={s.setChannel}
          targetCounts={s.targetCounts}
          noEmailCount={s.noEmailCount}
          pickedTotals={s.pickedTotals}
          manualEmails={s.manualEmails}
          manualEdits={s.manualEdits}
          startManualEmail={s.startManualEmail}
          changeManualEmail={s.changeManualEmail}
          toggleManualPersist={s.toggleManualPersist}
          cancelManualEmail={s.cancelManualEmail}
          saveManualEmail={s.saveManualEmail}
          listPhase={s.listPhase}
          loadError={s.loadError}
          retryLoad={s.retryLoad}
          droppedPicked={s.droppedPicked}
          setDroppedPicked={s.setDroppedPicked}
          loadingTargets={s.loadingTargets}
          loadedOnce={s.loadedOnce}
          visibleTargets={s.visibleTargets}
          sendableTargets={s.sendableTargets}
          excludeSummary={s.excludeSummary}
          allChecked={s.allChecked}
          toggleAll={s.toggleAll}
          picked={s.picked}
          toggleOne={s.toggleOne}
          goStep={s.goStep}
          targetsOk={s.targetsOk}
          selectedCount={s.selectedCount}
          hiddenPicked={s.hiddenPicked}
        />
      )}

      {/* ══════════ 02 안내문 만들기 ══════════ */}
      {s.step === 2 && (
        <Step2Chat
          originalRef={s.originalRef}
          originalText={s.originalText}
          setOriginalText={s.setOriginalText}
          finalText={s.finalText}
          setFinalText={s.setFinalText}
          composedText={s.composedText}
          converting={s.converting}
          converted={s.converted}
          streamHasChunk={s.streamHasChunk}
          editing={s.editing}
          toggleEditing={s.toggleEditing}
          insertToken={s.insertToken}
          convert={s.convert}
          step2ConversionReady={s.step2ConversionReady}
          step2Hint={s.step2Hint}
          adWords={s.adWords}
          fillFormVisible={s.fillFormVisible}
          fillMarkers={s.fillMarkers}
          fillValues={s.fillValues}
          setFillValues={s.setFillValues}
          fillsComplete={s.fillsComplete}
          canTestSend={s.canTestSend}
          showTestSendWait={s.showTestSendWait}
          goStep={s.goStep}
          canGo={s.canGo}
          testOpen={s.testOpen}
          setTestOpen={s.setTestOpen}
          testPhone={s.testPhone}
          setTestPhone={s.setTestPhone}
          testSending={s.testSending}
          testSend={s.testSend}
          testDone={s.testDone}
          setTestDone={s.setTestDone}
          testError={s.testError}
          setTestError={s.setTestError}
          pricing={s.pricing}
          noticeCategoryPicked={s.noticeCategoryPicked}
          testNoticeCategoryLabel={s.testNoticeCategoryLabel}
        />
      )}

      {/* ══════════ 03 발송 확인 ══════════ */}
      {s.step === 3 && (
        <Step3Confirm
          restoredFromStore={s.restoredFromStore}
          selectedCount={s.selectedCount}
          myName={s.myName}
          pricing={s.pricing}
          cost={s.cost}
          jobId={s.jobId}
          noticeCategory={s.noticeCategory}
          setNoticeCategory={s.setNoticeCategory}
          noticeCategoryOptions={s.noticeCategoryOptions}
          tooMany={s.tooMany}
          refundedInSelection={s.refundedInSelection}
          goStep={s.goStep}
          sendReady={s.sendReady}
          loadingTargets={s.loadingTargets}
          skipped={s.skipped}
          progress={s.progress}
          pending={s.pending}
          blockedCount={s.blockedCount}
          sendOutOfScopeCount={s.sendOutOfScopeCount}
          pollError={s.pollError}
          canResume={s.canResume}
          resume={s.resume}
          alimtalkFailedCount={s.alimtalkFailedCount}
          confirmOpen={s.confirmOpen}
          setConfirmOpen={s.setConfirmOpen}
          sending={s.sending}
          send={s.send}
        />
      )}
      </div>

      {/* 사용방법 판 — 떼지 않고 숨긴다(탭을 옮겨도 체크리스트·펼침이 그대로). */}
      <div role="tabpanel" id="bulk-pane-manual" aria-labelledby="bulk-tab-manual" hidden={view !== "manual"}>
        <BulkMessageManual />
      </div>
    </>
  );
}
