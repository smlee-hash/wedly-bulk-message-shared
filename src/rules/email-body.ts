// 이메일 8구획 본문 타입 — ERP `src/lib/ai/prompts/bulk-email.ts` 의 BulkEmailBody 와 **같은 모양**이다.
// 화면(이 꾸러미)이 이 모양 그대로 받아 그리고, 고친 뒤 그대로 되돌려 보낸다.
// ★두 곳이 어긋나면 발송 몸통이 서버 검문에 걸린다 — 칸을 더하거나 이름을 바꿀 때 둘 다 고친다.

export interface BulkEmailFact {
  label: string;
  value: string;
}

export interface BulkEmailSection {
  title: string;
  bullets: string[];
}

export interface BulkEmailAction {
  what: string;
  when: string;
  how: string;
  /** 버튼 글자. 첨부·링크가 없으면 빈 문자열. */
  button_label: string;
}

/** AI 가 채워 오는 8구획 + 판정 두 칸. HTML 은 AI 가 쓰지 않는다 — 서식은 서버가 그린다. */
export interface BulkEmailBody {
  subject: string;
  preheader: string;
  greeting: string;
  conclusion: string;
  conclusion_sub: string;
  facts: BulkEmailFact[];
  sections: BulkEmailSection[];
  action: BulkEmailAction;
  closing: string;
  /** 원문에서 영리목적 광고성으로 읽히는 문장. 하나라도 있으면 발송이 잠긴다. */
  ad_sentences: string[];
  /** 원문에 없어 `[확인 필요: …]` 로 남긴 항목. */
  needs_fill: string[];
}

/**
 * 사실 잠금 결과 — 서버 `fact-lock.ts` 의 `verifyFactLock` 반환값과 같은 모양.
 * ★`missing`·`added`·`ok` 셋뿐이다. 「그대로 남은 값 목록」은 서버가 주지 않는다.
 */
export interface EmailFactLock {
  /** 원문에 있는데 정리본에서 빠진 값. */
  missing: string[];
  /** 원문에 없는데 정리본이 새로 만든 값. */
  added: string[];
  ok: boolean;
}

/** 첨부 한 건 — `/api/upload` 응답(id·fileName·size)을 화면이 담아 두는 모양. */
export interface EmailAttachment {
  uploadId: string;
  fileName: string;
  bytes: number;
}

/** 변환 통로(`POST /api/bulk-message/convert-email`)가 돌려주는 자료. */
export interface ConvertEmailData {
  body: BulkEmailBody;
  warnings: string[];
  adSentences: string[];
  factLock: EmailFactLock;
}

/** 빈 본문 — 시험·초기값용. 매번 새 객체를 만든다(공유 객체를 고치는 사고를 막는다). */
export function emptyEmailBody(): BulkEmailBody {
  return {
    subject: "",
    preheader: "",
    greeting: "",
    conclusion: "",
    conclusion_sub: "",
    facts: [],
    sections: [],
    action: { what: "", when: "", how: "", button_label: "" },
    closing: "",
    ad_sentences: [],
    needs_fill: [],
  };
}
