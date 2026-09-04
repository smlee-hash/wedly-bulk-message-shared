// 2단계(안내문 만들기) — AI를 안 거치는 순수 판정. 서버 checks.ts 와 같은 표식 규칙을 화면에서 다시 쓴다.

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
