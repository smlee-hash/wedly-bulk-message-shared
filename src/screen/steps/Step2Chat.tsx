"use client";

// 2단계 — 안내문 만들기(+ 시험 발송 모달).
// JSX 는 BulkMessageScreen 에서 **글자 그대로** 옮겼다(문구·클래스·들여쓰기까지 그대로).
// ★시험 발송 모달을 이 파일로 함께 옮겼다 — Modal 은 닫혀 있으면 null 을 그리므로(ui/Modal.tsx:35)
//  달아 두는 자리가 바뀌어도 그려지는 것은 같다. 모달을 여는 단추도 이 단계 안에 있다.

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { Eye, MessageCircle, MessageSquare, Pencil, Plus, RotateCcw, Smartphone, Sparkles } from "lucide-react";
import { Skeleton, StatusBox, Textarea } from "@wedly/ui-shared/ui";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Input } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { cn } from "../../ui/cn";
import {
  MIN_ORIGINAL_LEN,
  TEST_SEND_WAIT_HINT,
  applyPreviewExamples,
  originalTooShort,
} from "../step2-helpers";
import { type BulkPricing } from "../step3-helpers";
import { FillForm, SectionHead, TOKEN_CHIPS, renderPreview, won } from "../bulk-ui";
import { type Step } from "../useBulkState";

export interface Step2ChatProps {
  originalRef: RefObject<HTMLTextAreaElement | null>;
  originalText: string;
  setOriginalText: (value: string) => void;
  finalText: string;
  setFinalText: (value: string) => void;
  composedText: string;
  converting: boolean;
  converted: boolean;
  streamHasChunk: boolean;
  editing: boolean;
  toggleEditing: () => void;
  insertToken: (token: string) => void;
  convert: (opts?: { force?: boolean }) => Promise<void>;
  step2ConversionReady: boolean;
  step2Hint: string;
  adWords: string[];
  fillFormVisible: boolean;
  fillMarkers: string[];
  fillValues: Record<string, string>;
  setFillValues: Dispatch<SetStateAction<Record<string, string>>>;
  fillsComplete: boolean;
  canTestSend: boolean;
  showTestSendWait: boolean;
  goStep: (s: Step) => void;
  canGo: (s: Step) => boolean;
  // 시험 발송 모달
  testOpen: boolean;
  setTestOpen: (open: boolean) => void;
  testPhone: string;
  setTestPhone: (value: string) => void;
  testSending: boolean;
  testSend: () => void;
  testDone: string;
  setTestDone: (value: string) => void;
  testError: string;
  setTestError: (value: string) => void;
  pricing: BulkPricing;
  noticeCategoryPicked: string;
  testNoticeCategoryLabel: string;
  /**
   * 원문 칸을 이 판에서 감출지 — 「둘 다」일 때 위 이메일 판이 원문 칸 하나를 맡는다.
   * ★상태(originalText)는 그대로 함께 쓴다. 칸만 한 곳에 둔다(원문이 두 칸이면 어느 쪽이
   *  진짜인지 알 수 없고, 같은 ref 를 두 칸이 다투게 된다).
   */
  hideOriginal?: boolean;
}

