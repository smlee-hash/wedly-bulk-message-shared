import { describe, expect, it } from "vitest";
import { emptyEmailBody, type BulkEmailBody } from "../rules/email-body";
import {
  ATTACH_TOO_LARGE_NOTICE,
  ATTACH_TOTAL_MAX_BYTES,
  CONVERT_DEBOUNCE_MS,
  CONVERT_INCOMPLETE_MESSAGE,
  EMAIL_FROM_ADDRESS,
  EMAIL_STEP2_NOTE,
  EMAIL_SUBJECT_CHIP,
  EMAIL_TEST_SEND_NOTE,
  FILL_MAX_LEN,
  MAX_COMPOSED_LEN,
  MIN_ORIGINAL_LEN,
  PREVIEW_DEBOUNCE_MS,
  PREVIEW_EXAMPLE,
  allFillsComplete,
  applyFillValues,
  applyFillsToBody,
  applyInlineEdit,
  applyPreviewExamples,
  attachmentTotalOk,
  bodyToText,
  clampFillValue,
  emailReady,
  factLockNotice,
  fileSizeLabel,
  subjectHints,
  composedLengthNotice,
  composedTooLong,
  conversionReady,
  convertApiErrorMessage,
  insertAtCursor,
  isAbortError,
  needsFillLabel,
  originalTooShort,
  showFillForm,
  readPlainTextStream,
  shouldAutoConvert,
  step2FooterHint,
  TEST_SEND_WAIT_HINT,
  testSendAllowed,
  uniqueNeedsFill,
} from "./step2-helpers";

describe("constants", () => {
  it("디바운스는 0.7초(2026-09-02 상향), 원문 하한은 10자", () => {
    expect(CONVERT_DEBOUNCE_MS).toBe(700);
    expect(MIN_ORIGINAL_LEN).toBe(10);
  });

  it("잘림·거절 안내 문구가 고정이다", () => {
    expect(CONVERT_INCOMPLETE_MESSAGE).toBe("안내문을 다 만들지 못했어요. 원문을 조금 줄이거나 다시 시도해 주세요.");
  });
});

describe("uniqueNeedsFill", () => {
  it("표식이 없으면 빈 배열", () => {
    expect(uniqueNeedsFill("표식 없음")).toEqual([]);
  });

  it("나온 순서대로 모으고 같은 글은 한 번만", () => {
    expect(
      uniqueNeedsFill("기한은 [확인 필요: 요일]까지, 또 [확인 필요: 요일], 금액 [확인 필요: 계약금]"),
    ).toEqual(["[확인 필요: 요일]", "[확인 필요: 계약금]"]);
  });

  it("칸 이름 없는 표식도 모은다", () => {
    expect(uniqueNeedsFill("날짜 [확인 필요] 확인")).toEqual(["[확인 필요]"]);
  });
});

describe("needsFillLabel", () => {
  it("표식 안의 칸 이름을 꺼낸다", () => {
    expect(needsFillLabel("[확인 필요: 요일]")).toBe("요일");
    expect(needsFillLabel("[확인 필요:계약금]")).toBe("계약금");
  });

  it("칸 이름이 없으면 기본 안내", () => {
    expect(needsFillLabel("[확인 필요]")).toBe("확인할 내용");
  });
});

describe("applyFillValues", () => {
  it("같은 표식은 한 값으로 모두 바꾼다", () => {
    expect(
      applyFillValues("A [확인 필요: 요일] / B [확인 필요: 요일]", {
        "[확인 필요: 요일]": "금요일",
      }),
    ).toBe("A 금요일 / B 금요일");
  });

  it("빈 값·공백만 있는 값은 표식을 그대로 둔다", () => {
    const text = "기한 [확인 필요: 요일]";
    expect(applyFillValues(text, { "[확인 필요: 요일]": "" })).toBe(text);
    expect(applyFillValues(text, { "[확인 필요: 요일]": "   " })).toBe(text);
  });

  it("표식마다 다른 값으로 바꾼다", () => {
    expect(
      applyFillValues("기한 [확인 필요: 요일], 금액 [확인 필요: 계약금]", {
        "[확인 필요: 요일]": "금요일",
        "[확인 필요: 계약금]": "30만 원",
      }),
    ).toBe("기한 금요일, 금액 30만 원");
  });
});

