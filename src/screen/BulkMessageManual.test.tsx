import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BulkMessageManual } from "./BulkMessageManual";
import { MAX_RECIPIENTS, TEST_SEND_CAP_PARTNER, TEST_SEND_CAP_STAFF } from "./limits";

const html = renderToStaticMarkup(<BulkMessageManual />);

describe("사용방법 탭 — 승인 미리보기의 내용을 다 옮겼나", () => {
  it("구역 제목 6개가 다 있다", () => {
    for (const title of [
      "받을 분 고르기",
      "안내문 만들기",
      "발송 확인",
      "보낸 뒤 — 진행 표 읽기",
      "자주 묻는 질문",
      "보내기 전 체크리스트",
    ]) {
      expect(html, `구역 제목 「${title}」`).toContain(title);
    }
  });

  it("구역 번호 01~06 이 다 있다", () => {
    for (const no of ["01", "02", "03", "04", "05", "06"]) {
      expect(html, `구역 번호 ${no}`).toContain(`>${no}<`);
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

  it("체크리스트 5칸과 첫 진행 문구가 있다", () => {
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(5);
    expect(html).toContain("0 / 5 확인");
    expect(html).toContain("아직 확인 전");
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
