import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryTimelineModal } from "./HistoryTimelineModal";
import type { HistoryTimelineItem, HistoryTimelineState } from "./history-helpers";

// 수신자 타임라인 모달을 **실제로 그려서** 잰다 — 시안
// (docs/superpowers/specs/2026-09-07-email-stage2-preview.html)의 세로 선·아이콘 타일·제목·설명·시각과
// 네 갈래(불러오는 중 / 빈 기록 / 오류 / 목록)가 살아 있는지.

function item(over: Partial<HistoryTimelineItem> = {}): HistoryTimelineItem {
  return {
    at: "2026-09-06T06:07:29.000Z",
    kind: "sent",
    title: "보냄",
    detail: "Resend 접수",
    ...over,
  };
}

function state(over: Partial<HistoryTimelineState> = {}): HistoryTimelineState {
  return {
    recipientId: "r1",
    companyName: "대성포장산업",
    emailMasked: "bo***@hanmail.net",
    emailSource: "basic",
    subject: "서류 2종 제출 안내",
    senderName: "홍길동",
    jobCreatedAt: "2026-09-06T06:07:00.000Z",
    items: [item()],
    loading: false,
    error: "",
    ...over,
  };
}

const draw = (over: Partial<HistoryTimelineState> | null = {}) =>
  renderToStaticMarkup(
    <HistoryTimelineModal
      timeline={over === null ? null : state(over)}
      onClose={() => {}}
      onRetry={() => {}}
    />,
  );

describe("네 갈래를 전부 그린다", () => {
  it("① 닫힘 — timeline 이 null 이면 아무것도 안 그린다", () => {
    expect(draw(null)).toBe("");
  });

  it("② 불러오는 중 — 자리지킴(맥박)만 그리고 「기록이 없어요」는 안 뜬다", () => {
    const html = draw({ loading: true, items: [] });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain("아직 기록이 없어요");
    expect(html).not.toContain("다시 시도");
  });

  it("③ 빈 기록 — 「아직 기록이 없어요」로 정직하게 적는다", () => {
    const html = draw({ items: [] });
    expect(html).toContain("아직 기록이 없어요");
    expect(html).not.toContain("animate-pulse");
  });

  it("④ 오류 — 사유와 「다시 시도」를 함께 준다", () => {
    const html = draw({ error: "잠시 후 다시 시도해 주세요.", items: [] });
    expect(html).toContain("기록을 불러오지 못했어요");
    expect(html).toContain("잠시 후 다시 시도해 주세요.");
    expect(html).toContain("다시 시도");
    // 오류일 때 「기록이 없어요」를 겹쳐 띄우지 않는다 — 없는 것과 못 읽은 것은 다르다.
    expect(html).not.toContain("아직 기록이 없어요");
  });

  it("⑤ 목록 — 제목·설명·시각이 항목마다 선다", () => {
    const html = draw({
      items: [
        item({ kind: "sent", title: "보냄", detail: "Resend 접수" }),
        item({ kind: "delivered", title: "도착", detail: "받는 쪽 메일 서버가 받음" }),
      ],
    });
    expect(html).toContain("보냄");
    expect(html).toContain("Resend 접수");
    expect(html).toContain("도착");
    expect(html).toContain("받는 쪽 메일 서버가 받음");
    expect((html.match(/<li/g) ?? []).length).toBe(2);
    expect((html.match(/<time/g) ?? []).length).toBe(2);
  });
});

describe("머리 카드 — 누구에게 간 안내인지 모달 안에서도 안다", () => {
  const html = draw();

  it("제목에 회사명이 들어간다", () => {
    expect(html).toContain("이메일 기록 — 대성포장산업");
  });

  it("받는 주소·안내 제목·보낸 사람을 적는다(주소는 가린 채로)", () => {
    expect(html).toContain("받는 주소");
    expect(html).toContain("bo***@hanmail.net (기본정보 이메일)");
    expect(html).toContain("서류 2종 제출 안내");
    expect(html).toContain("홍길동");
  });

  it("직접 입력한 주소는 출처가 함께 보인다", () => {
    expect(draw({ emailMasked: "ds***@naver.com", emailSource: "manual" })).toContain(
      "ds***@naver.com (직접 입력)",
    );
  });
});

