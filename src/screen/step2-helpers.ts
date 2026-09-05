// 2단계(안내문 만들기) — AI를 안 거치는 순수 판정. 서버 checks.ts 와 같은 표식 규칙을 화면에서 다시 쓴다.

import type { BulkEmailBody, EmailFactLock } from "../rules/email-body";

// 스트리밍이 체감 속도를 대부분 담당해서, 이 값을 올려도 타이핑 도중 느려 보이지 않는다.
// 400ms → 700ms(2026-09-02 리뷰 반영) — 짧을수록 타이핑 중 요청이 과하게 겹쳐 쏟아진다.
export const CONVERT_DEBOUNCE_MS = 700;
export const MIN_ORIGINAL_LEN = 10;
export const TEST_SEND_WAIT_HINT = "변환이 끝난 뒤 눌러 주세요";
/** 스트림이 잘리거나(길이 상한) AI 가 거절해서 안내문을 끝까지 못 만들었을 때 보여줄 문구. */
export const CONVERT_INCOMPLETE_MESSAGE = "안내문을 다 만들지 못했어요. 원문을 조금 줄이거나 다시 시도해 주세요.";
/** 채우기 칸 상한 — 발송 본문 1,500자를 한 칸이 혼자 채우지 못하게. */
export const FILL_MAX_LEN = 200;
/** 발송 API 본문 상한(checks.ts MAX_MESSAGE_LEN 과 같아야 한다). */
export const MAX_COMPOSED_LEN = 1500;

/** 미리보기 말풍선에만 쓰는 예시. 발송 본문의 {대표명}·{회사명} 은 그대로 둔다. */
export const PREVIEW_EXAMPLE = {
  representative: "김영섭",
  company: "한빛물류",
} as const;

const NEEDS_FILL_SOURCE = "\\[확인 필요[^\\]]*\\]";

function needsFillGlobal(): RegExp {
  return new RegExp(NEEDS_FILL_SOURCE, "g");
}

export function uniqueNeedsFill(text: string): string[] {
  const all = text.match(needsFillGlobal()) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of all) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/** "[확인 필요: 요일]" → "요일". 칸 이름이 없으면 기본 안내. */
export function needsFillLabel(marker: string): string {
  const m = marker.match(/^\[확인 필요(?::\s*([^\]]*))?\]$/);
  const inner = (m?.[1] ?? "").trim();
  return inner || "확인할 내용";
}

export function applyFillValues(text: string, fills: Record<string, string>): string {
  let out = text;
  for (const [marker, value] of Object.entries(fills)) {
    if (!marker || !value.trim()) continue;
    out = out.replaceAll(marker, value);
  }
  return out;
}

export function applyPreviewExamples(text: string): string {
  return text
    .replaceAll("{대표명}", PREVIEW_EXAMPLE.representative)
    .replaceAll("{회사명}", PREVIEW_EXAMPLE.company);
}

export function insertAtCursor(
  text: string,
  insert: string,
  start: number,
  end: number,
): { next: string; cursor: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return {
    next: text.slice(0, s) + insert + text.slice(e),
    cursor: s + insert.length,
  };
}

export function shouldAutoConvert(originalText: string, lastConvertedOriginal: string): boolean {
  const t = originalText.trim();
  if (t.length < MIN_ORIGINAL_LEN) return false;
  return t !== lastConvertedOriginal.trim();
}

export function originalTooShort(originalText: string): boolean {
  const t = originalText.trim();
  return t.length > 0 && t.length < MIN_ORIGINAL_LEN;
}

export function conversionReady(input: {
  finalText: string;
  originalText: string;
  lastConvertedOriginal: string;
  converting?: boolean;
}): boolean {
  if (input.converting) return false;
  const orig = input.originalText.trim();
  const final = input.finalText.trim();
  if (!final || !orig) return false;
  return orig === input.lastConvertedOriginal.trim();
}

export function allFillsComplete(markers: string[], fills: Record<string, string>): boolean {
  if (markers.length === 0) return false;
  return markers.every((m) => (fills[m] ?? "").trim().length > 0);
}

/**
 * ★채우기 입력칸(FillForm)을 보일지 — 「다 채웠나」를 여기에 절대 넣지 마라.
 *
 * allFillsComplete 는 칸마다 **한 글자만 있어도** 「다 채웠다」로 본다. 그 판정 위에
 * 「다 채웠으면 입력칸을 숨긴다」를 얹었더니, 「이번 달 말까지」를 치려고 첫 글자를 누르는
 * 순간 입력칸이 통째로 사라져 더 칠 수 없었고 잘린 값이 그대로 고객에게 나갔다
 * (2026-09-04 배포본 QA 실측 — 시험 발송 본문이 「서류를 사 준비해 주세요」로 잘려 나감).
 * 그래서 입력칸은 **표식이 있고 「직접 고치기」 중이 아니면 언제나 보인다**.
 * 「모두 채웠어요」 안내는 입력칸을 대체하지 말고 그 아래에 덧붙이기만 한다.
 */
