import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { emptyEmailBody, type BulkEmailBody } from "../../rules/email-body";
import { Step2Email, type Step2EmailProps } from "./Step2Email";

// 2단계 이메일 판을 **실제로 그려서** 잰다 — 시안(2026-09-04-email-send-preview.html §2단계)의
// 자리·문구가 살아 있는지 소스 글자 검사보다 강하게 확인한다.

const body: BulkEmailBody = {
  ...emptyEmailBody(),
  subject: "장려금 2차 서류 제출 안내",
  preheader: "4대보험 완납증명서·8월 임금대장 2종",
  greeting: "안녕하세요, {대표명} 대표님. 위들리 {담당 컨설턴트}입니다.",
  conclusion: "9월 12일까지 서류 2종을 보내 주세요.",
  conclusion_sub: "기한이 지나면 다음 분기로 밀려요.",
  facts: [{ label: "제출 기한", value: "9월 12일" }],
  sections: [{ title: "제출 서류 2종", bullets: ["4대보험 완납증명서"] }],
  action: { what: "서류 회신", when: "9월 12일까지", how: "이 메일에 답장", button_label: "양식 내려받기" },
  closing: "궁금한 점은 답장해 주세요.",
};

function props(over: Partial<Step2EmailProps> = {}): Step2EmailProps {
  return {
    originalRef: createRef<HTMLTextAreaElement>(),
    originalText: "안녕하세요 위들리입니다. 서류를 9월 12일까지 보내주셔야 합니다",
    setOriginalText: () => {},
    insertToken: () => {},
    myName: "김민수",
    emailBody: body,
    emailSubject: body.subject,
    setEmailSubject: () => {},
    emailPreheader: body.preheader,
    setEmailPreheader: () => {},
    emailWarnings: [],
    adSentences: [],
    factLock: { missing: [], added: [], ok: true },
    emailFilled: {},
    setEmailFilled: () => {},
    emailFillMarkers: [],
    emailConverting: false,
    emailError: "",
    convertEmail: async () => {},
    editEmailBody: () => {},
    emailAttachments: [],
    addAttachments: async () => {},
    removeAttachment: () => {},
    attachError: "",
    attachUploading: false,
    previewHtml: "<html><body>메일</body></html>",
    previewLoading: false,
    previewError: "",
    previewDevice: "desktop",
    setPreviewDevice: () => {},
    previewReal: false,
    setPreviewReal: () => {},
    previewRecipient: null,
    emailPreviewTargetCount: 3,
    nextPreviewRecipient: () => {},
    testSendEmail: () => {},
    emailTestSending: false,
    emailTestDone: "",
    emailTestError: "",
    showFooter: true,
    channelBoth: false,
    goStep: () => {},
    canGo: () => true,
    step2Hint: "",
    ...over,
  };
}

const html = (over: Partial<Step2EmailProps> = {}) => renderToStaticMarkup(<Step2Email {...props(over)} />);

describe("2단계 이메일 — 시안의 자리가 다 있다", () => {
  const markup = html();

  it("구역 머리와 원문 칸", () => {
    expect(markup).toContain("안내문 만들기 — 이메일");
    expect(markup).toContain("보내고 싶은 내용 (원문)");
    expect(markup).toContain('aria-label="보내고 싶은 내용 원문"');
  });

  it("변수 칩이 셋이다 — 담당 컨설턴트까지(채팅은 둘)", () => {
    for (const chip of ["{대표명}", "{회사명}", "{담당 컨설턴트}"]) {
      expect(markup, `변수 칩 ${chip}`).toContain(`${chip} 넣기`);
    }
  });

  it("받은편지함 카드 — 발신자·[WEDLY] 칩·제목·미리보기 문구를 눌러 고친다", () => {
    expect(markup).toContain("받은편지함에서 이렇게 보여요");
    expect(markup).toContain("WEDLY 김민수");
    expect(markup).toContain("consulting@wedly.kr");
    expect(markup).toContain("[WEDLY]");
    expect(markup).toContain('aria-label="메일 제목"');
    expect(markup).toContain('aria-label="받은편지함 미리보기 문구"');
    // 눌러서 고치는 칸 둘 다 — React 가 내는 글자 그대로(HTML 속성 이름은 대소문자를 안 가린다)
    expect((markup.match(/contentEditable="true"/gi) ?? []).length).toBe(2);
  });

  it("서식 미리보기 — 컴퓨터/휴대폰·실제 수신자로 보기·서버 HTML iframe", () => {
    expect(markup).toContain("위들리 서식 미리보기");
    expect(markup).toContain("컴퓨터");
    expect(markup).toContain("휴대폰");
    expect(markup).toContain("실제 수신자로 보기");
    expect(markup).toContain('title="위들리 서식 미리보기"');
    // 서식은 서버가 그린다 — 화면이 메일 HTML 을 따로 만들지 않는다
    expect(markup).toMatch(/srcdoc=/i);
  });

  it("첨부는 보관함 링크 고정 · 총 10MB", () => {
    expect(markup).toContain("첨부파일");
    expect(markup).toContain("파일을 여기에 끌어다 놓거나");
    expect(markup).toContain("눌러서 고르기");
    expect(markup).toContain("파일은 안전한 보관함 링크로 메일에 들어가요 · 총 10MB까지");
    // 「메일에 직접 붙이기」 스위치는 만들지 않는다(설계서 §4-6)
    expect(markup).not.toContain("직접 붙이기");
  });

  it("다시 정리 · 내 메일로 시험 발송 · 고정 안내", () => {
    expect(markup).toContain("다시 정리");
    expect(markup).toContain("내 메일로 시험 발송");
    expect(markup).toContain("시험 발송에는 개인화 값이 들어가지 않아요");
  });

  it("본문 고치기 패널이 미리보기 아래에 있다 — iframe 안을 직접 고치게 하지 않는다", () => {
    const preview = markup.indexOf('title="위들리 서식 미리보기"');
    const panel = markup.indexOf("<details");
    expect(preview).toBeGreaterThan(0);
    expect(panel).toBeGreaterThan(preview);
    expect(markup).toContain("본문 고치기");
    expect(markup).toContain("한 줄 결론");
    expect(markup).toContain("맺음말");
  });

  it("2단계에서 고를 것은 없다 — 정보성/광고성 라디오·제목 후보를 그리지 않는다", () => {
    expect(markup).not.toContain("광고성");
    expect(markup).not.toContain("제목 후보");
    expect(markup).not.toContain("<input type=\"radio\"");
  });
});

