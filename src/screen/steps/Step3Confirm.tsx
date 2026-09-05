"use client";

// 3단계 — 발송 확인(+ 발송 확인 모달 · 발송 중단 모달).
// 시각 계약(정본): docs/superpowers/specs/2026-09-04-email-send-preview.html §3단계.
//   왼쪽 발송 전 점검 카드(9항목) / 오른쪽 요약 kv·보내기 · 발송 뒤 현황(진행 막대·신호 표·발송 중단).
// ★알림톡·채팅 **전용** 발송의 화면은 글자 하나 안 바뀐다 — 이메일이 켜졌을 때만 새 판이 붙는다.
// ★발송 확인 모달을 이 파일이 함께 그린다 — Modal 은 닫혀 있으면 null 을 그리고(ui/Modal.tsx:35),
//  발송이 시작되면 send() 가 모달을 먼저 닫으므로(useBulkState) 달아 두는 자리가 바뀌어도 같다.

import { type ReactNode } from "react";
import { Ban, Check, History, Mail, MessageCircle, RotateCcw, Send, Smartphone, X } from "lucide-react";
import { ProgressBar, StatusBox } from "@wedly/ui-shared/ui";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import CustomSelect from "../../ui/CustomSelect";
import { Modal } from "../../ui/Modal";
import type { EmailAttachment } from "../../rules/email-body";
import { MAX_RECIPIENTS } from "../limits";
import { LOADING_TARGETS_HINT, emailMode, type BulkChannel } from "../step1-helpers";
import { EMAIL_FROM_ADDRESS, EMAIL_SUBJECT_CHIP } from "../step2-helpers";
import {
  alimtalkBadgeOf,
  emailSignalOf,
  failureReasonOf,
  progressHeadline,
  progressPercent,
  sendHeadline,
  type BulkPricing,
  type EmailChecklistItem,
  type RefundedNotice,
  type SkippedNotice,
} from "../step3-helpers";
import { SectionHead, won } from "../bulk-ui";
import { type Progress, type Step } from "../useBulkState";