export function showFillForm(input: {
  conversionReady: boolean;
  editing: boolean;
  markerCount: number;
}): boolean {
  return input.conversionReady && !input.editing && input.markerCount > 0;
}

export function clampFillValue(value: string): string {
  if (value.length <= FILL_MAX_LEN) return value;
  return value.slice(0, FILL_MAX_LEN);
}

export function composedTooLong(text: string): boolean {
  return text.length > MAX_COMPOSED_LEN;
}

export function composedLengthNotice(length: number): string {
  return `안내문이 너무 길어요 (${length.toLocaleString("ko-KR")}/${MAX_COMPOSED_LEN.toLocaleString("ko-KR")}자)`;
}

/** 2단계 다음 버튼 옆 안내 — 길이 초과가 다른 막힘보다 앞선다. */
export function step2FooterHint(input: {
  tooLong: boolean;
  composedLength: number;
  conversionReady: boolean;
  remainingFillCount: number;
}): string {
  if (input.tooLong) return composedLengthNotice(input.composedLength);
  if (!input.conversionReady) return "먼저 안내문 변환이 끝나야 해요";
  if (input.remainingFillCount > 0) return "확인할 내용을 모두 채워 주세요";
  return "";
}

export function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  return "name" in e && (e as { name: unknown }).name === "AbortError";
}

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("aborted", "AbortError");
}

/**
 * 변환 API 가 흘려 보내는 순수 텍스트를 받는 대로 모은다.
 * 화면은 onChunk(지금까지 모은 글) 로 미리보기를 바로 그린다.
 */