describe("2단계 이메일 — 잠금 상자", () => {
  it("광고로 읽히는 문장은 그대로 인용해 보여 준다", () => {
    const markup = html({ adSentences: ["신규 상품도 특별 혜택으로 추천드립니다."] });
    expect(markup).toContain("광고로 읽히는 문장이 있어 보낼 수 없어요");
    expect(markup).toContain("「신규 상품도 특별 혜택으로 추천드립니다.」");
  });

  it("사실 잠금이 통과면 초록, 어긋나면 빠진 값을 적는다", () => {
    expect(html()).toContain("원문의 숫자·서류 이름이 정리본에 그대로 있어요");
    const broken = html({ factLock: { missing: ["1인당 월 60만원"], added: [], ok: false } });
    expect(broken).toContain("정리본이 원문과 달라요 — 발송이 잠겼어요");
    expect(broken).toContain("1인당 월 60만원");
  });

  it("[확인 필요] 가 있으면 채우기 칸이 늘 보인다", () => {
    const markup = html({ emailFillMarkers: ["[확인 필요: 요일]"] });
    expect(markup).toContain("채워야 할 내용");
    expect(markup).toContain("요일");
  });

  it("제목 규칙 위반은 노란 줄로만 알린다(막지 않는다)", () => {
    const markup = html({ emailSubject: "무료 상담 안내", emailPreheader: "" });
    expect(markup).toContain("금지 표현·이모지가 있어요");
    expect(markup).toContain("미리보기 문구가 비었어요");
  });

  it("변환·미리보기 실패는 상자 한 줄로 — 브라우저 alert 을 쓰지 않는다", () => {
    expect(html({ emailError: "잠시 후 다시 시도해 주세요." })).toContain("이메일 안내문을 만들지 못했어요");
    expect(html({ previewError: "통신에 실패했어요." })).toContain("미리보기를 불러오지 못했어요");
    expect(html({ attachError: "첨부는 모두 합쳐 10MB까지예요 — 파일을 빼거나 줄여 주세요" })).toContain(
      "첨부는 모두 합쳐 10MB까지예요",
    );
  });
});

describe("2단계 이메일 — 통로별 자리", () => {
  it("「이메일」이면 이 판이 아래 단추 줄을 그린다", () => {
    const markup = html({ showFooter: true });
    expect(markup).toContain("발송 확인으로");
    expect(markup).toContain("이전 단계");
  });

  it("「둘 다」면 단추 줄은 아래 채팅 판이 맡고, 여기엔 안내만 붙는다", () => {
    const markup = html({ showFooter: false, channelBoth: true });
    expect(markup).not.toContain("발송 확인으로");
    expect(markup).toContain("카카오 채팅용 안내문도 아래에 따로 만들어져요");
  });

  it("첨부 줄은 파일 이름·크기·보관함 안내와 「빼기」를 함께 보인다", () => {
    const markup = html({
      emailAttachments: [{ uploadId: "u1", fileName: "임금대장_양식.xlsx", bytes: 248 * 1024 }],
    });
    expect(markup).toContain("임금대장_양식.xlsx");
    expect(markup).toContain("XLSX");
    expect(markup).toContain("248KB");
    expect(markup).toContain("14일 동안 열 수 있고");
    expect(markup).toContain("빼기");
  });
});
