import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BulkMessageScreen from "./BulkMessageScreen";

// 화면을 실제로 그려서 잰다(효과는 안 돌아 통신은 일어나지 않는다) — 소스 글자 검사보다 강하다.
const html = renderToStaticMarkup(<BulkMessageScreen />);
// 화면을 쪼갠 뒤로 글자가 사는 파일이 갈렸다 — 같은 것을 그 글자가 실제로 있는 파일에서 잰다.
const hookSource = readFileSync(join(__dirname, "useBulkState.ts"), "utf8");
const step1Source = readFileSync(join(__dirname, "steps/Step1Targets.tsx"), "utf8");
const step2Source = readFileSync(join(__dirname, "steps/Step2Chat.tsx"), "utf8");
const step3Source = readFileSync(join(__dirname, "steps/Step3Confirm.tsx"), "utf8");

/** 그려진 markup 에서 검색 입력칸 태그 하나를 꺼낸다. */
function searchInputTag(): string {
  const tag = html.match(/<input[^>]*id="bm-search"[^>]*>/)?.[0];
  expect(tag, "검색 입력칸(id=bm-search)이 화면에 있어야 한다").toBeTruthy();
  return tag as string;
}

describe("검색 칸 — 지우개(✕)가 정확히 하나만 보인다", () => {
  it("입력칸이 type=search 가 아니다 — 크롬·사파리가 자기 지우개를 덧그린다", () => {
    // 배포본 실측(2026-09-04): type="search" 라 브라우저 지우개가 1178px, 우리 것이 1206px 에
    // 나란히 떠 ✕ 가 둘로 보였다. 되살리지 마라.
    const tag = searchInputTag();
    expect(tag).not.toContain('type="search"');
    expect(tag).toContain('type="text"');
  });

  it("type=search 를 버리며 잃는 둘을 표준 속성으로 되찾았다", () => {
    const tag = searchInputTag();
    // 읽어 주는 도구에 「검색 칸」으로 알린다(type=search 의 암묵 role 을 대신한다)
    expect(tag).toContain('role="searchbox"');
    // 휴대폰 자판의 넘김 키를 「검색」으로
    expect(tag.toLowerCase()).toContain('enterkeyhint="search"');
  });

  it("지우개 단추는 우리가 그리는 하나뿐이다", () => {
    // 화면에 둘을 그려 두고 하나를 CSS 로 숨기는 식으로 때우지 않는다.
    expect((step1Source.match(/aria-label="검색어 지우기"/g) ?? []).length).toBe(1);
    // 첫 그림에서는 검색어가 비어 있어 우리 지우개도 아직 없다 — ✕ 가 0개여야 한다.
    expect(html).not.toContain('aria-label="검색어 지우기"');
  });
});

describe("1단계 첫 그림 — 배포 QA로 확인한 모습이 유지된다", () => {
  it("탭 3개·붙여넣기 칸이 없다", () => {
    expect(html).not.toContain('id="bm-paste"');
    for (const gone of ["조건으로 찾기", "목록에서 고르기", "번호 붙여넣기"]) {
      expect(html, `옛 탭 「${gone}」`).not.toContain(gone);
    }
  });

  it("담당 자리와 검색 칸이 나란히 있다", () => {
    expect(html).toContain("담당 컨설턴트");
    expect(html).toContain("상호명 · 대표자명 · 연락처 검색");
  });

  it("아직 담당 잠금 여부를 몰라 고르개 대신 「확인 중」을 그린다", () => {
    // 첫 그림에는 서버 답이 없다 — 파트너 앱에 「전체」가 뜨는 일이 없어야 한다.
    expect(html).toContain("확인 중…");
    expect(html).not.toContain('id="bm-manager"');
  });
});

describe("2단계 채우기 칸 — 「다 채웠나」로 숨기지 않는다", () => {
  /** <FillForm ... /> 를 감싸는 조건식(그리는 자리 바로 앞의 { ... } && ) 을 통째로 꺼낸다. */
  function fillFormGate(): string {
    const at = step2Source.indexOf("<FillForm\n");
    expect(at, "<FillForm 을 그리는 자리가 있어야 한다").toBeGreaterThan(0);
    const head = step2Source.slice(0, at);
    const open = head.lastIndexOf("\n            {");
    expect(open, "FillForm 을 감싼 조건식의 시작").toBeGreaterThan(0);
    return head.slice(open);
  }

  it("조건식에 fillsComplete 가 없다", () => {
    // 배포본 실측(2026-09-04): !fillsComplete 로 감싸 두어, 한 글자만 쳐도 입력칸이 사라져
    // 「서류를 사 준비해 주세요」처럼 잘린 본문이 그대로 발송됐다. 되살리지 마라.
    expect(fillFormGate()).not.toContain("fillsComplete");
  });

  it("조건식은 showFillForm 하나로만 판단한다", () => {
    expect(fillFormGate()).toContain("fillFormVisible");
    expect(hookSource).toContain("const fillFormVisible = showFillForm({");
  });

  it("「모두 채웠어요」 안내는 입력칸을 갈아치우지 않고 그 아래에 덧붙는다", () => {
    const form = step2Source.indexOf("<FillForm\n");
    const done = step2Source.indexOf('title="모두 채웠어요"');
    expect(done, "「모두 채웠어요」 안내").toBeGreaterThan(form);
    expect(step2Source).toContain("{fillFormVisible && fillsComplete && (");
  });
});

describe("3단계 예상 비용 칩 — 두 줄로 접혀도 테두리를 뚫지 않는다", () => {
  /** 칩 글자 바로 앞의 <span ...> 여는 태그를 꺼낸다. */
  function chipTag(text: string): string {
    const at = step3Source.indexOf(text);
    expect(at, `칩 「${text}」`).toBeGreaterThan(0);
    const head = step3Source.slice(0, at);
    const open = head.lastIndexOf("<span");
    return head.slice(open);
  }

  for (const text of ["부가세 별도", "알림톡 실패해도 문자로 대신 안 감"]) {
    it(`「${text}」 칩에 고정 높이가 없다`, () => {
      // 배포본 375px 실측(2026-09-04): h-[21px] 안에서 두 줄(28px)이 위아래로 삐져나왔다.
      const tag = chipTag(text);
      expect(tag).not.toMatch(/[\s"]h-\[\d/);
      expect(tag).toContain("min-h-[21px]");
    });

    it(`「${text}」 칩은 한 줄일 때 이전과 같은 21px 이다`, () => {
      // 14(leading) + 2.5*2(py) + 1*2(border, box-sizing:border-box) = 21px
      const tag = chipTag(text);
      expect(tag).toContain("leading-[14px]");
      expect(tag).toContain("py-[2.5px]");
      expect(tag).toContain("border-wedly-bd");
    });
  }
});