/** 시각 한 마디 — 「10:12:03」. 이 화면에서 보낸 발송에만 값이 있다(되살린 화면엔 없다). */
function clock(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** 라벨-값 표 한 벌. 왼쪽 회색 층 + 오른쪽 흰 칸(이 화면의 기존 모양 그대로). */
function KvTable({ rows }: { rows: Array<{ k: string; v: ReactNode }> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-wedly-bd">
      {rows.map((row) => (
        <div key={row.k} className="grid grid-cols-[110px_1fr] border-t border-wedly-bd first:border-t-0 sm:grid-cols-[160px_1fr]">
          <div className="bg-wedly-bg-gray px-3 py-2.5 text-wedly-tablehead font-semibold text-wedly-t2 break-keep">
            {row.k}
          </div>
          <div className="min-w-0 bg-white px-3 py-2.5 text-wedly-sub text-wedly-t1 break-keep">{row.v}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * 발송 전 점검 카드 — 아홉 줄. 빨간 줄에는 「2단계에서 고치기 ›」가 함께 선다.
 * ★색만으로 알리지 않는다 — 통과/미통과를 아이콘 모양(체크·엑스)과 글자로도 가른다.
 */
function ChecklistCard({
  items,
  failedCount,
  goStep,
}: {
  items: EmailChecklistItem[];
  failedCount: number;
  goStep: (s: Step) => void;
}) {
  return (
    <div className="rounded-2xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-wedly-green shadow-sm">
          <Check className="h-[18px] w-[18px] text-white" aria-hidden />
        </span>
        <span className="text-wedly-sub font-semibold text-wedly-t1">발송 전 점검</span>
        <span className="ml-auto text-wedly-hint text-wedly-muted tabular-nums break-keep">
          {failedCount > 0 ? `미통과 ${won(failedCount)}건` : `${won(items.length)}건 모두 통과`}
        </span>
      </div>
      <ul className="divide-y divide-wedly-bd/60 rounded-xl border border-wedly-bd/60 bg-wedly-bg-gray">
        {items.map((it) => (
          <li key={it.label} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span
              className={
                it.ok
                  ? "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-wedly-green"
                  : "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-wedly-red"
              }
            >
              {it.ok ? (
                <Check className="h-[15px] w-[15px] text-white" aria-hidden />
              ) : (
                <X className="h-[15px] w-[15px] text-white" aria-hidden />
              )}
            </span>
            <span className="sr-only">{it.ok ? "통과" : "미통과"}</span>
            <span
              className={
                it.ok
                  ? "min-w-0 flex-1 text-wedly-sub text-wedly-t1 break-keep"
                  : "min-w-0 flex-1 text-wedly-sub font-semibold text-wedly-t1 break-keep"
              }
            >
              {it.label}
            </span>
            {!it.ok && (
              <Button variant="link" onClick={() => goStep(it.goStep)}>
                2단계에서 고치기 ›
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Step3ConfirmProps {
  restoredFromStore: boolean;
  selectedCount: number;
  myName: string;
  /** 회신 주소(담당자 업무 메일). 못 얻었으면 빈 글자 — 화면이 지어내지 않는다. */
  myEmail: string;
  pricing: BulkPricing;
  cost: { alimtalk: number; smsMax: number };
  jobId: string;
  noticeCategory: string;
  setNoticeCategory: (value: string) => void;
  noticeCategoryOptions: Array<{ value: string; label: string }>;
  tooMany: boolean;
  refundedInSelection: RefundedNotice | null;
  goStep: (s: Step) => void;
  sendReady: boolean;
  loadingTargets: boolean;
  skipped: SkippedNotice | null;
  progress: Progress | null;
  pending: number;
  blockedCount: number;
  sendOutOfScopeCount: number;
  pollError: string;
  canResume: boolean;
  resume: () => void;
  alimtalkFailedCount: number;
  // 발송 확인 모달
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  sending: boolean;
  send: () => void;

  // ── 이메일(2026-09-05 신설) ─────────────────────────────
  channel: BulkChannel;
  /** 고른 사람 수 — `total` 은 담은 그대로, `email` 은 주소가 있어 이메일이 나가는 사람. */
  pickedTotals: { total: number; email: number };
  emailSubject: string;
  emailAttachments: EmailAttachment[];
  emailChecks: EmailChecklistItem[];
  emailChecksFailed: number;
  /** 발송은 됐지만 알려 둘 일(직접 입력 주소 저장 실패 등). */
  sendWarnings: string[];
  /** 진행 막대가 읽는 값 — 통로마다 세는 칸이 다르다. */
  sendProgress: { done: number; total: number };
  remaining: number;
  stopAllowed: boolean;
  stopOpen: boolean;
  setStopOpen: (open: boolean) => void;
  stopping: boolean;
  stopJob: () => void;
  sendStartedAt: Date | null;
  sendFinishedAt: Date | null;
}

export function Step3Confirm({
  restoredFromStore,
  selectedCount,
  myName,
  myEmail,
  pricing,
  cost,
  jobId,
  noticeCategory,
  setNoticeCategory,
  noticeCategoryOptions,
  tooMany,
  refundedInSelection,
  goStep,
  sendReady,
  loadingTargets,
  skipped,
  progress,
  pending,
  blockedCount,
  sendOutOfScopeCount,
  pollError,
  canResume,
  resume,
  alimtalkFailedCount,
  confirmOpen,
  setConfirmOpen,
  sending,
  send,
  channel,
  pickedTotals,
  emailSubject,
  emailAttachments,
  emailChecks,
  emailChecksFailed,
  sendWarnings,
  sendProgress,
  remaining,
  stopAllowed,
  stopOpen,
  setStopOpen,
  stopping,
  stopJob,
  sendStartedAt,
  sendFinishedAt,
}: Step3ConfirmProps) {
  // 「이메일 판을 그리나」는 한 곳에서만 정한다 — 자리마다 따로 판단하면 열은 없는데 값만 남는다.
  const emailShown = emailMode(channel);
  const chatShown = channel !== "email";
  // 진행 표는 **작업이 실제로 쓴 통로**를 따른다(새로고침 뒤엔 고르개가 기본값으로 돌아와 있다).
  const jobEmail = progress?.channelEmail ?? emailShown;
  const jobChat = progress?.channelChat ?? chatShown;
  // ★이메일이 섞인 작업은 status 가 처음부터 "done" 이라 그 값만 보면 시작하자마자 「끝났어요」가 뜬다.
  const headline = jobEmail ? sendHeadline(progress) : progressHeadline(progress?.status);
  const attachNames = emailAttachments.map((f) => f.fileName).join(" · ");

  /** 이메일 요약 kv — 시안 §3단계의 일곱 줄. */
  const emailRows: Array<{ k: string; v: ReactNode }> = [
    {
      k: "받는 사람",
      v: (
        <>
          <b className="font-semibold tabular-nums">{won(pickedTotals.email)}</b>명 (이메일)
          {chatShown && (
            <>
              {" · "}알림톡 <b className="font-semibold tabular-nums">{won(pickedTotals.total)}</b>명
            </>
          )}
        </>
      ),
    },
    {
      k: "보내는 이름",
      v: (
        <>
          WEDLY {myName || "담당자"} &lt;{EMAIL_FROM_ADDRESS}&gt;{" "}
          <span className="text-wedly-muted">— 발신 주소는 고정, 이름만 담당자</span>
        </>
      ),
    },
    {
      k: "회신 주소",
      v: myEmail ? (
        <>
          {myEmail} <span className="text-wedly-muted">(담당 컨설턴트)</span>
        </>
      ) : (
        <span className="text-wedly-t2">보낸 담당자 메일로 옵니다</span>
      ),
    },
    {
      k: "제목",
      v: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="inline-flex min-h-[21px] items-center rounded-full border border-wedly-bd bg-white px-2 py-[2.5px] text-wedly-label leading-[14px] font-semibold text-wedly-accent-ink">
            {EMAIL_SUBJECT_CHIP}
          </span>
          <span className="min-w-0 break-keep">{emailSubject || "—"}</span>
        </span>
      ),
    },
    {
      k: "안내 종류",
      v: <>정보성 안내(고정) <span className="text-wedly-muted">— 수신 설정 링크가 자동으로 붙어요</span></>,
    },
    {
      k: "첨부",
      v: attachNames ? (
        <>
          {attachNames} <span className="text-wedly-muted">· 보관함 링크(14일)</span>
        </>
      ) : (
        <span className="text-wedly-t2">없음</span>
      ),
    },
    {
      k: "예상 비용",
      v: (
        <div className="grid gap-1.5">
          <div className="overflow-hidden rounded-xl border border-wedly-bd">
            {/* 이메일 — 월 한도 안이라 이번 발송에 새로 무는 값이 없다. */}
            <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 bg-white px-2.5 py-2 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-wedly-bg-purple">
                <Mail className="h-[15px] w-[15px] text-wedly-purple" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">이메일</p>
                <p className="text-wedly-hint text-wedly-muted break-keep">
                  받는 분 {won(pickedTotals.email)}명 · 월 한도 안에서 나가요
                </p>
              </div>
              <div className="col-start-2 text-left sm:col-start-3 sm:text-right">
                <p className="text-wedly-sub font-semibold text-wedly-navy tabular-nums">0원</p>
                <p className="text-wedly-hint text-wedly-muted break-keep">Resend 월 한도 안</p>
              </div>
            </div>
            {/* 알림톡·문자는 「둘 다」일 때만 — 이메일만 보내는 발송에 알림톡 금액을 적으면 안 무는 돈이 보인다. */}
            {chatShown && (
              <>
                <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 border-t border-wedly-bd bg-wedly-bg-gray px-2.5 py-2 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-wedly-bg-yellow">
                    <MessageCircle className="h-[15px] w-[15px] text-wedly-navy" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">카카오 알림톡</p>
                    <p className="text-wedly-hint text-wedly-t2 break-keep">
                      받는 분 {won(selectedCount)}명 전원 · 건당 {won(pricing.alimtalkWon)}원
                    </p>
                  </div>
                  <div className="col-start-2 text-left sm:col-start-3 sm:text-right">
                    <p className="text-wedly-sub font-semibold text-wedly-navy tabular-nums">약 {won(cost.alimtalk)}원</p>
                    <p className="text-wedly-hint text-wedly-t2 break-keep">도착한 건만 과금</p>
                  </div>
                </div>
                <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 border-t border-wedly-bd bg-white px-2.5 py-2 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-wedly-bd bg-white">
                    <Smartphone className="h-[15px] w-[15px] text-wedly-t2" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">문자</p>
                    <p className="text-wedly-hint text-wedly-muted break-keep">
                      채널톡에 번호가 저장된 분만 · 건당 최대 {won(pricing.smsMaxWon)}원
                    </p>
                  </div>
                  <div className="col-start-2 text-left sm:col-start-3 sm:text-right">
                    <p className="text-wedly-sub font-semibold text-wedly-t2 tabular-nums">최대 약 {won(cost.smsMax)}원</p>
                    <p className="text-wedly-hint text-wedly-muted break-keep">보통 해당 없음</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-1.5">
            <span className="inline-flex min-h-[21px] items-center rounded-full border border-wedly-bd bg-white px-2 py-[2.5px] text-wedly-label leading-[14px] font-semibold text-wedly-muted break-keep">
              부가세 별도
            </span>
          </div>
        </div>
      ),
    },
  ];

  /** 알림톡·채팅 전용 요약 kv — 지금까지 쓰던 그대로다(글자·클래스 한 글자도 안 바꾼다). */
  const chatRows: Array<{ k: string; v: ReactNode }> = [
    {
      // ★자동 제외 건수를 여기 붙이지 마라 — 그 숫자는 「지금 1단계에 보이는 목록」에서
      //  세는 값이라 검색어만 바꿔도 발송 확인 화면의 숫자가 흔들린다. 보낼 명단과
      //  관계없는 숫자가 발송 직전에 움직이면 사람이 오해한다(자동 제외는 1단계 숫자 카드 몫).
      k: "받는 사람",
      v: <b className="font-semibold tabular-nums">{won(selectedCount)}명</b>,
    },
    { k: "보내는 이름", v: <>위들리 <span className="text-wedly-muted">— 채널톡 공식 채널</span></> },
    { k: "고객이 받는 방법", v: <>카카오톡 알림 「새로운 메시지가 도착했어요」 → 누르면 채팅방에서 안내문 확인</> },
    {
      k: "답장 오면",
      v: (
        <>
          <b className="font-semibold">보낸 담당자{myName ? `(${myName})` : ""}</b>에게 자동 배정
          <span className="text-wedly-t2">(채널톡 담당자로 등록돼 있는 경우)</span> · 등록이 없으면 기존 담당 컨설턴트 규칙으로 배정됩니다
        </>
      ),
    },
    {
      // ★알림톡과 문자를 한 줄에 섞어 「7~28원」처럼 적으면, 실제로는 5원인 비용이
      //  최대 28원짜리로 읽힌다. 두 줄로 갈라 「누구에게 · 얼마나」를 각각 못 박는다.
      k: "예상 비용",
      v: (
        <div className="grid gap-1.5">
          <div className="overflow-hidden rounded-xl border border-wedly-bd">
            {/* 알림톡 — 받는 분 전원에게 나간다(이번 발송에서 실제로 무는 비용). */}
            {/* ★좁은 폭(320px)에서는 금액을 아래 줄로 떨군다 — 바깥 표의 110px 라벨 열까지
                겹치면 고정 3열로는 금액·설명이 잘린다(바깥이 overflow-hidden 이라 통째로 사라진다). */}
            <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 bg-white px-2.5 py-2 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-wedly-bg-yellow">
                <MessageCircle className="h-[15px] w-[15px] text-wedly-navy" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">카카오 알림톡</p>
                <p className="text-wedly-hint text-wedly-muted break-keep">
                  받는 분 {won(selectedCount)}명 전원 · 건당 {won(pricing.alimtalkWon)}원
                </p>
              </div>
              <div className="col-start-2 text-left sm:col-start-3 sm:text-right">
                <p className="text-wedly-sub font-semibold text-wedly-navy tabular-nums">
                  약 {won(cost.alimtalk)}원
                </p>
                <p className="text-wedly-hint text-wedly-muted break-keep">도착한 건만 과금</p>
              </div>
            </div>
            {/* 문자 — 채널톡에 번호가 저장된 분에게만 채널톡이 따로 보낸다. 보통 해당 없음. */}
            <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 border-t border-wedly-bd bg-wedly-bg-gray px-2.5 py-2 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-wedly-bd bg-white">
                <Smartphone className="h-[15px] w-[15px] text-wedly-t2" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">문자</p>
                {/* ★회색 층 위에서는 t2 로 — muted 는 이 바탕에서 너무 옅어 안 읽힌다. */}
                <p className="text-wedly-hint text-wedly-t2 break-keep">
                  채널톡에 번호가 저장된 분만 · 건당 최대 {won(pricing.smsMaxWon)}원
                </p>
              </div>
              <div className="col-start-2 text-left sm:col-start-3 sm:text-right">
                <p className="text-wedly-sub font-semibold text-wedly-t2 tabular-nums">
                  최대 약 {won(cost.smsMax)}원
                </p>
                <p className="text-wedly-hint text-wedly-t2 break-keep">보통 해당 없음</p>
              </div>
            </div>
          </div>
          {/* ★알약 높이를 못 박지 않는다 — 좁은 화면(375px 이하)에서 긴 칩이 두 줄로 접히면
              h-[21px] 안에 28px 짜리 글자가 갇혀 테두리를 뚫고 나온다(2026-09-04 배포본 실측).
              min-h + 세로 여백으로 늘어나게 두되, 한 줄일 때는 14(줄높이)+2.5*2(여백)+1*2(테두리)=21px 로 이전과 같다. */}
          <div className="flex flex-wrap items-start gap-1.5">
            <span className="inline-flex min-h-[21px] items-center rounded-full border border-wedly-bd bg-white px-2 py-[2.5px] text-wedly-label leading-[14px] font-semibold text-wedly-muted break-keep">
              부가세 별도
            </span>
            <span className="inline-flex min-h-[21px] items-center rounded-full border border-wedly-bd bg-white px-2 py-[2.5px] text-wedly-label leading-[14px] font-semibold text-wedly-muted break-keep">
              알림톡 실패해도 문자로 대신 안 감
            </span>
          </div>
        </div>
      ),
    },
  ];

  /** 안내 내용 고르개 — 알림톡 문안의 칸이라 이메일만 보낼 때는 안 그린다. */
  const noticePicker = chatShown && !jobId && (
    <div className="mb-4 flex min-w-0 flex-col gap-1">
      <label htmlFor="bm-notice-category" className="text-wedly-label font-semibold text-wedly-muted">
        안내 내용
      </label>
      <CustomSelect
        id="bm-notice-category"
        aria-label="안내 내용"
        value={noticeCategory}
        onChange={setNoticeCategory}
        options={noticeCategoryOptions}
        placeholder="무엇에 대한 안내인지 골라 주세요"
        className="w-full sm:w-[280px] [&>button]:rounded-full [&>button]:pl-4"
      />
      <p className="text-wedly-hint text-wedly-muted break-keep">
        카카오 알림톡에 이 값이 그대로 들어가요. 비어 있으면 발송이 거절될 수 있어요.
      </p>
    </div>
  );

  const warnBoxes = !jobId && (
    <div className="space-y-3">
      {tooMany && (
        <StatusBox tone="error" title={`한 번에 ${won(MAX_RECIPIENTS)}명까지만 보낼 수 있어요`}>
          지금 고른 사람이 {won(selectedCount)}명입니다. 1단계로 돌아가 {won(selectedCount - MAX_RECIPIENTS)}명을 빼 주세요.
        </StatusBox>
      )}
      {/* ★전체 선택은 목록 아래쪽 환불 고객까지 담는다 — 빨간 줄을 못 보고 지나쳤을 수 있어
          보내기 직전에 한 번 더 알린다(고르는 동작 자체는 그대로 둔다). */}
      {refundedInSelection && (
        <StatusBox
          tone="warning"
          title={`환불 고객 ${won(refundedInSelection.count)}명이 포함돼 있어요`}
        >
          {refundedInSelection.text ? `${refundedInSelection.text} — ` : ""}
          환불일이 적힌 고객입니다. 보내도 괜찮은 안내인지 1단계에서 한 번 더 확인해 주세요.
        </StatusBox>
      )}
      <StatusBox tone="warning" title="발송 후에는 취소할 수 없어요">
        이미 나간 알림은 되돌릴 수 없습니다. 미리보기와 받는 분 목록을 한 번 더 확인해 주세요. 같은 안내를 실수로 두 번 실행해도 이미 받은 분은 자동으로 건너뜁니다.
      </StatusBox>
    </div>
  );

  /** 보내기 줄 — 단추 문구는 통로에 따라 다르다(이메일은 시안대로 「보내기」). */
  const sendBar = !jobId && (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="lg" onClick={() => goStep(2)}>이전 단계</Button>
      <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={!sendReady}>
        <Send className="h-[15px] w-[15px]" />
        {emailShown ? "보내기" : `${won(selectedCount)}명에게 발송하기`}
      </Button>
      {loadingTargets ? (
        <span className="text-wedly-hint text-wedly-muted break-keep">{LOADING_TARGETS_HINT}</span>
      ) : (
        <span className="text-wedly-hint text-wedly-muted break-keep">
          {emailShown
            ? emailChecksFailed > 0
              ? `미통과 ${won(emailChecksFailed)}건 — 고치면 보내기가 열려요`
              : "모두 통과 — 보내기를 누르면 바로 나갑니다"
            : "발송 중에는 진행률이 표시되고, 실패한 분은 따로 모아 보여줍니다"}
        </span>
      )}
    </div>
  );

  return (
    <>
        <Card>
          <SectionHead
            no="03"
            tone="green"
            icon={Send}
            title="발송 확인"
            desc={emailShown ? "빨간 항목이 하나라도 있으면 보내기 단추가 잠겨요" : "마지막으로 한 번 더 확인하고 보냅니다"}
          />

          {/* 되살린 화면에서는 확인 표를 안 그린다 — 대상·안내문이 복원되지 않아 0명·0원으로 보인다. */}
          {!restoredFromStore && (
            emailShown ? (
              // 이메일 판 — 왼쪽 점검 카드 / 오른쪽 요약·보내기(시안 §3단계의 두 칸)
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <ChecklistCard items={emailChecks} failedCount={emailChecksFailed} goStep={goStep} />
                <div className="min-w-0">
                  <KvTable rows={emailRows} />
                  {noticePicker && <div className="mt-4">{noticePicker}</div>}
                  {warnBoxes && <div className="mt-4">{warnBoxes}</div>}
                  {sendBar}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <KvTable rows={chatRows} />
                </div>
                {noticePicker}
                {warnBoxes}
                {sendBar}
              </>
            )
          )}

          {/* ★되살린 화면에는 늘 작업 번호가 함께 있다(둘을 같은 자리에서 세우고 같은 자리에서 지운다) —
              그래서 확인 표가 없는 동안에는 아래 진행 표만 그린다. */}
          {jobId && (
            <div className="mt-4 space-y-3">
              {/* ★고른 인원과 실제로 나간 인원이 다른 이유 — 진행 표보다 위에 둔다(놓치면 사고로 읽는다). */}
              {skipped && (
                <StatusBox
                  tone="warning"
                  title={`고른 ${won(selectedCount)}명 중 ${won(skipped.total)}명은 보내지 않았어요`}
                >
                  {skipped.text} — 발송 직전에 서버가 다시 확인해 걸러낸 분들이에요.
                </StatusBox>
              )}
              {/* 발송은 됐지만 알려 둘 일 — 조용히 버리면 담당자는 저장된 줄 안다. */}
              {sendWarnings.length > 0 && (
                <StatusBox tone="warning" title="발송은 됐지만 알려 드릴 일이 있어요">
                  {sendWarnings.join(" · ")}
                </StatusBox>
              )}

              {/* 발송 현황 머리 — 보낸 사람·시작·종료 시각(이 화면에서 보낸 발송에만 시각이 있다). */}
              {jobEmail && (
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-wedly-accent shadow-sm">
                    <History className="h-[18px] w-[18px] text-white" aria-hidden />
                  </span>
                  <h3 className="min-w-0 text-wedly-sub font-semibold text-wedly-t1 break-keep">발송 현황</h3>
                  <span className="ml-auto text-wedly-hint text-wedly-muted break-keep">
                    보낸 사람 {myName || "—"}
                    {sendStartedAt ? ` · 시작 ${clock(sendStartedAt)}` : ""}
                    {sendFinishedAt ? ` · 종료 ${clock(sendFinishedAt)}` : ""}
                  </span>
                </div>
              )}

              <div className="rounded-2xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-wedly-sub font-semibold text-wedly-t1">
                    {headline}
                  </span>
                  <span className="ml-auto text-wedly-sub tabular-nums text-wedly-t2">
                    {won(sendProgress.done)} / {won(sendProgress.total)}명
                  </span>
                  {/* 발송 중단 — 이메일이 도는 동안에만 먹힌다(채팅 러너는 중단 표식을 안 읽는다). */}
                  {jobEmail && (
                    <Button variant="danger" size="sm" onClick={() => setStopOpen(true)} disabled={!stopAllowed}>
                      <Ban className="h-[15px] w-[15px]" />
                      발송 중단
                    </Button>
                  )}
                </div>
                <ProgressBar value={progressPercent(sendProgress)} className="h-2 rounded-full" />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {jobChat && (
                    <>
                      <Badge variant="green">보냄 {won(progress?.sent ?? 0)}</Badge>
                      <Badge variant="red">실패 {won(progress?.failed ?? 0)}</Badge>
                    </>
                  )}
                  {jobEmail && (
                    <>
                      <Badge variant="green">이메일 보냄 {won(progress?.emailSent ?? 0)}</Badge>
                      <Badge variant="red">이메일 실패 {won(progress?.emailFailed ?? 0)}</Badge>
                    </>
                  )}
                  <Badge variant="default">남음 {won(remaining)}</Badge>
                </div>
                {/* ★위 상자가 같은 사실을 이미 말한다 — 새 응답에서는 이 두 줄을 그리지 않는다.
                    같은 뜻을 두 모양으로 그리면 담당자가 두 번 빠진 것으로 읽는다.
                    skipped 를 안 주던 옛 응답에서만 이 자리가 산다. */}
                {!skipped && blockedCount > 0 && (
                  <p className="mt-2.5 border-t border-wedly-bd pt-2.5 text-wedly-hint text-wedly-t2 break-keep">
                    수신거부 {won(blockedCount)}명은 서버에서 제외됐습니다 — 목록을 만든 뒤에 수신거부한 분이라 발송 대상에서 빠졌어요.
                  </p>
                )}
                {!skipped && sendOutOfScopeCount > 0 && (
                  <p className="mt-2.5 border-t border-wedly-bd pt-2.5 text-wedly-hint text-wedly-t2 break-keep">
                    범위 밖 {won(sendOutOfScopeCount)}명은 서버에서 제외됐습니다 — 이 앱에서 볼 수 있는 고객이 아니라 발송 대상에서 빠졌어요.
                  </p>
                )}
                {pollError && (
                  <StatusBox tone="warning" title="진행 상황을 불러오지 못하고 있어요" className="mt-3">
                    {pollError} 발송은 서버에서 계속 돌고 있을 수 있어요. 이 화면을 그대로 두면 계속 다시 확인합니다. 새로고침해도 이 작업의 진행 표는 다시 열립니다.
                  </StatusBox>
                )}
              </div>

              {/* 신호 설명 줄 — 등급이 무슨 뜻인지 표 위에서 한 번 말한다(hover 로만 보이는 안내 금지). */}
              {jobEmail && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-wedly-hint font-semibold text-wedly-t2">이메일 신호</span>
                  <span className="inline-flex items-center gap-1.5 text-wedly-hint text-wedly-t2 break-keep">
                    <Badge variant="green">확인함</Badge> 메일 안 링크·버튼을 눌렀어요
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-wedly-hint text-wedly-t2 break-keep">
                    <Badge variant="blue">도착</Badge> 받는 서버까지 갔어요
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-wedly-hint text-wedly-t2 break-keep">
                    <Badge variant="default">보냄</Badge> 발송 업체가 접수했어요
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-wedly-hint text-wedly-t2 break-keep">
                    <Badge variant="red">반송·수신거부</Badge> 못 갔거나 받지 않겠다고 했어요
                  </span>
                </div>
              )}

              {progress?.status === "done" && !jobEmail && (
                <StatusBox tone="success" title="발송이 끝났어요">
                  {won(progress.sent)}명에게 보냈어요{progress.failed > 0 ? ` · ${won(progress.failed)}명은 실패했어요` : ""}. 답장은 채널톡에서 보낸 담당자에게 배정됩니다.
                </StatusBox>
              )}
              {progress?.stalled && progress.status === "running" && (
                <StatusBox tone="warning" title="발송이 오래 멈춰 있어요">
                  3분 넘게 진행이 없습니다. 잠시 뒤에도 그대로면 화면을 새로 고쳐 상태를 다시 확인해 주세요.
                </StatusBox>
              )}
              {progress?.stopRequested && (
                <StatusBox tone="warning" title="발송을 중단했어요">
                  아직 안 나간 메일은 나가지 않습니다. 이미 나간 메일은 되돌릴 수 없어요.
                </StatusBox>
              )}
              {canResume && (
                // StatusBox 의 actions 칸은 쓰지 않는다 — 그 칸은 카드 폭을 못 채워 단추가
                // 어중간한 자리에 선다(statusbox-actions-trap.test.ts). 단추를 밖에 왼쪽으로 둔다.
                <div className="space-y-2">
                  <StatusBox tone="warning" title="아직 못 보낸 분이 남았어요">
                    {won(pending)}명이 남아 있어요. 이미 보낸 분은 자동으로 건너뜁니다.
                    {progress?.error ? ` (멈춘 이유: ${progress.error})` : ""}
                  </StatusBox>
                  <Button size="sm" onClick={resume}>
                    <RotateCcw className="h-[15px] w-[15px]" />
                    이어보내기
                  </Button>
                </div>
              )}

              {progress && (progress?.recipients ?? []).length > 0 && (
                <>
                  {/* ★알림톡만 실패한 사람은 「보냄」에 섞여 있다 — 요약 숫자만 보면 못 알아챈다. */}
                  {alimtalkFailedCount > 0 && (
                    <StatusBox tone="error" title={`알림톡이 ${won(alimtalkFailedCount)}명에게 가지 못했어요`}>
                      채널톡에는 안내가 남아 있어요. 그분들께는 담당자가 직접 연락해 주세요.
                    </StatusBox>
                  )}
                  {progress.total > (progress?.recipients ?? []).length && (
                    <p className="text-wedly-hint text-wedly-muted break-keep">
                      받는 분 {won(progress.total)}명 중 앞 {won((progress?.recipients ?? []).length)}명만 보여 줍니다.
                    </p>
                  )}
                <div className="overflow-auto rounded-2xl border border-wedly-bd">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead className="text-wedly-tablehead">
                      <tr className="bg-wedly-accent text-left font-semibold text-white">
                        <th scope="col" className="px-3 py-2.5">회사명</th>
                        <th scope="col" className="px-3 py-2.5">대표명</th>
                        {jobChat && <th scope="col" className="px-3 py-2.5">연락처</th>}
                        {jobChat && <th scope="col" className="px-3 py-2.5">알림 상태</th>}
                        {jobEmail && <th scope="col" className="px-3 py-2.5">이메일</th>}
                        {jobEmail && <th scope="col" className="px-3 py-2.5">이메일 신호</th>}
                        <th scope="col" className="px-3 py-2.5">실패한 이유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.recipients.map((r, i) => {
                        const badge = alimtalkBadgeOf(r.alimtalkStatus, r.viewedAt, r.status);
                        const signal = emailSignalOf(r);
                        return (
                          <tr key={`${r.phone}-${i}`} className="border-t border-wedly-bd">
                            <td className="min-w-0 px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">{r.companyName || "—"}</td>
                            <td className="px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">{r.representative || "—"}</td>
                            {jobChat && (
                              <td className="whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums text-wedly-t1">{r.phone || "—"}</td>
                            )}
                            {jobChat && (
                              <td className="whitespace-nowrap px-3 py-2">
                                {/* 정본 딱지 — 흰 알약 + 뜻을 담은 색 점(Badge 기본형). */}
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                              </td>
                            )}
                            {jobEmail && (
                              <td className="min-w-0 px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">
                                {r.email || "—"}
                                {/* 손으로 넣은 주소는 자료의 주소와 구별해 둔다(어디서 온 주소인지 남긴다). */}
                                {r.emailSource === "manual" && (
                                  <span className="ml-1.5 inline-flex min-h-[21px] items-center rounded-full border border-wedly-bd bg-white px-2 py-[2.5px] text-wedly-label leading-[14px] font-semibold text-wedly-t2">
                                    직접 입력
                                  </span>
                                )}
                              </td>
                            )}
                            {jobEmail && (
                              <td className="whitespace-nowrap px-3 py-2">
                                {signal ? <Badge variant={signal.variant}>{signal.label}</Badge> : <span className="text-wedly-sub text-wedly-t2">—</span>}
                              </td>
                            )}
                            <td className="min-w-0 px-3 py-2 text-wedly-sub text-wedly-t2 break-keep">
                              {failureReasonOf(r)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}
        </Card>

      {/* 발송 확인 모달 — 브라우저 confirm 대신 WEDLY 모달 */}
      <Modal
        open={confirmOpen}
        onClose={() => { if (!sending) setConfirmOpen(false); }}
        title="정말 보낼까요?"
        description="보낸 뒤에는 되돌릴 수 없어요."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={sending}>
              취소
            </Button>
            <Button onClick={send} loading={sending} disabled={!sendReady}>
              <Send className="h-[15px] w-[15px]" />
              {emailShown ? `${won(pickedTotals.email)}명에게 발송` : `${won(selectedCount)}명에게 발송`}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-wedly-bd">
            {(emailShown
              ? [
                  {
                    k: "받는 사람",
                    v: chatShown
                      ? `이메일 ${won(pickedTotals.email)}명 · 알림톡 ${won(pickedTotals.total)}명`
                      : `이메일 ${won(pickedTotals.email)}명`,
                  },
                  {
                    k: "예상 비용",
                    v: chatShown
                      ? `이메일 0원 · 알림톡 약 ${won(cost.alimtalk)}원 (건당 ${won(pricing.alimtalkWon)}원) · 문자는 해당되는 분만 최대 ${won(cost.smsMax)}원 · 부가세 별도`
                      : "이메일 0원 (Resend 월 한도 안)",
                  },
                  { k: "보내는 이름", v: `WEDLY ${myName || "담당자"} <${EMAIL_FROM_ADDRESS}>` },
                ]
              : [
                  { k: "받는 사람", v: `${won(selectedCount)}명` },
                  {
                    // ★3단계 표와 같은 estimateCost 로 센다 — 발송 직전에 숫자가 달라지면 사고로 읽힌다.
                    // ★「부가세 별도」를 3단계 표에만 적어 두면, 마지막에 보는 이 금액을 청구액으로 읽는다.
                    k: "예상 비용",
                    v: `알림톡 약 ${won(cost.alimtalk)}원 (건당 ${won(pricing.alimtalkWon)}원) · 문자는 해당되는 분만 최대 ${won(cost.smsMax)}원 · 부가세 별도`,
                  },
                  { k: "보내는 이름", v: "위들리 — 채널톡 공식 채널" },
                ]
            ).map((r) => (
              <div key={r.k} className="grid grid-cols-[92px_1fr] border-t border-wedly-bd first:border-t-0">
                <div className="bg-wedly-bg-gray px-3 py-2 text-wedly-tablehead font-semibold text-wedly-t2 break-keep">{r.k}</div>
                <div className="min-w-0 bg-white px-3 py-2 text-wedly-sub tabular-nums text-wedly-t1 break-keep">{r.v}</div>
              </div>
            ))}
          </div>
          <StatusBox tone="warning" title="발송 후에는 취소할 수 없어요">
            이미 나간 알림은 되돌릴 수 없습니다. 이미 받은 분은 다시 실행해도 자동으로 건너뜁니다.
          </StatusBox>
        </div>
      </Modal>

      {/* 발송 중단 확인 — 브라우저 confirm 대신 WEDLY 모달 */}
      <Modal
        open={stopOpen}
        onClose={() => { if (!stopping) setStopOpen(false); }}
        title="발송을 중단할까요?"
        description="이미 나간 메일은 되돌릴 수 없어요."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStopOpen(false)} disabled={stopping}>
              계속 보내기
            </Button>
            <Button variant="danger" onClick={stopJob} loading={stopping}>
              <Ban className="h-[15px] w-[15px]" />
              발송 중단
            </Button>
          </div>
        }
      >
        <StatusBox tone="warning" title="아직 안 나간 메일만 멈춰요">
          지금까지 나간 {won(sendProgress.done)}명분은 그대로 갑니다. 남은 {won(remaining)}명에게는 보내지 않아요.
        </StatusBox>
      </Modal>
    </>
  );
}
