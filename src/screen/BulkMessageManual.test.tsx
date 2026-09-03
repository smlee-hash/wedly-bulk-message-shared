import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeSectionIndex, BulkMessageManual } from "./BulkMessageManual";
import { MAX_RECIPIENTS, TEST_SEND_CAP_PARTNER, TEST_SEND_CAP_STAFF } from "./limits";

const html = renderToStaticMarkup(<BulkMessageManual />);
const source = readFileSync(join(__dirname, "BulkMessageManual.tsx"), "utf8");

describe("사용방법 탭 — 승인 미리보기(가독성 판)의 내용을 다 옮겼나", () => {
  it("구역 제목 6개가 다 있다", () => {
    for (const title of [
      "받을 분 고르기",
      "안내문 만들기",
      "발송 확인",
      "보낸 뒤 — 진행 표 읽기",
      "자주 묻는 질문",
      "보내기 전 체크",
    ]) {
      expect(html, `구역 제목 「${title}」`).toContain(title);
    }
  });

  it("자동 제외 표시 4개를 설명한다", () => {
    for (const label of ["수신거부", "번호 없음", "중복 번호", "범위 밖"]) {
      expect(html, `자동 제외 「${label}」`).toContain(label);
    }
  });

  it("자주 묻는 질문이 6개 펼침으로 들어 있다", () => {
    expect(html.match(/<details/g) ?? []).toHaveLength(6);
    expect(html.match(/<summary/g) ?? []).toHaveLength(6);
  });

  it("상한 숫자는 limits.ts 값 그대로 나온다", () => {
    expect(MAX_RECIPIENTS).toBe(500);
    expect(TEST_SEND_CAP_STAFF).toBe(10);
    expect(TEST_SEND_CAP_PARTNER).toBe(3);
    expect(html).toContain("500");
    expect(html).toContain("10건");
    expect(html).toContain("3건");
    // 숫자를 손으로 박아 두면 limits.ts 를 고쳐도 매뉴얼만 옛 값으로 남는다.
    expect(source).not.toMatch(/최대 500명|하루 10건|파트너 앱 3건/);
  });

  it("흐름 카드 3개를 눌러서 이동할 수 있다", () => {
    expect(html.match(/role="button"/g) ?? []).toHaveLength(3);
    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(3);
  });

  it("인용한 화면 문구가 실제 문구 그대로다", () => {
    // 매뉴얼이 「」로 인용하는 문구는 화면·서버가 실제로 내는 문구여야 한다.
    //  - "먼저 안내문 변환이 끝나야 해요"  → step2-helpers.ts step2FooterHint
    //  - "같은 내용을 방금 보냈습니다"      → 서버 발송 창구의 10분 중복 방어 문구
    for (const quote of ["먼저 안내문 변환이 끝나야 해요", "같은 내용을 방금 보냈습니다"]) {
      expect(html, `인용 문구 「${quote}」`).toContain(quote);
    }
  });

  it("체크리스트 5칸과 진행 문구 세 가지가 있다", () => {
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(5);
    expect(html).toContain("0 / 5 확인");
    expect(html).toContain("아직 확인 전");
    // 다 체크했을 때 문구는 첫 그리기에 안 나오므로 코드에 있는지로 본다.
    expect(source).toContain("보내도 좋아요");
  });
});

