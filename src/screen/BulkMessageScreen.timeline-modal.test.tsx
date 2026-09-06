import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BulkMessageScreen from "./BulkMessageScreen";
import type { HistoryTimelineState } from "./history-helpers";

// 배포본 QA 결함(2026-09-07): 3단계 발송 확인 판에서 「기록 N건」을 누르면 timeline 통로는
// 200 으로 끝나는데 모달이 안 떴다 — HistoryTimelineModal 이 HistoryTab.tsx(발송 기록 탭) 안에서만
// 그려져 그 탭을 보고 있을 때만 나타났다. 이제 화면 껍데기(BulkMessageScreen.tsx)에서 탭(view)과
// 무관하게 한 번만 그린다(상태·닫기는 useBulkState 의 기존 것을 그대로 쓴다).
//
// ★클릭을 실제로 흉내 내지 않는다 — useBulkState 는 이 화면의 useState 라 밖에서 흔들 수 없다.
//  실제 훅을 그대로 부른 뒤 반환값 중 이 결함과 관련된 두 칸(step·historyTimeline)만 덮어써서
//  「모달이 열린 채로 3단계를 보고 있다」를 재현한다. 나머지 칸은 전부 실제 초기값 그대로다.
let override: Record<string, unknown> = {};

vi.mock("./useBulkState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useBulkState")>();
  return {
    ...actual,
    useBulkState: (...args: unknown[]) => ({
      ...(actual.useBulkState as (...a: unknown[]) => Record<string, unknown>)(...args),
      ...override,
    }),
  };
});

const openTimeline: HistoryTimelineState = {
  recipientId: "r1",
  companyName: "(주)한빛정밀",
  emailMasked: "ha***@hanbit.kr",
  emailSource: "basic",
  subject: "장려금 2차 서류 제출 안내",
  senderName: "김민수",
  jobCreatedAt: "2026-09-04T01:12:00.000Z",
  items: [],
  loading: false,
  error: "",
};

/** override 를 세팅해 그린 뒤 다음 테스트로 새지 않게 되돌린다. */
function draw(over: Record<string, unknown>): string {
  override = over;
  try {
    return renderToStaticMarkup(<BulkMessageScreen />);
  } finally {
    override = {};
  }
}

const screenSource = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
const historyTabSource = readFileSync(join(__dirname, "HistoryTab.tsx"), "utf8");

describe("타임라인(「기록」) 모달 — 탭(view)과 무관하게 화면 껍데기가 한 번만 그린다", () => {
  it("3단계(발송하기 판)를 보는 중에도 timeline 이 열려 있으면 모달이 그려진다", () => {
    const html = draw({ step: 3, historyTimeline: openTimeline });
    // 3단계가 실제로 그려졌다(뒤 배치가 안 깨졌다) — Stepper 의 현재 단계 표시로 확인.
    expect(html).toContain("발송 확인");
    expect(html).toMatch(/aria-current="step"/);
    // 모달 — 제목에 회사명, 몸통에 「아직 기록이 없어요」(items 가 비었으므로).
    expect(html).toContain("이메일 기록 — (주)한빛정밀");
    expect(html).toContain("아직 기록이 없어요");
    expect((html.match(/role="dialog"/g) ?? []).length).toBe(1);
  });

  it("timeline 이 닫힘(null)이면 3단계에도 모달이 없다", () => {
    const html = draw({ step: 3, historyTimeline: null });
    expect(html).toContain("발송 확인");
    expect(html).not.toContain("이메일 기록 —");
    expect((html.match(/role="dialog"/g) ?? []).length).toBe(0);
  });

  it("발송 기록 판이 아니어도(view 기본값 send) 열려 있으면 그려진다 — HistoryTab 렌더에 기대지 않는다", () => {
    // view 를 바꾸지 않은 기본 상태(send)에서도 모달이 뜬다 — HistoryTab 이 마운트되지 않았는데도
    // 모달이 살아 있다는 것은 렌더 자리가 더 이상 발송 기록 탭 안이 아니라는 뜻이다.
    const html = draw({ historyTimeline: openTimeline });
    expect(html).toContain("이메일 기록 — (주)한빛정밀");
    expect((html.match(/role="dialog"/g) ?? []).length).toBe(1);
  });

  it("BulkMessageScreen.tsx 소스 — 모달은 정확히 한 번, 「발송 기록」 tabpanel 을 닫는 태그 뒤에 산다", () => {
    // 소스 구조로도 증명한다: view==="history" 일 때만 그려지는 블록 안이 아니라 그 밖(형제 자리)에
    // 있어야 탭을 옮겨도(view 가 무엇이든) 계속 살아 있다.
    const modalCalls = screenSource.match(/<HistoryTimelineModal\b/g) ?? [];
    expect(modalCalls.length).toBe(1);

    const historyPaneAt = screenSource.indexOf('id="bulk-pane-history"');
    expect(historyPaneAt, "발송 기록 tabpanel 자리").toBeGreaterThan(0);
    const historyPaneCloseAt = screenSource.indexOf("</div>\n\n", historyPaneAt);
    const modalAt = screenSource.indexOf("<HistoryTimelineModal");
    expect(modalAt, "타임라인 모달 렌더 자리는 발송 기록 tabpanel 닫힘 뒤여야 한다").toBeGreaterThan(
      historyPaneCloseAt,
    );
  });

  it("HistoryTab.tsx 안에는 이 모달을 더 이상 그리지 않는다 — 중복 렌더 자리가 없다", () => {
    expect(historyTabSource).not.toContain("HistoryTimelineModal");
  });
});