export async function readPlainTextStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError(signal);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  try {
    while (true) {
      if (signal?.aborted) throw abortError(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        acc += decoder.decode(value, { stream: true });
        onChunk(acc);
      }
    }
    const tail = decoder.decode();
    if (tail) {
      acc += tail;
      onChunk(acc);
    }
    return acc;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

/** 스트림 시작 전 JSON 오류 본문에서 안내 문장을 꺼낸다. */
export function convertApiErrorMessage(payload: unknown, fallback = "변환에 실패했어요."): string {
  if (!payload || typeof payload !== "object") return fallback;
  const rec = payload as Record<string, unknown>;
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim();
  if (rec.error && typeof rec.error === "object") {
    const msg = (rec.error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return fallback;
}

/** 원문이 마지막 변환과 다를 때 시험 발송을 막는다(옛 문장이 나가지 않게). */
export function testSendAllowed(input: {
  originalText: string;
  lastConvertedOriginal: string;
  converting?: boolean;
}): boolean {
  if (input.converting) return false;
  const orig = input.originalText.trim();
  if (!orig) return false;
  return orig === input.lastConvertedOriginal.trim();
}

// ══════════════════════════════════════════════════════════════
// 2단계 이메일 모드 — 시안(2026-09-04-email-send-preview.html) §2단계와 1:1.
// AI 를 안 거치는 순수 판정만 둔다(구조화·사실 잠금·광고 판정은 서버 몫).
// ══════════════════════════════════════════════════════════════

/** 서식 미리보기 다시 그리기 디바운스 — 원문 변환(0.7초)보다 짧게. */
export const PREVIEW_DEBOUNCE_MS = 300;
/** 발신 주소(고정). 표시이름만 담당자 이름이 붙는다. */
export const EMAIL_FROM_ADDRESS = "consulting@wedly.kr";
/** 제목 앞에 늘 붙는 칩 — 담당자가 지울 수 없다. */
export const EMAIL_SUBJECT_CHIP = "[WEDLY]";
/** 제목 권장 상한. 휴대폰 받은편지함이 25자쯤에서 자른다. */
export const SUBJECT_SOFT_MAX = 22;
export const EMAIL_STEP2_NOTE = "[확인 필요]가 다 채워지고 광고 표현이 없어야 다음으로 갈 수 있어요";
export const EMAIL_TEST_SEND_NOTE =
  "시험 발송에는 개인화 값이 들어가지 않아요 — 변수 확인은 「실제 수신자로 보기」로";
/** 첨부 총합 상한(서버 BULK_EMAIL_ATTACH_TOTAL_MAX_BYTES 와 같은 값). */
export const ATTACH_TOTAL_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACH_TOO_LARGE_NOTICE = "첨부는 모두 합쳐 10MB까지예요 — 파일을 빼거나 줄여 주세요";
export const ATTACH_DROP_NOTE = "파일은 안전한 보관함 링크로 메일에 들어가요 · 총 10MB까지";
export const ATTACH_FILE_NOTE = "보관함 링크 (14일 동안 열 수 있고, 잘못 보냈으면 끊을 수 있어요)";

/** 제목에 쓰면 안 되는 표현. 시안의 사전 그대로. */
const SUBJECT_BANNED = /무료|긴급|지금 바로|마감 임박|!!|^re:|^fwd:/i;
/** 그림문자(이모지) — 사실 통지형 제목에는 쓰지 않는다. */
const SUBJECT_EMOJI = /[\u{1F300}-\u{1FAFF}]/u;

/**
 * 받은편지함 카드 밑에 뜨는 노란 줄. **막지는 않는다** — 알려만 주고 판단은 담당자가.
 * ★길이는 `{회사명}` 을 뺀 글자로 센다 — 그 변수는 수신자 이름으로 바뀌므로 그대로 세면 잔소리가 는다.
 */
export function subjectHints(subject: string, preheader: string): string[] {
  const hints: string[] = [];
  const len = [...subject.replaceAll("{회사명}", "")].length;
  if (len > SUBJECT_SOFT_MAX) {
    hints.push(`제목이 ${len}자예요 — 휴대폰에서 25자 넘으면 잘려요. ${SUBJECT_SOFT_MAX}자 안이 좋아요`);
  }
  if (SUBJECT_BANNED.test(subject) || SUBJECT_EMOJI.test(subject)) {
    hints.push("금지 표현·이모지가 있어요(무료·긴급·지금 바로·마감 임박·느낌표 연속)");
  }
  if (!preheader.trim()) hints.push("미리보기 문구가 비었어요 — 본문 첫 줄이 그대로 보여요");
  return hints;
}

/**
 * 8구획을 한 덩어리 글로 — 「확인 필요」 표식을 한 번에 세거나 글자를 훑을 때 쓴다.
 * ★제목·미리보기 문구는 넣지 않는다 — 받은편지함 카드가 따로 들고 고치기 때문에
 *  여기에도 넣으면 같은 표식이 두 번 세어진다.
 */
export function bodyToText(body: BulkEmailBody): string {
  const lines: string[] = [];
  const push = (s: string) => { if (s.trim()) lines.push(s); };
  push(body.greeting);
  push(body.conclusion);
  push(body.conclusion_sub);
  for (const f of body.facts) {
    const row = [f.label, f.value].filter((s) => s.trim()).join(": ");
    push(row);
  }
  for (const s of body.sections) {
    push(s.title);
    for (const b of s.bullets) push(b.trim() ? `- ${b}` : "");
  }
  push(body.action.what);
  push(body.action.when);
  push(body.action.how);
  push(body.action.button_label);
  push(body.closing);
  return lines.join("\n");
}

const FACT_PATH = /^facts\[(\d+)\]\.(label|value)$/;
const SECTION_TITLE_PATH = /^sections\[(\d+)\]\.title$/;
const SECTION_BULLET_PATH = /^sections\[(\d+)\]\.bullets\[(\d+)\]$/;
const ACTION_PATH = /^action\.(what|when|how|button_label)$/;

/**
 * 「본문 고치기」 패널이 구획 하나를 되쓴다.
 * ★모르는 경로·범위 밖 번호는 **본문을 그대로** 돌려준다 — 던지면 화면이 통째로 죽는다.
 */
export function applyInlineEdit(body: BulkEmailBody, path: string, value: string): BulkEmailBody {
  if (path === "conclusion") return { ...body, conclusion: value };
  if (path === "conclusion_sub") return { ...body, conclusion_sub: value };
  if (path === "closing") return { ...body, closing: value };

  const act = ACTION_PATH.exec(path);
  if (act) {
    const action = { ...body.action };
    if (act[1] === "what") action.what = value;
    else if (act[1] === "when") action.when = value;
    else if (act[1] === "how") action.how = value;
    else action.button_label = value;
    return { ...body, action };
  }

  const fact = FACT_PATH.exec(path);
  if (fact) {
    const i = Number(fact[1]);
    if (!body.facts[i]) return body;
    const facts = body.facts.map((f, k) =>
      k !== i ? f : fact[2] === "label" ? { ...f, label: value } : { ...f, value },
    );
    return { ...body, facts };
  }

  const title = SECTION_TITLE_PATH.exec(path);
  if (title) {
    const i = Number(title[1]);
    if (!body.sections[i]) return body;
    return { ...body, sections: body.sections.map((s, k) => (k === i ? { ...s, title: value } : s)) };
  }

  const bullet = SECTION_BULLET_PATH.exec(path);
  if (bullet) {
    const i = Number(bullet[1]);
    const j = Number(bullet[2]);
    if (!body.sections[i] || body.sections[i].bullets[j] === undefined) return body;
    return {
      ...body,
      sections: body.sections.map((s, k) =>
        k !== i ? s : { ...s, bullets: s.bullets.map((b, m) => (m === j ? value : b)) },
      ),
    };
  }

  return body;
}

/**
 * 채운 값(`[확인 필요: …]` → 담당자가 적은 글)을 **모든 구획에** 반영한다.
 * 미리보기·시험 발송·실제 발송에 나가는 본문은 전부 이걸 거친 것이어야 한다 —
 * 표식이 남은 채 나가면 고객이 「[확인 필요: 요일]」을 그대로 받는다.
 */
export function applyFillsToBody(body: BulkEmailBody, fills: Record<string, string>): BulkEmailBody {
  const f = (s: string) => applyFillValues(s, fills);
  return {
    ...body,
    subject: f(body.subject),
    preheader: f(body.preheader),
    greeting: f(body.greeting),
    conclusion: f(body.conclusion),
    conclusion_sub: f(body.conclusion_sub),
    facts: body.facts.map((x) => ({ label: f(x.label), value: f(x.value) })),
    sections: body.sections.map((x) => ({ title: f(x.title), bullets: x.bullets.map((b) => f(b)) })),
    action: {
      what: f(body.action.what),
      when: f(body.action.when),
      how: f(body.action.how),
      button_label: f(body.action.button_label),
    },
    closing: f(body.closing),
  };
}

export interface EmailReadyState {
  subject: string;
  adSentences: string[];
  factLock: EmailFactLock | null;
  /** `uniqueNeedsFill(제목 + 미리보기 문구 + bodyToText(body))` 로 뽑은 표식들. */
  fillMarkers: string[];
  fillValues: Record<string, string>;
}

/**
 * 이메일 쪽 「발송 확인으로」가 열리는 조건 — 광고 문장 0 · 사실 잠금 통과 · 채울 칸 0 · 제목 있음.
 * ★`allFillsComplete` 를 쓰지 않는다 — 그 함수는 표식이 **없을 때 false**(폼을 쓴 적 없음)라서,
 *  채울 것이 아예 없는 안내문이 영영 다음 단계로 못 간다.
 */
export function emailReady(s: EmailReadyState): boolean {
  if (!s.subject.trim()) return false;
  if (s.adSentences.length > 0) return false;
  if (!s.factLock || !s.factLock.ok) return false;
  return s.fillMarkers.every((m) => (s.fillValues[m] ?? "").trim().length > 0);
}

/** 첨부 총합이 상한 안인가. 올리기 **전에** 파일 크기로 먼저 재고, 올린 뒤에도 다시 잰다. */
export function attachmentTotalOk(files: Array<{ bytes: number }>): boolean {
  const total = files.reduce((n, f) => n + (Number.isFinite(f.bytes) ? Math.max(0, f.bytes) : 0), 0);
  return total <= ATTACH_TOTAL_MAX_BYTES;
}

/** 파일 크기 읽어 주기 — 248KB · 1.5MB. */
export function fileSizeLabel(bytes: number): string {
  const b = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 사실 잠금 상자에 그릴 것.
 * ★시안의 초록 상자는 「원문의 값 5개가 그대로 있어요 — 9월 12일 · 2차 지급 · …」처럼 **남은 값 목록**을
 *  보여 주지만, 서버 `verifyFactLock` 은 `missing`·`added`·`ok` 셋만 준다(계획서 A Task 4).
 *  없는 자료를 지어내지 않고, 통과했다는 사실만 적는다.
 */
export function factLockNotice(
  lock: EmailFactLock | null,
): { tone: "success" | "error"; title: string; detail: string } | null {
  if (!lock) return null;
  if (lock.ok) {
    return {
      tone: "success",
      title: "원문의 숫자·서류 이름이 정리본에 그대로 있어요",
      detail: "AI가 지어낸 값은 없어요.",
    };
  }
  const parts: string[] = [];
  if (lock.missing.length) parts.push(`빠진 값: ${lock.missing.join(" · ")}`);
  if (lock.added.length) parts.push(`원문에 없는 값: ${lock.added.join(" · ")}`);
  const head = parts.length ? `${parts.join(" / ")} — ` : "";
  return {
    tone: "error",
    title: "정리본이 원문과 달라요 — 발송이 잠겼어요",
    detail: `${head}원문에 있는 값은 정리본에도 글자 그대로 있어야 해요. 「다시 정리」를 누르거나 「본문 고치기」에서 직접 넣어 주세요.`,
  };
}