describe("applyPreviewExamples", () => {
  it("미리보기용 예시 이름·회사명으로 바꾼다", () => {
    expect(applyPreviewExamples("{대표명} 대표님, {회사명} 안내입니다")).toBe(
      `${PREVIEW_EXAMPLE.representative} 대표님, ${PREVIEW_EXAMPLE.company} 안내입니다`,
    );
    expect(PREVIEW_EXAMPLE).toEqual({ representative: "김영섭", company: "한빛물류" });
  });

  it("변수 없는 글은 그대로", () => {
    expect(applyPreviewExamples("안녕하세요")).toBe("안녕하세요");
  });

  it("이름 치환은 '김영섭'만 — '대표님'을 붙이면 본문의 대표님이 겹친다", () => {
    expect(applyPreviewExamples("{대표명} 대표님")).toBe("김영섭 대표님");
  });
});

describe("insertAtCursor", () => {
  it("커서 위치에 넣고 커서를 삽입 뒤로 옮긴다", () => {
    expect(insertAtCursor("안녕 하세요", "{대표명}", 2, 2)).toEqual({
      next: "안녕{대표명} 하세요",
      cursor: 7,
    });
  });

  it("선택 구간을 덮어쓴다", () => {
    expect(insertAtCursor("안녕ABC하세요", "{회사명}", 2, 5)).toEqual({
      next: "안녕{회사명}하세요",
      cursor: 7,
    });
  });

  it("범위를 글 길이 안으로 맞춘다", () => {
    expect(insertAtCursor("ab", "X", -1, 99)).toEqual({ next: "X", cursor: 1 });
  });
});

describe("shouldAutoConvert / originalTooShort", () => {
  it("10자 미만이면 변환하지 않고 짧은 안내 대상이다", () => {
    expect(shouldAutoConvert("짧음", "")).toBe(false);
    expect(originalTooShort("짧음")).toBe(true);
    expect(originalTooShort("")).toBe(false);
    expect(originalTooShort("   ")).toBe(false);
  });

  it("10자 이상이고 마지막 변환 원문과 다르면 변환한다", () => {
    const text = "안녕하세요, 위들리입니다";
    expect(text.trim().length).toBeGreaterThanOrEqual(MIN_ORIGINAL_LEN);
    expect(shouldAutoConvert(text, "")).toBe(true);
    expect(shouldAutoConvert(`  ${text}  `, text)).toBe(false);
    expect(originalTooShort(text)).toBe(false);
  });
});

describe("conversionReady", () => {
  const ready = {
    finalText: "다듬은 안내문입니다",
    originalText: "안녕하세요, 위들리입니다",
    lastConvertedOriginal: "안녕하세요, 위들리입니다",
  };

  it("변환문이 있고 원문이 마지막 변환과 같으면 다음 단계 가능", () => {
    expect(conversionReady(ready)).toBe(true);
    expect(conversionReady({ ...ready, originalText: `  ${ready.originalText}  ` })).toBe(true);
  });

  it("변환문이 비었거나 원문이 달라졌거나 변환 중이면 막는다", () => {
    expect(conversionReady({ ...ready, finalText: "  " })).toBe(false);
    expect(conversionReady({ ...ready, originalText: "안녕하세요, 위들리입니다 수정" })).toBe(false);
    expect(conversionReady({ ...ready, lastConvertedOriginal: "" })).toBe(false);
    expect(conversionReady({ ...ready, converting: true })).toBe(false);
  });
});

describe("allFillsComplete", () => {
  it("표식이 없으면 채우기 완료가 아니다 (폼을 쓴 적이 없음)", () => {
    expect(allFillsComplete([], {})).toBe(false);
  });

  it("모든 표식에 값이 있어야 완료", () => {
    const marks = ["[확인 필요: 요일]", "[확인 필요: 계약금]"];
    expect(allFillsComplete(marks, { "[확인 필요: 요일]": "금" })).toBe(false);
    expect(
      allFillsComplete(marks, {
        "[확인 필요: 요일]": "금요일",
        "[확인 필요: 계약금]": "30만 원",
      }),
    ).toBe(true);
    expect(
      allFillsComplete(marks, {
        "[확인 필요: 요일]": "금요일",
        "[확인 필요: 계약금]": "  ",
      }),
    ).toBe(false);
  });
});

