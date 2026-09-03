import { describe, it, expect } from "vitest";
import {
  AD_WORDS,
  detectAdWords,
  findNeedsFill,
  substituteVars,
  parseConvertResponse,
  MAX_MESSAGE_LEN,
} from "./checks";

describe("findNeedsFill", () => {
  it("[확인 필요] 표식을 전부 찾는다", () => {
    expect(findNeedsFill("기한은 [확인 필요: 요일]까지, 금액 [확인 필요: 계약금]"))
      .toEqual(["[확인 필요: 요일]", "[확인 필요: 계약금]"]);
    expect(findNeedsFill("표식 없음")).toEqual([]);
  });
});

describe("substituteVars", () => {
  it("대표명·회사명을 치환한다", () => {
    expect(substituteVars("{대표명} 대표님, {회사명} 안내입니다", { representative: "김영섭", company: "한빛물류" }))
      .toBe("김영섭 대표님, 한빛물류 안내입니다");
  });
  it("값이 없으면 일반 호칭으로 바꾼다", () => {
    expect(substituteVars("{대표명} 대표님", { representative: "", company: "" })).toBe("대표님");
    expect(substituteVars("{회사명}의 안내", { representative: "", company: "" })).toBe("귀사의 안내");
  });
});

describe("parseConvertResponse", () => {
  it("JSON 응답을 파싱한다", () => {
    const r = parseConvertResponse('{"text":"안녕하세요","adWords":[]}');
    expect(r).toEqual({ text: "안녕하세요", adWords: [] });
  });
  it("코드펜스로 감싸도 파싱한다", () => {
    const r = parseConvertResponse('```json\n{"text":"안녕","adWords":["할인"]}\n```');
    expect(r?.adWords).toEqual(["할인"]);
  });
  it("깨진 응답은 null", () => {
    expect(parseConvertResponse("그냥 글")).toBeNull();
    expect(parseConvertResponse('{"adWords":[]}')).toBeNull(); // text 없음
  });
  it("본문이 상한을 넘으면 null", () => {
    expect(parseConvertResponse(JSON.stringify({ text: "가".repeat(MAX_MESSAGE_LEN + 1), adWords: [] }))).toBeNull();
  });
});

describe("detectAdWords", () => {
  it("빈 글·광고 낱말 없으면 빈 배열", () => {
    expect(detectAdWords("")).toEqual([]);
    expect(detectAdWords("안녕하세요, 위들리입니다. 서류를 보내 주세요.")).toEqual([]);
  });

  it("나온 순서대로 모으고 같은 낱말은 한 번만", () => {
    expect(detectAdWords("이번 할인 이벤트, 또 할인")).toEqual(["할인", "이벤트"]);
  });

  it("붙여 쓴 낱말도 각각 잡는다", () => {
    expect(detectAdWords("특가할인")).toEqual(["특가", "할인"]);
  });

  it("목록에 있는 낱말만 잡고 비슷한 글자는 안 잡는다", () => {
    expect(AD_WORDS).toEqual(expect.arrayContaining([
      "할인", "이벤트", "프로모션", "특가", "무료", "선착순",
      "마감임박", "혜택", "경품", "사은품", "최저가", "쿠폰",
    ]));
    expect(detectAdWords("무효 처리됩니다")).toEqual([]);
    expect(detectAdWords("선착순 마감임박 쿠폰")).toEqual(["선착순", "마감임박", "쿠폰"]);
  });

  it("직접 고쳐서 낱말을 빼면 경고 목록에서도 빠진다", () => {
    const before = detectAdWords("할인 혜택 안내");
    expect(before).toEqual(["할인", "혜택"]);
    expect(detectAdWords("안내")).toEqual([]);
  });

  // 2026-09-02 GPT 적대적 리뷰 반영 — 못 잡던 판촉 3종 + "세일즈팀" 오탐 방지.
  it("「오늘만 반값」처럼 못 잡던 판촉 표현을 잡는다", () => {
    expect(detectAdWords("오늘만 반값에 드려요")).toEqual(["오늘만", "반값"]);
  });

  it("「50% OFF」처럼 숫자+%+영문 표현을 정규식으로 잡는다", () => {
    expect(detectAdWords("이번 주만 50% OFF")).toEqual(["OFF"]);
    expect(detectAdWords("전품목 OFF 진행 중")).toEqual(["OFF"]);
  });

  it("「하나 더 드려요」 문구를 잡는다", () => {
    expect(detectAdWords("지금 사면 하나 더 드려요")).toEqual(["하나 더 드려요"]);
  });

  it("「세일즈팀」·「세일즈」는 「세일」로 오탐하지 않는다", () => {
    expect(detectAdWords("세일즈팀 회의가 있어요")).toEqual([]);
    expect(detectAdWords("세일즈 담당자에게 문의하세요")).toEqual([]);
    // 진짜 세일은 그대로 잡는다
    expect(detectAdWords("이번 시즌 세일 안내")).toEqual(["세일"]);
  });
});
