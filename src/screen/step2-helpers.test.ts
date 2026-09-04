import { describe, expect, it } from "vitest";
import {
  CONVERT_DEBOUNCE_MS,
  CONVERT_INCOMPLETE_MESSAGE,
  FILL_MAX_LEN,
  MAX_COMPOSED_LEN,
  MIN_ORIGINAL_LEN,
  PREVIEW_EXAMPLE,
  allFillsComplete,
  applyFillValues,
  applyPreviewExamples,
  clampFillValue,
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
