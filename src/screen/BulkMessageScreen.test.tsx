import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BulkMessageScreen from "./BulkMessageScreen";

// 화면을 실제로 그려서 잰다(효과는 안 돌아 통신은 일어나지 않는다) — 소스 글자 검사보다 강하다.
const html = renderToStaticMarkup(<BulkMessageScreen />);
const source = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");

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
    expect((source.match(/aria-label="검색어 지우기"/g) ?? []).length).toBe(1);
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
