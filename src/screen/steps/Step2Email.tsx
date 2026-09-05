"use client";

// 2단계 — 안내문 만들기(이메일).
// 시각 계약(정본): docs/superpowers/specs/2026-09-04-email-send-preview.html §2단계.
//  왼쪽 원문·광고 잠금·사실 잠금·채우기 칸·첨부 / 오른쪽 받은편지함 카드·서식 미리보기·본문 고치기.
// ★고를 것이 없다 — 정보성/광고성 라디오도, 제목 후보도, 구획별 토글도 만들지 않는다(설계서 §4-8).
// ★서식은 서버가 그린 HTML 을 그대로 띄운다. 화면이 메일 모양을 따로 그리지 않는다.

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronRight, Mail, Paperclip, RotateCcw, Send, Sparkles } from "lucide-react";
import { SegmentedControl, Skeleton, StatusBox, Textarea } from "@wedly/ui-shared/ui";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Input } from "../../ui/Input";
import { cn } from "../../ui/cn";
import type { BulkEmailBody, EmailAttachment, EmailFactLock } from "../../rules/email-body";
import {
  ATTACH_DROP_NOTE,
  ATTACH_FILE_NOTE,
  EMAIL_FROM_ADDRESS,
  EMAIL_SUBJECT_CHIP,
  EMAIL_TEST_SEND_NOTE,
  MIN_ORIGINAL_LEN,
  factLockNotice,
  fileSizeLabel,
  originalTooShort,
  subjectHints,
} from "../step2-helpers";
import { EmailPreview } from "../EmailPreview";
import {
  EMAIL_TOKEN_CHIPS,
  EditableText,
  FillForm,
  SectionHead,
  TokenChips,
  fileExtLabel,
} from "../bulk-ui";
import { type Step } from "../useBulkState";

const DEVICE_OPTIONS = [
  { value: "desktop", label: "컴퓨터" },
  { value: "mobile", label: "휴대폰" },
];

export interface Step2EmailProps {
  originalRef: RefObject<HTMLTextAreaElement | null>;
  originalText: string;
  setOriginalText: (value: string) => void;
  insertToken: (token: string) => void;
  myName: string;

  emailBody: BulkEmailBody | null;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailPreheader: string;
  setEmailPreheader: (value: string) => void;
  emailWarnings: string[];
  adSentences: string[];
  factLock: EmailFactLock | null;
  emailFilled: Record<string, string>;
  setEmailFilled: Dispatch<SetStateAction<Record<string, string>>>;
  emailFillMarkers: string[];
  emailConverting: boolean;
  emailError: string;
  convertEmail: (opts?: { force?: boolean }) => Promise<void>;
  editEmailBody: (path: string, value: string) => void;

  emailAttachments: EmailAttachment[];
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (uploadId: string) => void;
  attachError: string;
  attachUploading: boolean;

  previewHtml: string;
  previewLoading: boolean;
  previewError: string;
  previewDevice: "desktop" | "mobile";
  setPreviewDevice: (device: "desktop" | "mobile") => void;
  previewReal: boolean;
  setPreviewReal: (real: boolean) => void;
  previewRecipient: { companyName: string; representative: string } | null;
  emailPreviewTargetCount: number;
  nextPreviewRecipient: () => void;

  testSendEmail: () => void;
  emailTestSending: boolean;
  emailTestDone: string;
  emailTestError: string;

  /** 통로가 「이메일」뿐일 때만 이 판이 아래 단추 줄을 그린다(「둘 다」면 채팅 판이 맡는다). */
  showFooter: boolean;
  /** 「둘 다」인가 — 아래에 채팅 안내문 판이 따라붙는다는 안내를 켠다. */
  channelBoth: boolean;
  goStep: (s: Step) => void;
  canGo: (s: Step) => boolean;
  step2Hint: string;
}

/** 켬/끔 스위치 — 시안 `.switch`(트랙 + 흰 원). 색만으로 알리지 않게 글자를 늘 옆에 둔다. */
function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-1 py-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
      )}
    >
      <span
        className={cn(
          "relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out",
          on ? "bg-wedly-accent" : "bg-wedly-bd-blue",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] duration-150 ease-out",
            on ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      <span className="text-wedly-hint font-medium text-wedly-t2 break-keep">{label}</span>
    </button>
  );
}