describe("composedTooLong / composedLengthNotice", () => {
  it("1,500자까지는 통과, 넘으면 막는다", () => {
    expect(MAX_COMPOSED_LEN).toBe(1500);
    expect(composedTooLong("a".repeat(1500))).toBe(false);
    expect(composedTooLong("a".repeat(1501))).toBe(true);
  });

  it("안내 문구에 현재 글자 수를 넣는다", () => {
    expect(composedLengthNotice(1600)).toBe("안내문이 너무 길어요 (1,600/1,500자)");
  });
});

describe("clampFillValue", () => {
  it("채우기 칸은 200자로 자른다", () => {
    expect(FILL_MAX_LEN).toBe(200);
    expect(clampFillValue("짧음")).toBe("짧음");
    expect(clampFillValue("가".repeat(201))).toBe("가".repeat(200));
  });
});

describe("isAbortError", () => {
  it("취소된 요청만 알아본다", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("변환 실패"))).toBe(false);
    expect(isAbortError("변환 실패")).toBe(false);
  });
});

describe("copy", () => {
  it("시험 발송 대기 문구가 고정이다", () => {
    expect(TEST_SEND_WAIT_HINT).toBe("변환이 끝난 뒤 눌러 주세요");
  });
});

describe("step2FooterHint", () => {
  const base = {
    tooLong: false,
    composedLength: 80,
    conversionReady: true,
    remainingFillCount: 0,
  };

  it("1,500자를 넘으면 다른 안내보다 길이 안내가 앞선다", () => {
    expect(step2FooterHint({
      ...base,
      tooLong: true,
      composedLength: 1600,
      conversionReady: false,
      remainingFillCount: 2,
    })).toBe("안내문이 너무 길어요 (1,600/1,500자)");
  });

  it("변환이 안 끝났으면 변환 안내", () => {
    expect(step2FooterHint({ ...base, conversionReady: false })).toBe("먼저 안내문 변환이 끝나야 해요");
  });

  it("확인할 칸이 남으면 채우기 안내", () => {
    expect(step2FooterHint({ ...base, remainingFillCount: 1 })).toBe("확인할 내용을 모두 채워 주세요");
  });

  it("막힐 이유가 없으면 빈 글자", () => {
    expect(step2FooterHint(base)).toBe("");
  });
});

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
      else controller.close();
    },
  });
}

