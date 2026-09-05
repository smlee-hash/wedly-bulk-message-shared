"use client";

// 3단계 — 발송 확인(+ 발송 확인 모달).
// JSX 는 BulkMessageScreen 에서 **글자 그대로** 옮겼다(문구·클래스·들여쓰기까지 그대로).
// ★발송 확인 모달을 이 파일로 함께 옮겼다 — Modal 은 닫혀 있으면 null 을 그리고(ui/Modal.tsx:35),
//  발송이 시작되면 send() 가 모달을 먼저 닫으므로(useBulkState) 달아 두는 자리가 바뀌어도 같다.

import { MessageCircle, RotateCcw, Send, Smartphone } from "lucide-react";
import { ProgressBar, StatusBox } from "@wedly/ui-shared/ui";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import CustomSelect from "../../ui/CustomSelect";
import { Modal } from "../../ui/Modal";
import { MAX_RECIPIENTS } from "../limits";
import { LOADING_TARGETS_HINT } from "../step1-helpers";
import {
  alimtalkBadgeOf,
  failureReasonOf,
  progressHeadline,
  type BulkPricing,
  type RefundedNotice,
  type SkippedNotice,
} from "../step3-helpers";
import { SectionHead, won } from "../bulk-ui";
import { type Progress, type Step } from "../useBulkState";

export interface Step3ConfirmProps {
  restoredFromStore: boolean;
  selectedCount: number;
  myName: string;
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
}

export function Step3Confirm({
  restoredFromStore,
  selectedCount,
  myName,
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
}: Step3ConfirmProps) {
  return (
    <>
        <Card>
          <SectionHead
            no="03"
            tone="green"
            icon={Send}
            title="발송 확인"
            desc="마지막으로 한 번 더 확인하고 보냅니다"
          />

          {/* 되살린 화면에서는 확인 표를 안 그린다 — 대상·안내문이 복원되지 않아 0명·0원으로 보인다. */}
          {!restoredFromStore && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-wedly-bd">
            {[
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
            ].map((row) => (
              <div key={row.k} className="grid grid-cols-[110px_1fr] border-t border-wedly-bd first:border-t-0 sm:grid-cols-[160px_1fr]">
                <div className="bg-wedly-bg-gray px-3 py-2.5 text-wedly-tablehead font-semibold text-wedly-t2 break-keep">
                  {row.k}
                </div>
                <div className="min-w-0 bg-white px-3 py-2.5 text-wedly-sub text-wedly-t1 break-keep">{row.v}</div>
              </div>
            ))}
          </div>
          )}

          {!jobId && (
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
          )}

          {!jobId && (
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
          )}

          {!jobId ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="lg" onClick={() => goStep(2)}>이전 단계</Button>
              <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={!sendReady}>
                <Send className="h-[15px] w-[15px]" />
                {won(selectedCount)}명에게 발송하기
              </Button>
              {loadingTargets ? (
                <span className="text-wedly-hint text-wedly-muted break-keep">{LOADING_TARGETS_HINT}</span>
              ) : (
                <span className="text-wedly-hint text-wedly-muted break-keep">
                  발송 중에는 진행률이 표시되고, 실패한 분은 따로 모아 보여줍니다
                </span>
              )}
            </div>
          ) : (
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

              <div className="rounded-2xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-wedly-sub font-semibold text-wedly-t1">
                    {progressHeadline(progress?.status)}
                  </span>
                  <span className="ml-auto text-wedly-sub tabular-nums text-wedly-t2">
                    {won((progress?.sent ?? 0) + (progress?.failed ?? 0))} / {won(progress?.total ?? 0)}명
                  </span>
                </div>
                <ProgressBar
                  value={progress && progress.total > 0 ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}
                  className="h-2 rounded-full"
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Badge variant="green">보냄 {won(progress?.sent ?? 0)}</Badge>
                  <Badge variant="red">실패 {won(progress?.failed ?? 0)}</Badge>
                  <Badge variant="default">남음 {won(pending)}</Badge>
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

              {progress?.status === "done" && (
                <StatusBox tone="success" title="발송이 끝났어요">
                  {won(progress.sent)}명에게 보냈어요{progress.failed > 0 ? ` · ${won(progress.failed)}명은 실패했어요` : ""}. 답장은 채널톡에서 보낸 담당자에게 배정됩니다.
                </StatusBox>
              )}
              {progress?.stalled && progress.status === "running" && (
                <StatusBox tone="warning" title="발송이 오래 멈춰 있어요">
                  3분 넘게 진행이 없습니다. 잠시 뒤에도 그대로면 화면을 새로 고쳐 상태를 다시 확인해 주세요.
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
                        <th scope="col" className="px-3 py-2.5">연락처</th>
                        <th scope="col" className="px-3 py-2.5">알림 상태</th>
                        <th scope="col" className="px-3 py-2.5">실패한 이유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.recipients.map((r, i) => {
                        const badge = alimtalkBadgeOf(r.alimtalkStatus, r.viewedAt, r.status);
                        return (
                          <tr key={`${r.phone}-${i}`} className="border-t border-wedly-bd">
                            <td className="min-w-0 px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">{r.companyName || "—"}</td>
                            <td className="px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">{r.representative || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums text-wedly-t1">{r.phone || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {/* 정본 딱지 — 흰 알약 + 뜻을 담은 색 점(Badge 기본형). */}
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </td>
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
              {won(selectedCount)}명에게 발송
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-wedly-bd">
            {[
              { k: "받는 사람", v: `${won(selectedCount)}명` },
              {
                // ★3단계 표와 같은 estimateCost 로 센다 — 발송 직전에 숫자가 달라지면 사고로 읽힌다.
                // ★「부가세 별도」를 3단계 표에만 적어 두면, 마지막에 보는 이 금액을 청구액으로 읽는다.
                k: "예상 비용",
                v: `알림톡 약 ${won(cost.alimtalk)}원 (건당 ${won(pricing.alimtalkWon)}원) · 문자는 해당되는 분만 최대 ${won(cost.smsMax)}원 · 부가세 별도`,
              },
              { k: "보내는 이름", v: "위들리 — 채널톡 공식 채널" },
            ].map((r) => (
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
    </>
  );
}