/** 「본문 고치기」 한 칸 — 라벨 + 입력. 고치면 그 자리에서 8구획 JSON 이 바뀐다. */
function EditRow({
  id,
  label,
  value,
  onChange,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(6rem,0.7fr)_minmax(0,2fr)] sm:items-center">
      <label htmlFor={id} className="text-wedly-tablehead font-semibold text-wedly-t1 break-keep">
        {label}
      </label>
      {multiline ? (
        <Textarea
          id={id}
          autosize={false}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full leading-6"
        />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      )}
    </div>
  );
}

export function Step2Email({
  originalRef,
  originalText,
  setOriginalText,
  insertToken,
  myName,
  emailBody,
  emailSubject,
  setEmailSubject,
  emailPreheader,
  setEmailPreheader,
  emailWarnings,
  adSentences,
  factLock,
  emailFilled,
  setEmailFilled,
  emailFillMarkers,
  emailConverting,
  emailError,
  convertEmail,
  editEmailBody,
  emailAttachments,
  addAttachments,
  removeAttachment,
  attachError,
  attachUploading,
  previewHtml,
  previewLoading,
  previewError,
  previewDevice,
  setPreviewDevice,
  previewReal,
  setPreviewReal,
  previewRecipient,
  emailPreviewTargetCount,
  nextPreviewRecipient,
  testSendEmail,
  emailTestSending,
  emailTestDone,
  emailTestError,
  showFooter,
  channelBoth,
  goStep,
  canGo,
  step2Hint,
}: Step2EmailProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 받은편지함 카드의 시각 — 서버에서 그릴 때와 값이 달라 화면이 어긋나지 않게 뜬 뒤에 채운다.
  const [nowLabel, setNowLabel] = useState("");
  useEffect(() => {
    setNowLabel(new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }));
  }, []);

  const hints = subjectHints(emailSubject, emailPreheader);
  const fact = factLockNotice(factLock);
  const converted = !!emailBody;

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) void addAttachments(files);
  };

  return (
    <Card>
      <SectionHead
        no="02"
        tone="purple"
        icon={Mail}
        title="안내문 만들기 — 이메일"
        desc="내용만 적으면 제목·미리보기 문구·위들리 서식이 자동으로 만들어져요"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ══════════ 왼쪽 — 원문·잠금·첨부 ══════════ */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-wedly-sub font-semibold text-wedly-t1">보내고 싶은 내용 (원문)</span>
            <span className="text-wedly-hint text-wedly-muted break-keep">평소 쓰던 대로 편하게 적으면 됩니다</span>
          </div>
          <Textarea
            ref={originalRef}
            autosize={false}
            rows={12}
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
              : "입력을 멈추면 오른쪽에 받은편지함 모습과 서식이 나와요"}
          </p>
          <TokenChips tokens={EMAIL_TOKEN_CHIPS} onInsert={insertToken} />
          <p className="mt-1.5 text-right text-wedly-hint text-wedly-muted tabular-nums">
            {originalText.length}/4,000
          </p>

          <div className="mt-3 space-y-3">
            {emailConverting && (
              <div
                className="rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4"
                aria-busy="true"
                aria-live="polite"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-wedly-purple" aria-hidden />
                  <span className="text-wedly-sub font-semibold text-wedly-t1">AI가 이메일 서식으로 정리하는 중…</span>
                </div>
                <Skeleton variant="line" className="mb-2" />
                <Skeleton variant="line" className="w-4/5" />
              </div>
            )}

            {emailError && (
              <StatusBox tone="error" title="이메일 안내문을 만들지 못했어요">
                {emailError}
              </StatusBox>
            )}

            {/* 광고 잠금 — 잡힌 문장을 그대로 인용한다(어느 문장인지 몰라 못 고치는 일이 없게). */}
            {adSentences.length > 0 && (
              <StatusBox tone="error" title="광고로 읽히는 문장이 있어 보낼 수 없어요">
                이메일·알림톡은 정보성 안내만 보냅니다. 이 문장을 지우거나 고쳐 주세요:{" "}
                <span className="font-semibold text-wedly-red-ink">
                  {adSentences.map((s) => `「${s.trim()}」`).join(" ")}
                </span>
              </StatusBox>
            )}

            {/* 사실 잠금 — 원문의 숫자·서류 이름이 정리본에 그대로 있나(코드 검사) */}
            {fact && (
              <StatusBox tone={fact.tone} title={fact.title}>
                {fact.detail}
              </StatusBox>
            )}

            {/* 채우기 칸 — 채팅 판과 같은 부품. 「다 채웠나」로 숨기지 않는다. */}
            {emailFillMarkers.length > 0 && (
              <FillForm
                markers={emailFillMarkers}
                values={emailFilled}
                onChange={(marker, value) => setEmailFilled((prev) => ({ ...prev, [marker]: value }))}
              />
            )}

            {emailWarnings.length > 0 && (
              <StatusBox tone="info" title="정리하면서 손본 곳이 있어요">
                {emailWarnings.join(" · ")}
              </StatusBox>
            )}

            {/* ── 첨부파일 ── */}
            <div className="rounded-2xl border border-wedly-bd/60 bg-wedly-bg-gray p-3.5">
              <h4 className="mb-2 flex items-center gap-2 text-wedly-sub font-semibold text-wedly-t1">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-[7px] bg-wedly-accent">
                  <Paperclip className="h-3 w-3 text-white" aria-hidden />
                </span>
                첨부파일
              </h4>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={cn(
                  "rounded-xl border-[1.5px] border-dashed bg-white p-3.5 text-center",
                  "transition-colors duration-150 ease-out",
                  dragOver ? "border-wedly-accent bg-wedly-bg-blue" : "border-wedly-bd-blue",
                )}
              >
                <p className="text-wedly-sub text-wedly-t2 break-keep">
                  파일을 여기에 끌어다 놓거나{" "}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={attachUploading}
                    className={cn(
                      "font-semibold text-wedly-accent-ink underline-offset-2 hover:underline",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                      "disabled:opacity-50",
                    )}
                  >
                    눌러서 고르기
                  </button>
                </p>
                <p className="mt-1 text-wedly-hint text-wedly-muted break-keep">{ATTACH_DROP_NOTE}</p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  aria-label="첨부할 파일 고르기"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) void addAttachments(files);
                    e.target.value = "";
                  }}
                />
              </div>

              {attachUploading && (
                <p className="mt-2 text-wedly-hint text-wedly-t2 break-keep" aria-live="polite">
                  파일을 올리는 중이에요…
                </p>
              )}
              {attachError && (
                <p className="mt-2 text-wedly-hint font-semibold text-wedly-red-ink break-keep" role="alert">
                  {attachError}
                </p>
              )}

              {emailAttachments.map((f) => (
                <div
                  key={f.uploadId}
                  className="mt-2 flex items-center gap-2.5 rounded-[10px] border border-wedly-bd bg-white px-2.5 py-2"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-wedly-bg-green text-[10px] font-bold text-wedly-green-ink">
                    {fileExtLabel(f.fileName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-wedly-sub font-semibold text-wedly-t1">{f.fileName}</p>
                    <p className="text-wedly-hint text-wedly-muted break-keep">
                      {fileSizeLabel(f.bytes)} · {ATTACH_FILE_NOTE}
                    </p>
                  </div>
                  <Button variant="secondary" size="xs" onClick={() => removeAttachment(f.uploadId)}>
                    빼기
                  </Button>
                </div>
              ))}
            </div>

            {channelBoth && (
              <p className="text-wedly-hint text-wedly-muted break-keep">
                「둘 다」로 보내면 같은 원문으로 카카오 채팅용 안내문도 아래에 따로 만들어져요(지금과 같음).
              </p>
            )}
          </div>
        </div>

        {/* ══════════ 오른쪽 — 받은편지함 카드·서식 미리보기 ══════════ */}
        <div className="min-w-0">
          {/* ── 받은편지함 카드 ── */}
          <div className="mb-3 rounded-2xl border border-wedly-bd/60 bg-wedly-bg-gray p-3.5">
            <h4 className="mb-2 flex flex-wrap items-center gap-2 text-wedly-sub font-semibold text-wedly-t1">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-[7px] bg-wedly-accent">
                <Mail className="h-3 w-3 text-white" aria-hidden />
              </span>
              받은편지함에서 이렇게 보여요
              <span className="ml-auto text-wedly-hint font-normal text-wedly-muted break-keep">
                제목·미리보기 문구를 눌러 바로 고칠 수 있어요
              </span>
            </h4>
            <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-xl border border-wedly-bd bg-white px-3.5 py-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-wedly-accent text-wedly-hint font-bold text-white">
                W
              </span>
              <div className="min-w-0">
                <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">
                  WEDLY {myName || "담당자"}{" "}
                  <span className="text-wedly-hint font-normal text-wedly-muted">&lt;{EMAIL_FROM_ADDRESS}&gt;</span>
                </p>
                <p className="mt-0.5 truncate text-wedly-sub font-semibold text-wedly-t1">
                  <span className="mr-1 inline-flex items-center rounded-md bg-wedly-bg-blue px-2 py-0.5 text-[11px] font-semibold text-wedly-accent-ink">
                    {EMAIL_SUBJECT_CHIP}
                  </span>
                  <EditableText
                    value={emailSubject}
                    onChange={setEmailSubject}
                    ariaLabel="메일 제목"
                    className="text-wedly-t1"
                  />
                </p>
                <p className="mt-0.5 text-wedly-hint text-wedly-t2">
                  <EditableText
                    value={emailPreheader}
                    onChange={setEmailPreheader}
                    ariaLabel="받은편지함 미리보기 문구"
                  />
                </p>
              </div>
              <span className="text-wedly-hint text-wedly-muted tabular-nums">{nowLabel}</span>
            </div>
            {hints.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hints.map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center gap-1.5 rounded-full border border-wedly-bd bg-white px-2.5 py-0.5 text-xs font-medium text-wedly-t1 shadow-sm break-keep"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-wedly-gold-ink" aria-hidden />
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── 서식 미리보기 ── */}
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-wedly-sub font-semibold text-wedly-t1 break-keep">
              위들리 서식 미리보기{" "}
              <span className="text-wedly-hint font-normal text-wedly-muted">
                — 본문 글자는 미리보기 아래 접이식 칸에서 고쳐요
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle on={previewReal} onToggle={() => setPreviewReal(!previewReal)} label="실제 수신자로 보기" />
              {previewReal && emailPreviewTargetCount > 1 && (
                <Button variant="secondary" size="xs" onClick={nextPreviewRecipient}>
                  다음 수신자
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              <SegmentedControl
                options={DEVICE_OPTIONS}
                value={previewDevice}
                onChange={(v) => setPreviewDevice(v === "mobile" ? "mobile" : "desktop")}
                className="rounded-xl border border-wedly-bd bg-wedly-bg-gray p-[3px] [&>button]:rounded-[9px]"
              />
            </div>
          </div>
          {previewReal && (
            <p className="mb-1.5 text-wedly-hint text-wedly-muted break-keep">
              {previewRecipient
                ? `${previewRecipient.companyName} · ${previewRecipient.representative} 대표님이 받을 모습이에요`
                : "고른 분 중에 이메일이 있는 분이 없어요 — 1단계에서 먼저 골라 주세요"}
            </p>
          )}

          <EmailPreview
            html={previewHtml}
            device={previewDevice}
            loading={previewLoading}
            error={previewError}
          />

          {/* ── 본문 고치기(구획별) ──
              ★iframe 안 글자를 직접 고치게 하지 않는다 — 서식이 깨지고 8구획 JSON 과 어긋난다.
                시안의 「눌러서 고침」은 이 패널이 맡는다. */}
          {converted && emailBody && (
            <details className="group mt-3 rounded-2xl border border-wedly-bd/60 bg-wedly-bg-gray">
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-2 rounded-2xl px-3.5 py-3",
                  "transition-colors duration-150 ease-out hover:bg-wedly-bg-sidebar",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                  "[&::-webkit-details-marker]:hidden",
                )}
              >
                <ChevronDown
                  className="h-4 w-4 shrink-0 -rotate-90 text-wedly-t2 transition-transform duration-150 ease-out group-open:rotate-0"
                  aria-hidden
                />
                <span className="text-wedly-sub font-semibold text-wedly-t1">본문 고치기</span>
                <span className="ml-auto text-wedly-hint text-wedly-muted break-keep">
                  고치면 미리보기가 바로 다시 그려져요
                </span>
              </summary>
              <div className="space-y-3 border-t border-wedly-bd/60 p-3.5">
                <EditRow
                  id="bm-email-conclusion"
                  label="한 줄 결론"
                  value={emailBody.conclusion}
                  onChange={(v) => editEmailBody("conclusion", v)}
                  multiline
                />
                <EditRow
                  id="bm-email-conclusion-sub"
                  label="결론 아래 한 줄"
                  value={emailBody.conclusion_sub}
                  onChange={(v) => editEmailBody("conclusion_sub", v)}
                />

                {emailBody.facts.map((f, i) => (
                  <div key={`fact-${i}`} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <EditRow
                      id={`bm-email-fact-${i}-label`}
                      label={`핵심 사실 ${i + 1} 이름`}
                      value={f.label}
                      onChange={(v) => editEmailBody(`facts[${i}].label`, v)}
                    />
                    <EditRow
                      id={`bm-email-fact-${i}-value`}
                      label="값"
                      value={f.value}
                      onChange={(v) => editEmailBody(`facts[${i}].value`, v)}
                    />
                  </div>
                ))}

                {emailBody.sections.map((s, i) => (
                  <div key={`sec-${i}`} className="space-y-1.5 rounded-xl border border-wedly-bd/60 bg-white p-3">
                    <EditRow
                      id={`bm-email-sec-${i}-title`}
                      label={`소제목 ${i + 1}`}
                      value={s.title}
                      onChange={(v) => editEmailBody(`sections[${i}].title`, v)}
                    />
                    {s.bullets.map((b, j) => (
                      <EditRow
                        key={`sec-${i}-b-${j}`}
                        id={`bm-email-sec-${i}-b-${j}`}
                        label={`· 줄 ${j + 1}`}
                        value={b}
                        onChange={(v) => editEmailBody(`sections[${i}].bullets[${j}]`, v)}
                        multiline
                      />
                    ))}
                  </div>
                ))}

                <EditRow
                  id="bm-email-action-what"
                  label="해 주실 일"
                  value={emailBody.action.what}
                  onChange={(v) => editEmailBody("action.what", v)}
                  multiline
                />
                <EditRow
                  id="bm-email-action-when"
                  label="언제까지"
                  value={emailBody.action.when}
                  onChange={(v) => editEmailBody("action.when", v)}
                />
                <EditRow
                  id="bm-email-action-how"
                  label="어떻게"
                  value={emailBody.action.how}
                  onChange={(v) => editEmailBody("action.how", v)}
                />
                <EditRow
                  id="bm-email-action-btn"
                  label="버튼 글자"
                  value={emailBody.action.button_label}
                  onChange={(v) => editEmailBody("action.button_label", v)}
                />
                <EditRow
                  id="bm-email-closing"
                  label="맺음말"
                  value={emailBody.closing}
                  onChange={(v) => editEmailBody("closing", v)}
                  multiline
                />
              </div>
            </details>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => { void convertEmail({ force: true }); }}
              loading={emailConverting}
              disabled={originalText.trim().length < MIN_ORIGINAL_LEN}
            >
              <RotateCcw className="h-[15px] w-[15px]" />
              다시 정리
            </Button>
            <Button variant="secondary" onClick={testSendEmail} loading={emailTestSending} disabled={!converted}>
              <Send className="h-[15px] w-[15px]" />
              내 메일로 시험 발송
            </Button>
            <span className="text-wedly-hint text-wedly-muted break-keep">{EMAIL_TEST_SEND_NOTE}</span>
          </div>
          {emailTestError && (
            <StatusBox tone="error" title="시험 발송에 실패했어요" className="mt-2">
              {emailTestError}
            </StatusBox>
          )}
          {emailTestDone && (
            <StatusBox tone="success" title="시험 발송 완료" className="mt-2">
              {emailTestDone}
            </StatusBox>
          )}
        </div>
      </div>

      {showFooter && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => goStep(1)}>이전 단계</Button>
          <Button onClick={() => goStep(3)} disabled={!canGo(3)}>발송 확인으로</Button>
          {step2Hint && <span className="text-wedly-hint text-wedly-muted break-keep">{step2Hint}</span>}
        </div>
      )}
    </Card>
  );
}
