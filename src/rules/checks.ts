// 단체 안내 발송 — AI 를 안 거치는 순수 판정 모음(시험이 쉬운 쪽에 논리를 모은다).

export const MAX_MESSAGE_LEN = 1500;

/** 변환문 안의 [확인 필요...] 표식 — 하나라도 남아 있으면 발송 금지. */
export function findNeedsFill(text: string): string[] {
  return text.match(/\[확인 필요[^\]]*\]/g) ?? [];
}

/** 수신자별 개인화 변수 치환. 값이 없으면 어색하지 않은 일반 표현으로. */
export function substituteVars(
  text: string,
  v: { representative: string; company: string },
): string {
  return text
    .replaceAll("{대표명}", v.representative.trim() || "")
    .replaceAll("{회사명}", v.company.trim() || "귀사")
    .replace(/^\s*대표님/u, "대표님")           // "{대표명} 대표님" 에서 이름이 빈 경우 앞 공백 정리
    .replace(/[ \t]+대표님/g, (m) => (m.trim() === "대표님" ? " 대표님" : m))
    .replace(/^ /gm, "");
}

export interface ConvertResult { text: string; adWords: string[] }

/**
 * 광고·판촉으로 읽힐 수 있는 낱말. 변환문에서 사전 매칭한다(AI 가 안 알려 준다).
 * ★완벽한 판정은 불가능하다 — 「광고로 읽힐 수 있는 낱말」 수준의 걸러내기다(2026-09-02 리뷰 반영).
 */
export const AD_WORDS = [
  "마감임박",
  "프로모션",
  "선착순",
  "사은품",
  "최저가",
  "캐시백",
  "이벤트",
  "할인",
  "특가",
  "무료",
  "혜택",
  "경품",
  "쿠폰",
  "세일",
  "증정",
  "공짜",
  "반값",
  "파격",
  "한정",
  "오늘만",
  "추첨",
  "당첨",
  "적립",
  "지금 신청하면",
  "하나 더 드려요",
] as const;

/**
 * 사전 낱말이지만 광고가 아닌 합성어 — 이 자리에서 나온 사전 낱말은 세지 않는다.
 * 예) "세일즈팀"의 "세일"이 광고 낱말 「세일」로 오탐되는 것을 막는다.
 */
const AD_WORD_EXCEPTIONS = ["세일즈"] as const;

/** 숫자·기호와 결합해야만 뜻이 서는 표현 — 사전 낱말로는 못 잡아 정규식으로 따로 잡는다. */
const AD_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // "50% OFF", "30%off" 처럼 숫자+%+OFF
  { label: "OFF", re: /\d+\s*[%％]\s*off\b/gi },
  // 숫자 없이 "OFF" 단독 표기(전품목 OFF 등) — 영어 낱말 안에 낀 off(예: coffee)는 앞뒤 글자 검사로 막는다
  { label: "OFF", re: /(?<![a-z])off(?![a-z])/gi },
];

/** 예외 낱말이 나온 자리를 같은 길이의 자리표시로 가려 사전 매칭에서 빼돌린다(인덱스는 그대로 유지). */
function maskExceptions(text: string): string {
  let out = text;
  for (const ex of AD_WORD_EXCEPTIONS) {
    out = out.split(ex).join(" ".repeat(ex.length));
  }
  return out;
}

/** 나온 순서대로, 같은 낱말은 한 번만. 붙여 쓴 낱말도 각각 잡는다. */
export function detectAdWords(text: string): string[] {
  if (!text) return [];
  const masked = maskExceptions(text);
  const hits: Array<{ word: string; index: number }> = [];
  for (const word of AD_WORDS) {
    let from = 0;
    while (from < masked.length) {
      const i = masked.indexOf(word, from);
      if (i < 0) break;
      hits.push({ word, index: i });
      from = i + 1;
    }
  }
  for (const { label, re } of AD_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ word: label, index: m.index });
      if (m[0].length === 0) re.lastIndex += 1; // 빈 매치 무한루프 방지
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    if (seen.has(h.word)) continue;
    seen.add(h.word);
    out.push(h.word);
  }
  return out;
}

/** 모델 JSON 응답 파싱 — 코드펜스 허용, text 필수, 길이 상한. */
export function parseConvertResponse(raw: string): ConvertResult | null {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const p = JSON.parse(stripped) as Record<string, unknown>;
    const text = typeof p.text === "string" ? p.text.trim() : "";
    if (!text || text.length > MAX_MESSAGE_LEN) return null;
    const adWords = Array.isArray(p.adWords) ? p.adWords.filter((w): w is string => typeof w === "string") : [];
    return { text, adWords };
  } catch {
    return null;
  }
}