export function Step2Chat({
  originalRef,
  originalText,
  setOriginalText,
  finalText,
  setFinalText,
  composedText,
  converting,
  converted,
  streamHasChunk,
  editing,
  toggleEditing,
  insertToken,
  convert,
  step2ConversionReady,
  step2Hint,
  adWords,
  fillFormVisible,
  fillMarkers,
  fillValues,
  setFillValues,
  fillsComplete,
  canTestSend,
  showTestSendWait,
  goStep,
  canGo,
  testOpen,
  setTestOpen,
  testPhone,
  setTestPhone,
  testSending,
  testSend,
  testDone,
  setTestDone,
  testError,
  setTestError,
  pricing,
  noticeCategoryPicked,
  testNoticeCategoryLabel,
  hideOriginal,
}: Step2ChatProps) {
  return (
    <>
        <Card>
          <SectionHead
            no="02"
            tone="purple"
            icon={MessageSquare}
            title={hideOriginal ? "안내문 만들기 — 카카오 채팅" : "안내문 만들기"}
            desc={
              hideOriginal
                ? "위 원문으로 채팅용 안내문도 함께 만들어져요"
                : "적고 잠시 멈추면 AI가 위들리 형식으로 바꿔 줘요"
            }
          />

          <div className={cn("grid grid-cols-1 gap-4", !hideOriginal && "lg:grid-cols-2")}>
            {/* 왼쪽 — 원문. 「둘 다」면 위 이메일 판이 이 칸을 맡는다(상태는 함께 쓴다). */}
            {!hideOriginal && (
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-wedly-sub font-semibold text-wedly-t1">보내고 싶은 내용 (원문)</span>
                <span className="text-wedly-hint text-wedly-muted break-keep">평소 쓰던 대로 편하게 적으면 됩니다</span>
              </div>
              <Textarea
                ref={originalRef}
                autosize={false}
                rows={10}
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="예) 안녕하세요 위들리입니다. 지원금 신청에 필요한 서류를 9월 5일까지 보내주셔야 합니다…"
                className="min-h-[240px] w-full leading-6"
                maxLength={4000}
                aria-label="보내고 싶은 내용 원문"
              />
              <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
                {originalTooShort(originalText)
                  ? "조금 더 자세히 적어 주세요"
                  : "입력을 멈추면 오른쪽 미리보기가 나와요"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-wedly-hint font-semibold text-wedly-t2">눌러서 넣기</span>
                {TOKEN_CHIPS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertToken(v)}
                    aria-label={`${v} 넣기`}
                    className={cn(
                      "inline-flex min-h-10 sm:min-h-[28px] cursor-pointer items-center gap-1 rounded-full border border-wedly-bd bg-white px-2.5 py-1",
                      "text-wedly-hint font-semibold text-wedly-t1 shadow-sm",
                      "transition-colors duration-150 ease-out hover:border-wedly-accent/50 hover:bg-wedly-bg-page",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                    )}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {v}
                  </button>
                ))}
                <span className="text-wedly-hint text-wedly-muted break-keep">
                  대표님 이름·회사명이 자동으로 채워져요
                </span>
              </div>
              <p className="mt-1.5 text-right text-wedly-hint text-wedly-muted tabular-nums">
                {originalText.length}/4,000
              </p>
            </div>
            )}

            {/* 오른쪽 — 변환 결과 */}
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-wedly-sub font-semibold text-wedly-t1">변환 결과 미리보기</span>
                <span className="text-wedly-hint text-wedly-muted break-keep">
                  {editing ? "고친 내용은 바로 반영됩니다" : "「직접 고치기」를 누르면 바로 고칠 수 있습니다"}
                </span>
                {converted && !converting && step2ConversionReady && (
                  <button
                    type="button"
                    onClick={toggleEditing}
                    className={cn(
                      "ml-auto inline-flex min-h-10 sm:min-h-[26px] items-center gap-1 rounded-full border border-wedly-bd bg-white px-2.5 py-1",
                      "text-wedly-hint font-semibold text-wedly-accent-ink shadow-sm",
                      "transition-colors duration-150 ease-out hover:bg-wedly-bg-page",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                    )}
                  >
                    {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {editing ? "미리보기" : "직접 고치기"}
                  </button>
                )}
              </div>

              {converting && !streamHasChunk ? (
                <div
                  className="min-h-[240px] rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-wedly-purple" aria-hidden />
                    <span className="text-wedly-sub font-semibold text-wedly-t1">AI가 다듬는 중…</span>
                  </div>
                  <Skeleton variant="line" className="mb-2" />
                  <Skeleton variant="line" className="mb-2 w-5/6" />
                  <Skeleton variant="line" className="mb-2 w-4/5" />
                  <Skeleton variant="line" className="w-2/3" />
                </div>
              ) : editing ? (
                <Textarea
                  autosize={false}
                  rows={12}
                  value={finalText}
                  onChange={(e) => setFinalText(e.target.value)}
                  className="min-h-[240px] w-full leading-6"
                  aria-label="변환된 안내문 직접 고치기"
                />
              ) : (
                <div className="min-h-[240px] rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-wedly-accent text-wedly-hint font-bold text-white">
                      W
                    </span>
                    <span className="text-wedly-tablehead font-semibold text-wedly-t1">위들리</span>
                  </div>
                  <div className="rounded-[4px_16px_16px_16px] border border-wedly-bd bg-white px-4 py-3.5 text-wedly-sub leading-6 text-wedly-t1 shadow-sm break-keep">
                    {composedText ? (
                      <p className="whitespace-pre-wrap">{renderPreview(applyPreviewExamples(composedText))}</p>
                    ) : (
                      <span className="text-wedly-muted break-keep">
                        왼쪽 칸에 내용을 적고 잠시 멈추면 여기에 미리보기가 나와요.
                      </span>
                    )}
                  </div>
                  {composedText && (composedText.includes("{대표명}") || composedText.includes("{회사명}")) && (
                    <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
                      대표님마다 실제 이름·회사명으로 바뀝니다
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => { void convert({ force: true }); }}
                  loading={converting}
                  disabled={originalText.trim().length < MIN_ORIGINAL_LEN}
                >
                  <RotateCcw className="h-[15px] w-[15px]" />
                  다시 변환
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setTestDone(""); setTestError(""); setTestOpen(true); }}
                  disabled={!canTestSend}
                >
                  <Smartphone className="h-[15px] w-[15px]" />
                  내 번호로 시험 발송
                </Button>
                {showTestSendWait && (
                  <span className="self-center text-wedly-hint text-wedly-muted break-keep">{TEST_SEND_WAIT_HINT}</span>
                )}
              </div>
            </div>
          </div>

          {/* 자동 점검 · 채우기 폼 */}
          <div className="mt-4 space-y-3">
            {adWords.length > 0 && (
              <StatusBox tone="warning" title="광고로 읽힐 수 있는 낱말이 있어요">
                {adWords.join(" · ")} — 정보성 안내로 보내려면 이 표현을 빼는 편이 안전해요. 「직접 고치기」로 고칠 수 있습니다.
              </StatusBox>
            )}
            {/* ★입력칸은 「다 채웠나」로 숨기지 않는다 — showFillForm 주석(step2-helpers)의 사고를 다시 내지 마라.
                「모두 채웠어요」는 입력칸을 갈아치우지 않고 그 아래에 안내만 덧붙인다. */}
            {fillFormVisible && (
              <FillForm
                markers={fillMarkers}
                values={fillValues}
                onChange={(marker, value) => setFillValues((prev) => ({ ...prev, [marker]: value }))}
              />
            )}
            {fillFormVisible && fillsComplete && (
              <StatusBox tone="success" title="모두 채웠어요">
                미리보기에 반영됐어요. 다음 단계로 갈 수 있어요.
              </StatusBox>
            )}
            {step2ConversionReady && fillMarkers.length === 0 && adWords.length === 0 && composedText.trim() && (
              <StatusBox tone="success" title="발송 전 자동 점검 통과">
                광고성 표현 없음 · 빠진 정보 없음. 바로 다음 단계로 넘어갈 수 있어요.
              </StatusBox>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => goStep(1)}>이전 단계</Button>
            <Button onClick={() => goStep(3)} disabled={!canGo(3)}>발송 확인으로</Button>
            {step2Hint && (
              <span className="text-wedly-hint text-wedly-muted break-keep">{step2Hint}</span>
            )}
          </div>
        </Card>

      {/* 시험 발송 모달 */}
      <Modal
        open={testOpen}
        onClose={() => { if (!testSending) setTestOpen(false); }}
        title="내 번호로 시험 발송"
        description="고객이 받는 그대로 — 카카오 알림톡 한 통을 보냅니다."
        footer={
          // ★버튼 글자가 길어 좁은 폭에서 잘린다 — 넘치면 줄을 바꾼다.
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setTestOpen(false)} disabled={testSending}>
              닫기
            </Button>
            <Button onClick={testSend} loading={testSending} disabled={!testPhone.trim() || !canTestSend}>
              <MessageCircle className="h-[15px] w-[15px]" />
              알림톡으로 시험 발송
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            id="bm-test-phone"
            label="받을 휴대폰 번호"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="010-0000-0000"
            inputMode="tel"
            className="tabular-nums"
          />
          {/* ★무엇이 오는지 먼저 알려 준다 — 「문자가 오나?」로 기다리다 못 받은 줄 아는 일이 없게. */}
          <StatusBox tone="info" title={`알림톡 1통(${won(pricing.alimtalkWon)}원)이 갑니다`}>
            카카오톡으로 안내 알림이 오고, 버튼을 누르면 안내문이 담긴 채팅방이 열립니다 — 고객이 겪는 순서 그대로입니다.
            {/* ★어떤 안내구분으로 나가는지 밝힌다 — 「고객이 받는 그대로」라고 적어 두고 정작
                무엇으로 나가는지 안 알리면, 실제 발송에서 다른 문구를 보고 놀란다.
              ★StatusBox 는 children 을 <p> 로 감싼다 — 여기에 <p> 를 또 넣지 마라(줄만 바꾼다). */}
            <span className="mt-1 block break-keep">
              안내 내용은 「{testNoticeCategoryLabel}」로 나갑니다
              {!noticeCategoryPicked && " — 3단계에서 고르면 그 값으로 나가요"}.
            </span>
            {/* ★예전에 시험 발송을 해 본 번호는 채널톡에 이미 저장돼 있어(진행 중인 진짜 상담의 답변
                알림을 끊지 않으려 일부러 안 지운다) 팔로업 문자가 알림톡과 함께 온다 — 안 적으면
                「왜 문자가 또 오지?」로 읽힌다. */}
            <span className="mt-1 block break-keep">
              예전에 시험해 본 번호는 채널톡에 번호가 남아 있어 문자도 함께 올 수 있어요.
            </span>
          </StatusBox>
          <p className="text-wedly-hint text-wedly-muted break-keep">
            개인화 값은 {"{대표명}"}=홍길동, {"{회사명}"}=시험회사로 채워 보냅니다. 「확인 필요」 표시가 남아 있어도 시험 발송은 됩니다.
          </p>
          {testError && (
            <StatusBox tone="error" title="시험 발송에 실패했어요">{testError}</StatusBox>
          )}
          {testDone && (
            <StatusBox tone="success" title="시험 발송 완료">{testDone}</StatusBox>
          )}
        </div>
      </Modal>
    </>
  );
}