describe("readPlainTextStream", () => {
  it("조각이 올 때마다 지금까지 모은 글을 넘기고 전체를 돌려준다", async () => {
    const seen: string[] = [];
    const text = await readPlainTextStream(streamOf(["안녕", "하세요"]), (acc) => seen.push(acc));
    expect(seen).toEqual(["안녕", "안녕하세요"]);
    expect(text).toBe("안녕하세요");
  });

  it("빈 스트림은 빈 글", async () => {
    expect(await readPlainTextStream(streamOf([]), () => {})).toBe("");
  });

  it("이미 취소된 신호면 AbortError", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(readPlainTextStream(streamOf(["본문"]), () => {}, ac.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("convertApiErrorMessage", () => {
  it("JSON 오류의 error 문자열을 꺼낸다", () => {
    expect(convertApiErrorMessage({ success: false, error: "로그인이 필요합니다." }))
      .toBe("로그인이 필요합니다.");
  });

  it("error.message 형태도 받는다", () => {
    expect(convertApiErrorMessage({ success: false, error: { code: "X", message: "원문은 1~4,000자여야 합니다." } }))
      .toBe("원문은 1~4,000자여야 합니다.");
  });

  it("형식을 모르면 기본 안내", () => {
    expect(convertApiErrorMessage(null)).toBe("변환에 실패했어요.");
    expect(convertApiErrorMessage({ success: false })).toBe("변환에 실패했어요.");
  });
});

describe("testSendAllowed", () => {
  it("마지막 변환 원문과 지금 원문이 같아야 시험 발송", () => {
    expect(testSendAllowed({
      originalText: "안녕하세요, 위들리입니다",
      lastConvertedOriginal: "안녕하세요, 위들리입니다",
    })).toBe(true);
  });

  it("원문을 고친 직후(변환 전)나 변환 중이면 막는다", () => {
    expect(testSendAllowed({
      originalText: "안녕하세요, 위들리입니다 수정",
      lastConvertedOriginal: "안녕하세요, 위들리입니다",
    })).toBe(false);
    expect(testSendAllowed({
      originalText: "안녕하세요, 위들리입니다",
      lastConvertedOriginal: "안녕하세요, 위들리입니다",
      converting: true,
    })).toBe(false);
    expect(testSendAllowed({
      originalText: "",
      lastConvertedOriginal: "",
    })).toBe(false);
  });
});

describe("채우기 입력칸 — 첫 글자를 치는 순간 사라지지 않는다", () => {
  const markers = ["{{제출 기한}}", "{{담당자}}"];

  it("칸마다 한 글자만 있어도 allFillsComplete 는 「다 채웠다」로 본다", () => {
    // 이 헐거운 판정 자체는 그대로 둔다 — 다음 단계 이동 조건이 이미 이 셈에 기대고 있다.
    expect(allFillsComplete(markers, { "{{제출 기한}}": "9", "{{담당자}}": "김" })).toBe(true);
  });

  it("그래서 입력칸 노출은 「다 채웠나」와 무관하다 — 한 글자여도 계속 보인다", () => {
    // 「이번 달 말까지」의 첫 글자 9 를 친 순간. 예전엔 여기서 입력칸이 사라져 더 칠 수 없었다.
    const values = { "{{제출 기한}}": "9", "{{담당자}}": "김" };
    expect(allFillsComplete(markers, values)).toBe(true);
    expect(showFillForm({ conversionReady: true, editing: false, markerCount: markers.length })).toBe(true);
  });

  it("값이 아예 없어도, 다 채웠어도 같은 답이다 — 노출은 값을 보지 않는다", () => {
    const arg = { conversionReady: true, editing: false, markerCount: markers.length };
    expect(showFillForm(arg)).toBe(showFillForm(arg));
    expect(showFillForm(arg)).toBe(true);
  });

  it("변환 전·「직접 고치기」 중·표식 없음일 때만 감춘다", () => {
    expect(showFillForm({ conversionReady: false, editing: false, markerCount: 2 })).toBe(false);
    expect(showFillForm({ conversionReady: true, editing: true, markerCount: 2 })).toBe(false);
    expect(showFillForm({ conversionReady: true, editing: false, markerCount: 0 })).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 2단계 이메일 모드 — 시안(2026-09-04-email-send-preview.html) §2단계와 1:1
// ══════════════════════════════════════════════════════════════

describe("subjectHints — 받은편지함 카드 밑 노란 줄", () => {
  it("22자 안이고 미리보기 문구가 있으면 안내가 없다", () => {
    expect(subjectHints("장려금 2차 서류 제출 안내", "4대보험 완납증명서·8월 임금대장 2종")).toEqual([]);
  });

  it("22자를 넘으면 글자 수를 넣어 알린다", () => {
    const subject = "가".repeat(23);
    expect(subjectHints(subject, "미리보기 문구")).toEqual([
      "제목이 23자예요 — 휴대폰에서 25자 넘으면 잘려요. 22자 안이 좋아요",
    ]);
  });

  it("길이는 {회사명} 변수를 뺀 글자로 센다 — 변수는 수신자 이름으로 바뀐다", () => {
    // 「{회사명}」 6자가 그대로 세어지면 22자 안인 제목까지 길다고 잔소리한다.
    expect(subjectHints("{회사명} 장려금 2차 서류 제출 안내", "미리보기 문구")).toEqual([]);
  });

  it("금지 표현·이모지를 한 줄로 알린다", () => {
    const line = "금지 표현·이모지가 있어요(무료·긴급·지금 바로·마감 임박·느낌표 연속)";
    expect(subjectHints("무료 상담 안내", "문구")).toEqual([line]);
    expect(subjectHints("지금 바로 확인", "문구")).toEqual([line]);
    expect(subjectHints("서류 제출 안내!!", "문구")).toEqual([line]);
    expect(subjectHints("Re: 서류 제출", "문구")).toEqual([line]);
    expect(subjectHints("서류 제출 안내 🎉", "문구")).toEqual([line]);
  });

  it("미리보기 문구가 비면 그것도 알린다", () => {
    expect(subjectHints("서류 제출 안내", "   ")).toEqual([
      "미리보기 문구가 비었어요 — 본문 첫 줄이 그대로 보여요",
    ]);
  });

  it("여러 개면 길이 → 금지 표현 → 미리보기 문구 순서로 쌓인다", () => {
    expect(subjectHints(`무료 ${"가".repeat(20)}`, "")).toHaveLength(3);
  });
});

describe("bodyToText — 8구획을 한 덩어리 글로", () => {
  const body: BulkEmailBody = {
    ...emptyEmailBody(),
    subject: "제목",
    preheader: "미리보기 문구",
    greeting: "안녕하세요, {대표명} 대표님.",
    conclusion: "9월 12일까지 서류 2종을 보내 주세요.",
    conclusion_sub: "기한이 지나면 다음 분기로 밀려요.",
    facts: [{ label: "제출 기한", value: "9월 12일" }],
    sections: [{ title: "제출 서류 2종", bullets: ["4대보험 완납증명서", "임금대장 8월분"] }],
    action: { what: "서류 2종 회신", when: "9월 12일까지", how: "이 메일에 답장", button_label: "양식 내려받기" },
    closing: "궁금한 점은 답장해 주세요.",
  };

  it("인사 → 결론 → 사실 표 → 소제목·불릿 → 다음 행동 → 맺음말 순서로 잇는다", () => {
    expect(bodyToText(body)).toBe(
      [
        "안녕하세요, {대표명} 대표님.",
        "9월 12일까지 서류 2종을 보내 주세요.",
        "기한이 지나면 다음 분기로 밀려요.",
        "제출 기한: 9월 12일",
        "제출 서류 2종",
        "- 4대보험 완납증명서",
        "- 임금대장 8월분",
        "서류 2종 회신",
        "9월 12일까지",
        "이 메일에 답장",
        "양식 내려받기",
        "궁금한 점은 답장해 주세요.",
      ].join("\n"),
    );
  });

  it("제목·미리보기 문구는 넣지 않는다 — 받은편지함 카드가 따로 들고 고친다", () => {
    expect(bodyToText(body)).not.toContain("제목");
    expect(bodyToText(body)).not.toContain("미리보기 문구");
  });

  it("빈 구획은 건너뛴다", () => {
    expect(bodyToText(emptyEmailBody())).toBe("");
  });

  it("본문 어디에 있든 「확인 필요」 표식을 셀 수 있다", () => {
    const withMark: BulkEmailBody = {
      ...emptyEmailBody(),
      conclusion: "9월 12일[확인 필요: 요일]까지",
      sections: [{ title: "제출", bullets: ["금액 [확인 필요: 계약금]"] }],
    };
    expect(uniqueNeedsFill(bodyToText(withMark))).toEqual(["[확인 필요: 요일]", "[확인 필요: 계약금]"]);
  });
});

describe("applyInlineEdit — 「본문 고치기」 패널이 구획을 되쓴다", () => {
  const body: BulkEmailBody = {
    ...emptyEmailBody(),
    conclusion: "옛 결론",
    conclusion_sub: "옛 보조",
    closing: "옛 맺음말",
    facts: [
      { label: "제출 기한", value: "9월 12일" },
      { label: "지급 기준", value: "1인당 월 60만원" },
    ],
    sections: [
      { title: "제출 서류", bullets: ["첫 줄", "둘째 줄"] },
      { title: "보내는 방법", bullets: ["답장"] },
    ],
    action: { what: "무엇", when: "언제", how: "어떻게", button_label: "버튼" },
  };

  it("결론·보조·맺음말을 고친다", () => {
    expect(applyInlineEdit(body, "conclusion", "새 결론").conclusion).toBe("새 결론");
    expect(applyInlineEdit(body, "conclusion_sub", "새 보조").conclusion_sub).toBe("새 보조");
    expect(applyInlineEdit(body, "closing", "새 맺음말").closing).toBe("새 맺음말");
  });

  it("사실 표의 라벨·값을 각각 고친다", () => {
    expect(applyInlineEdit(body, "facts[1].label", "지급액").facts[1].label).toBe("지급액");
    expect(applyInlineEdit(body, "facts[0].value", "9월 15일").facts[0].value).toBe("9월 15일");
    // 옆 줄은 건드리지 않는다
    expect(applyInlineEdit(body, "facts[0].value", "9월 15일").facts[1]).toEqual(body.facts[1]);
  });

  it("소제목과 불릿을 고친다", () => {
    expect(applyInlineEdit(body, "sections[1].title", "회신 방법").sections[1].title).toBe("회신 방법");
    const edited = applyInlineEdit(body, "sections[0].bullets[1]", "고친 줄");
    expect(edited.sections[0].bullets).toEqual(["첫 줄", "고친 줄"]);
    expect(edited.sections[1]).toEqual(body.sections[1]);
  });

  it("다음 행동 네 칸을 고친다", () => {
    expect(applyInlineEdit(body, "action.what", "A").action.what).toBe("A");
    expect(applyInlineEdit(body, "action.when", "B").action.when).toBe("B");
    expect(applyInlineEdit(body, "action.how", "C").action.how).toBe("C");
    expect(applyInlineEdit(body, "action.button_label", "D").action.button_label).toBe("D");
  });

  it("원본을 고치지 않고 새 본문을 만든다", () => {
    const next = applyInlineEdit(body, "conclusion", "새 결론");
    expect(body.conclusion).toBe("옛 결론");
    expect(next).not.toBe(body);
  });

  it("모르는 경로·범위 밖 번호는 본문을 그대로 돌려준다", () => {
    expect(applyInlineEdit(body, "subject", "X")).toBe(body);
    expect(applyInlineEdit(body, "facts[9].value", "X")).toBe(body);
    expect(applyInlineEdit(body, "sections[0].bullets[9]", "X")).toBe(body);
    expect(applyInlineEdit(body, "", "X")).toBe(body);
  });
});

describe("applyFillsToBody — 채운 값을 구획 전체에 반영한다", () => {
  it("모든 칸의 표식을 한 번에 바꾼다", () => {
    const body: BulkEmailBody = {
      ...emptyEmailBody(),
      subject: "서류 제출 [확인 필요: 요일]",
      conclusion: "9월 12일[확인 필요: 요일]까지",
      facts: [{ label: "기한", value: "9월 12일[확인 필요: 요일]" }],
      sections: [{ title: "[확인 필요: 요일] 안내", bullets: ["[확인 필요: 요일]"] }],
      action: { what: "[확인 필요: 요일]", when: "", how: "", button_label: "" },
      closing: "[확인 필요: 요일]",
    };
    const out = applyFillsToBody(body, { "[확인 필요: 요일]": "(금)" });
    expect(out.subject).toBe("서류 제출 (금)");
    expect(out.conclusion).toBe("9월 12일(금)까지");
    expect(out.facts[0].value).toBe("9월 12일(금)");
    expect(out.sections[0].title).toBe("(금) 안내");
    expect(out.sections[0].bullets).toEqual(["(금)"]);
    expect(out.action.what).toBe("(금)");
    expect(out.closing).toBe("(금)");
    expect(uniqueNeedsFill(bodyToText(out))).toEqual([]);
  });

  it("빈 값은 표식을 그대로 둔다 — 반쯤 채운 글이 나가지 않게", () => {
    const body: BulkEmailBody = { ...emptyEmailBody(), conclusion: "[확인 필요: 요일]" };
    expect(applyFillsToBody(body, { "[확인 필요: 요일]": "  " }).conclusion).toBe("[확인 필요: 요일]");
  });
});

describe("emailReady — 「발송 확인으로」가 열리는 조건", () => {
  const ok = {
    subject: "장려금 2차 서류 제출 안내",
    adSentences: [] as string[],
    factLock: { missing: [], added: [], ok: true },
    fillMarkers: [] as string[],
    fillValues: {} as Record<string, string>,
  };

  it("제목 있음 · 광고 문장 0 · 사실 잠금 통과 · 채울 칸 없음이면 열린다", () => {
    expect(emailReady(ok)).toBe(true);
  });

  it("제목이 비면 막는다", () => {
    expect(emailReady({ ...ok, subject: "   " })).toBe(false);
  });

  it("광고로 읽히는 문장이 하나라도 있으면 막는다", () => {
    expect(emailReady({ ...ok, adSentences: ["특별 혜택으로 추천드립니다."] })).toBe(false);
  });

  it("사실 잠금이 없거나(변환 전) 어긋나면 막는다", () => {
    expect(emailReady({ ...ok, factLock: null })).toBe(false);
    expect(emailReady({ ...ok, factLock: { missing: ["60만원"], added: [], ok: false } })).toBe(false);
  });

  it("채울 칸이 한 곳이라도 비면 막는다", () => {
    const markers = ["[확인 필요: 요일]", "[확인 필요: 계약금]"];
    expect(emailReady({ ...ok, fillMarkers: markers, fillValues: { "[확인 필요: 요일]": "금요일" } })).toBe(false);
    expect(
      emailReady({
        ...ok,
        fillMarkers: markers,
        fillValues: { "[확인 필요: 요일]": "금요일", "[확인 필요: 계약금]": " " },
      }),
    ).toBe(false);
    expect(
      emailReady({
        ...ok,
        fillMarkers: markers,
        fillValues: { "[확인 필요: 요일]": "금요일", "[확인 필요: 계약금]": "30만 원" },
      }),
    ).toBe(true);
  });
});

describe("attachmentTotalOk — 첨부 총합 10MB", () => {
  it("10MB 까지는 되고 1바이트만 넘어도 막는다", () => {
    expect(ATTACH_TOTAL_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(attachmentTotalOk([])).toBe(true);
    expect(attachmentTotalOk([{ bytes: ATTACH_TOTAL_MAX_BYTES }])).toBe(true);
    expect(attachmentTotalOk([{ bytes: ATTACH_TOTAL_MAX_BYTES + 1 }])).toBe(false);
  });

  it("여러 파일은 합쳐서 잰다", () => {
    const half = 5 * 1024 * 1024;
    expect(attachmentTotalOk([{ bytes: half }, { bytes: half }])).toBe(true);
    expect(attachmentTotalOk([{ bytes: half }, { bytes: half }, { bytes: 1 }])).toBe(false);
  });

  it("거절 문구가 고정이다", () => {
    expect(ATTACH_TOO_LARGE_NOTICE).toBe("첨부는 모두 합쳐 10MB까지예요 — 파일을 빼거나 줄여 주세요");
  });
});

describe("fileSizeLabel", () => {
  it("킬로바이트·메가바이트로 읽어 준다", () => {
    expect(fileSizeLabel(0)).toBe("0KB");
    expect(fileSizeLabel(248 * 1024)).toBe("248KB");
    expect(fileSizeLabel(1.5 * 1024 * 1024)).toBe("1.5MB");
  });
});

describe("factLockNotice — 사실 잠금 상자 문구", () => {
  it("변환 전에는 상자를 그리지 않는다", () => {
    expect(factLockNotice(null)).toBeNull();
  });

  it("통과면 초록 상자", () => {
    expect(factLockNotice({ missing: [], added: [], ok: true })).toEqual({
      tone: "success",
      title: "원문의 숫자·서류 이름이 정리본에 그대로 있어요",
      detail: "AI가 지어낸 값은 없어요.",
    });
  });

  it("빠진 값이 있으면 빨강 상자에 그 값을 적는다", () => {
    const n = factLockNotice({ missing: ["1인당 월 60만원"], added: [], ok: false });
    expect(n?.tone).toBe("error");
    expect(n?.title).toBe("정리본이 원문과 달라요 — 발송이 잠겼어요");
    expect(n?.detail).toContain("빠진 값: 1인당 월 60만원");
  });

  it("원문에 없던 값이 생겨도 빨강으로 잡는다", () => {
    const n = factLockNotice({ missing: [], added: ["9월 15일"], ok: false });
    expect(n?.detail).toContain("원문에 없는 값: 9월 15일");
  });
});

describe("이메일 2단계 고정 문구", () => {
  it("미리보기 디바운스는 0.3초 — 원문 변환(0.7초)보다 짧다", () => {
    expect(PREVIEW_DEBOUNCE_MS).toBe(300);
    expect(PREVIEW_DEBOUNCE_MS).toBeLessThan(CONVERT_DEBOUNCE_MS);
  });

  it("발신 주소·제목 앞머리는 고정이다", () => {
    expect(EMAIL_FROM_ADDRESS).toBe("consulting@wedly.kr");
    expect(EMAIL_SUBJECT_CHIP).toBe("[WEDLY]");
  });

  it("다음 단계 안내·시험 발송 안내가 시안 글자 그대로다", () => {
    expect(EMAIL_STEP2_NOTE).toBe("[확인 필요]가 다 채워지고 광고 표현이 없어야 다음으로 갈 수 있어요");
    expect(EMAIL_TEST_SEND_NOTE).toBe(
      "시험 발송에는 개인화 값이 들어가지 않아요 — 변수 확인은 「실제 수신자로 보기」로",
    );
  });
});