describe("항목 아이콘 타일 — 뜻이 색으로 갈린다(시안 §타임라인)", () => {
  const html = draw({
    items: [
      item({ kind: "sent", title: "보냄", detail: "" }),
      item({ kind: "delivered", title: "도착", detail: "" }),
      item({ kind: "viewed", title: "확인함", detail: "" }),
      item({ kind: "attachment", title: "첨부 열람", detail: "" }),
      item({ kind: "chat_viewed", title: "알림톡 링크 열림", detail: "" }),
      item({ kind: "bounced", title: "반송", detail: "" }),
      item({ kind: "failed", title: "실패", detail: "" }),
      item({ kind: "complained", title: "스팸 신고", detail: "" }),
      item({ kind: "unsubscribed", title: "수신 거부", detail: "" }),
      item({ kind: "manual_email_entered", title: "직접 입력", detail: "" }),
    ],
  });

  /** 그 제목이 든 <li> 한 조각만 뽑는다 — 옆 항목의 색이 섞이지 않게. */
  function liOf(markup: string, title: string): string {
    const parts = markup.split("<li").map((v) => `<li${v}`);
    const hit = parts.find((v) => v.includes(`>${title}</p>`));
    expect(hit, `「${title}」 항목`).toBeTruthy();
    return String(hit);
  }

  it("열 갈래가 모두 자기 색 타일을 쓴다(2026-09-07 서버 확정본)", () => {
    for (const [title, cls] of [
      ["보냄", "bg-wedly-accent"],
      ["도착", "bg-wedly-accent"],
      ["알림톡 링크 열림", "bg-wedly-accent"],
      ["확인함", "bg-wedly-green"],
      ["첨부 열람", "bg-wedly-green"],
      ["반송", "bg-wedly-red"],
      ["실패", "bg-wedly-red"],
      ["스팸 신고", "bg-wedly-red"],
      ["수신 거부", "bg-wedly-red"],
      ["직접 입력", "bg-wedly-purple"],
    ] as const) {
      expect(liOf(html, title), `「${title}」 타일`).toContain(cls);
    }
  });

  it("항목마다 아이콘 모양도 다르다 — 색만으로 갈리지 않게(옅은 색 대비 1.05 실측)", () => {
    const glyphs = new Set(
      (html.match(/lucide lucide-[a-z-]+/g) ?? []).map((v) => v.replace("lucide lucide-", "")),
    );
    // 열 항목 + 모달 닫기(x) — 항목 쪽만 봐도 갈래 수만큼 모양이 있어야 한다.
    expect(glyphs.size).toBeGreaterThanOrEqual(10);
  });

  it("모르는 갈래도 **숨기지 않고** 무채색 타일로 선다", () => {
    const html2 = draw({ items: [item({ kind: "something_new", title: "새 신호", detail: "" })] });
    expect(html2).toContain("새 신호");
    expect(html2).toContain("bg-wedly-t2");
  });

  it("타일 옆에 세로 선이 있다 — 시안의 타임라인 골격", () => {
    expect(html).toContain("bg-wedly-bd");
    expect(html).toContain("<ol");
  });
});

describe("WEDLY 규칙", () => {
  it("raw Tailwind 색을 안 쓴다", () => {
    const html = draw({ items: [item(), item({ kind: "bounced", title: "반송" })] });
    expect(html).not.toMatch(
      /(bg|text|border|from|to)-(green|amber|red|sky|blue|indigo|violet|pink|gray|slate|zinc|orange|yellow|lime|emerald|teal|cyan|rose|fuchsia)-(50|100|200|300|400|500|600|700|800|900)/,
    );
  });

  it("「확인함」이 무슨 뜻인지 목록 밑에서 한 번 말한다(hover 로만 보이는 안내 금지)", () => {
    expect(draw()).toContain("브라우저에서 보기");
  });
});