describe("가독성 — 사장님 지적(글자가 작다 · 문장이 길게 늘어진다) 반영", () => {
  it("목차 링크 7개가 있다", () => {
    expect(html.match(/href="#/g) ?? []).toHaveLength(7);
  });

  it("목차 + 720px 본문 열 두 칸 배치다", () => {
    expect(source).toContain("md:grid-cols-[200px_minmax(0,1fr)]");
    expect(source).toContain("max-w-[720px]");
    expect(source).toContain('aria-label="사용방법 목차"');
  });

  it("현재 구역 강조는 스크롤 위치 계산으로 하고 서버 그리기에서 안 터진다", () => {
    // IntersectionObserver 는 화면 끝에서 틀려(맨 아래·맨 위) 버렸다 — 되살리지 마라.
    expect(source).not.toContain("IntersectionObserver(");
    expect(source).toContain('typeof window === "undefined"');
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("passive: true");
    expect(source).toContain("cancelAnimationFrame");
    expect(source).toContain("removeEventListener");
  });

  it("11px 층(text-wedly-hint)을 쓰지 않는다", () => {
    // 가독성 재구성의 핵심 — 각주까지 최소 13px 로 올렸다.
    expect(source).not.toContain("text-wedly-hint");
  });

  it("본문·보조 글자가 13px 밑으로 내려가지 않는다", () => {
    // text-[10px] · text-[11px] · text-[12.5px] 처럼 12px 이하로 박은 자리가 없어야 한다.
    const 작은글자 = source.split("\n").flatMap((line, i) => {
      const m = line.match(/text-\[1[0-2][^\]]*\]/g);
      return m ? m.map((c) => `${i + 1}행 ${c}`) : [];
    });
    expect(작은글자).toEqual([]);
  });

  it("표(<table>) 대신 카드 줄을 쓴다 — <thead>·<th> 없음", () => {
    // ERP 글자 층 검사가 <thead>/<th> 크기를 따로 보므로 아예 쓰지 않는다.
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<thead");
    expect(html).not.toContain("<th ");
  });

  it("구역 제목은 h2 + text-wedly-section 이다 (ERP 글자 층 규칙)", () => {
    expect(source).toContain('<h2 className="text-wedly-section font-bold text-wedly-t1 break-keep">');
    expect(html.match(/<h2/g) ?? []).toHaveLength(6);
    expect(html.match(/<h3/g) ?? []).toHaveLength(0);
  });
});

describe("activeSectionIndex — 목차 강조 계산", () => {
  // 구역 7개(한눈에 보기 · 1~4 · ? · ✓)의 상자 기준 top
  const tops = [0, 400, 900, 1500, 2100, 2700, 3300];
  const H = 800; // 보이는 높이
  const S = 4000; // 전체 높이

  it("맨 위에서는 첫 구역", () => {
    expect(activeSectionIndex(tops, 0, H, S)).toBe(0);
    // 읽는 자리(120px)보다 위에 있는 구역이 하나도 없어도 첫 구역으로 떨어진다
    expect(activeSectionIndex([200, 700], 0, H, S)).toBe(0);
  });

  it("중간에서는 읽는 자리를 지난 마지막 구역", () => {
    // 1000 + 120 = 1120 → 900 은 지났고 1500 은 아직 → 세 번째(번호 2)
    expect(activeSectionIndex(tops, 1000, H, S)).toBe(2);
    expect(activeSectionIndex(tops, 2000, H, S)).toBe(4);
  });

  it("바닥에 닿으면 마지막 구역 — 짧아서 읽는 자리까지 못 올라와도", () => {
    // 3200 + 800 = 4000 ≥ 4000 - 2 → 마지막(번호 6).
    // 읽는 자리로만 재면 3320 이라 3300 을 갓 지나 우연히 맞지만,
    // 마지막 구역이 짧아 top 이 3900 이어도 바닥 규칙이 마지막을 고른다.
    expect(activeSectionIndex(tops, 3200, H, S)).toBe(6);
    expect(activeSectionIndex([0, 400, 900, 1500, 2100, 2700, 3900], 3200, H, S)).toBe(6);
  });

  it("구역 경계 직전·직후에서 한 칸씩 넘어간다", () => {
    expect(activeSectionIndex(tops, 779, H, S)).toBe(1); // 779 + 120 = 899 → 아직 두 번째
    expect(activeSectionIndex(tops, 780, H, S)).toBe(2); // 780 + 120 = 900 → 세 번째로
  });

  it("구역이 없으면 0 (빈 배열에 터지지 않는다)", () => {
    expect(activeSectionIndex([], 0, H, S)).toBe(0);
  });
});

describe("WEDLY 디자인 토큰", () => {
  // raw Tailwind 컬러 스케일 금지(CLAUDE.md rule #1) — 화면 폴더 전체를 훑는다.
  const RAW_COLOR =
    /(bg|text|border|from|to)-(green|amber|red|sky|blue|indigo|violet|pink|gray|slate|zinc|orange|yellow|lime|emerald|teal|cyan|rose|fuchsia)-(50|100|200|300|400|500|600|700|800|900)/;

  it("src/screen 의 화면 파일에 raw 색 클래스가 없다", () => {
    const dir = join(__dirname);
    const hits: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tsx")) continue;
      readFileSync(join(dir, name), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (RAW_COLOR.test(line)) hits.push(`${name}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

describe("발송하기 / 사용방법 탭", () => {
  it("화면 파일에 알약 탭 두 개가 있다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain('role="tablist"');
    expect(src).toContain('aria-label="화면 보기"');
    expect(src).toContain('label: "발송하기"');
    expect(src).toContain('label: "사용방법"');
  });

  it("판 두 개를 늘 그리고(떼지 않고 숨김) 탭이 판을 가리킨다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    // 판을 떼면 탭을 옮길 때마다 체크리스트·펼침·고르던 대상이 초기화된다 — 늘 그리고 hidden 으로 숨긴다.
    expect(src.match(/role="tabpanel"/g) ?? []).toHaveLength(2);
    expect(src).toContain('hidden={view !== "send"}');
    expect(src).toContain('hidden={view !== "manual"}');
    expect(src).toContain("aria-controls={v.paneId}");
  });
});
