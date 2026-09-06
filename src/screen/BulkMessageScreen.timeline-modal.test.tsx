// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BulkMessageScreen from "./BulkMessageScreen";

// 배포본 QA 결함(2026-09-07): 3단계 발송 확인 판에서 「기록 N건」을 누르면 timeline 통로는
// 200 으로 끝나는데 모달이 안 떴다 — HistoryTimelineModal 이 HistoryTab.tsx(발송 기록 탭) 안에서만
// 그려져 그 탭을 보고 있을 때만 나타났다. 이제 화면 껍데기(BulkMessageScreen.tsx)가 탭(view)과
// 무관하게 한 번만 그리고, **탭을 옮기면 닫는다**(딴 탭까지 따라다니지 않게).
//
// ★훅을 덮어쓰지 않는다 — 진짜 useBulkState 를 그대로 돌린다. 보관함에 작업 번호를 적어 두면
//  화면이 3단계로 되살아나고(restoredFromStore), 진행 조회 응답이 수신자 표를 채운다.
//  그 표의 「기록」 단추를 **실제로 눌러** 조회→모달→닫기→다시 시도까지 흉내 낸다.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOB_ID = "job-2026-09-07";
const JOB_STORE_KEY = "wedly-bulk-message:jobId";
const TIMELINE_PATH = `/api/bulk-message/history/jobs/${JOB_ID}/timeline`;

/** 진행 조회 응답 — 이메일 작업 1명, 이미 「도착」까지 찍혀 폴링이 첫 회차에 멈춘다. */
const progressData = {
  status: "done",
  total: 1,
  sent: 1,
  failed: 0,
  error: "",
  stalled: false,
  failedRows: [],
  channelChat: false,
  channelEmail: true,
  emailStatus: "done",
  emailSent: 1,
  emailFailed: 0,
  stopRequested: false,
  recipients: [
    {
      id: "r1",
      companyName: "(주)한빛정밀",
      representative: "김대표",
      phone: "",
      error: "",
      status: "sent",
      alimtalkStatus: "",
      viewedAt: null,
      eventCount: 3,
      email: "ha***@hanbit.kr",
      emailSource: "basic",
      emailStatus: "delivered",
      emailSentAt: "2026-09-07T01:00:00.000Z",
      emailDeliveredAt: "2026-09-07T01:00:20.000Z",
    },
  ],
};

const timelineOk = {
  success: true,
  data: {
    recipient: {
      companyName: "(주)한빛정밀",
      emailMasked: "ha***@hanbit.kr",
      emailSource: "basic",
    },
    job: {
      emailSubject: "장려금 2차 서류 제출 안내",
      senderName: "김민수",
      createdAt: "2026-09-07T01:00:00.000Z",
    },
    items: [
      { kind: "sent", title: "보냄", detail: "발송 업체가 접수했어요", at: "2026-09-07T01:00:00.000Z" },
      { kind: "delivered", title: "도착", detail: "받는 서버까지 갔어요", at: "2026-09-07T01:00:20.000Z" },
    ],
  },
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

/** 타임라인 통로가 이번 시험에서 무엇을 돌려줄지 — 시험마다 갈아 끼운다. */
let timelineReply: () => Response = () => jsonResponse(timelineOk);

const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  if (url.startsWith(TIMELINE_PATH)) return Promise.resolve(timelineReply());
  if (url === `/api/bulk-message/jobs/${JOB_ID}`) {
    return Promise.resolve(jsonResponse({ success: true, data: progressData }));
  }
  if (url.startsWith("/api/auth/me")) {
    return Promise.resolve(jsonResponse({ name: "김민수", email: "minsu.kim@wedly.kr" }));
  }
  if (url.startsWith("/api/bulk-message/targets")) {
    return Promise.resolve(jsonResponse({ success: true, data: { targets: [], managers: [] } }));
  }
  return Promise.resolve(jsonResponse({ success: true, data: { rows: [] } }));
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** 대기 중인 약속(then)을 몇 바퀴 흘려 화면이 응답을 다 받아 그리게 한다. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountScreen(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as HTMLDivElement);
    root.render(<BulkMessageScreen />);
  });
  await flush();
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el, "누를 것이 화면에 있어야 한다").toBeTruthy();
  await act(async () => {
    (el as Element).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

function dialogs(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
}

/** 글자가 정확히 맞는 첫 요소를 찾는다(단추·탭 고르기용). */
function byText(selector: string, text: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (el) => (el.textContent ?? "").trim() === text,
  );
}

/** 3단계 표의 「기록 N건」 단추. */
function timelineButton(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("td button")).find((el) =>
    (el.textContent ?? "").trim().startsWith("기록"),
  );
}

beforeEach(() => {
  sessionStorage.setItem(JOB_STORE_KEY, JOB_ID);
  timelineReply = () => jsonResponse(timelineOk);
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("3단계 「기록」 단추 → 타임라인 모달 (실제 클릭 흐름)", () => {
  it("단추를 누르면 타임라인을 조회해 모달을 그리고, 「닫기」로 닫힌다", async () => {
    await mountScreen();

    // 되살린 작업이 3단계를 열고 진행 조회가 수신자 표를 채웠다.
    expect(document.body.textContent).toContain("발송 확인");
    const btn = timelineButton();
    expect(btn?.textContent?.trim(), "「기록 3건」 단추").toBe("기록 3건");
    expect(dialogs().length, "누르기 전에는 모달이 없다").toBe(0);

    await click(btn);

    // 타임라인 통로를 실제로 불렀다(수신자 열쇠까지 실어서).
    const timelineCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith(TIMELINE_PATH));
    expect(timelineCalls.length).toBe(1);
    expect(String(timelineCalls[0][0])).toContain("recipient=r1");

    // 모달이 정확히 하나 뜨고, 서버가 준 항목이 보인다.
    expect(dialogs().length).toBe(1);
    const dialog = dialogs()[0];
    expect(dialog.textContent).toContain("이메일 기록 — (주)한빛정밀");
    expect(dialog.textContent).toContain("보냄");
    expect(dialog.textContent).toContain("도착");
    expect(dialog.textContent).toContain("장려금 2차 서류 제출 안내");

    await click(byText("button", "닫기"));
    expect(dialogs().length, "「닫기」를 누르면 사라진다").toBe(0);
  });

  it("조회가 실패하면 오류를 적고, 「다시 시도」가 같은 조회를 다시 부른다", async () => {
    timelineReply = () => jsonResponse({ success: false, error: "잠시 후 다시 시도해 주세요." }, { ok: false, status: 500 });
    await mountScreen();

    await click(timelineButton());
    expect(dialogs().length).toBe(1);
    expect(dialogs()[0].textContent).toContain("기록을 불러오지 못했어요");

    const before = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith(TIMELINE_PATH)).length;
    expect(before).toBe(1);

    // 이번엔 서버가 제대로 답한다 — 「다시 시도」가 조회를 한 번 더 부르고 목록이 채워진다.
    timelineReply = () => jsonResponse(timelineOk);
    await click(byText("button", "다시 시도"));

    const after = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith(TIMELINE_PATH)).length;
    expect(after, "「다시 시도」가 조회를 다시 부른다").toBe(before + 1);
    expect(dialogs()[0].textContent).toContain("도착");
    expect(dialogs()[0].textContent).not.toContain("기록을 불러오지 못했어요");
  });

  it("모달은 어느 탭 판(tabpanel) 안에도 살지 않는다 — 껍데기가 한 번만 그린다", async () => {
    await mountScreen();
    await click(timelineButton());

    expect(dialogs().length, "모달은 정확히 하나다").toBe(1);
    // 발송 탭(기본)을 보는 중이다 — 숨겨진 판 안에 모달이 들어 있으면 안 보인다.
    expect(document.querySelector('[role="tabpanel"][hidden] [role="dialog"]')).toBeNull();
    // 보이는 판 안도 아니다 — 탭 밖 형제 자리에 있어야 탭을 옮겨도 살아 있다.
    expect(dialogs()[0].closest('[role="tabpanel"]')).toBeNull();
  });

  it("탭을 옮기면 열려 있던 모달을 닫는다 — 딴 탭까지 따라다니지 않는다", async () => {
    await mountScreen();
    await click(timelineButton());
    expect(dialogs().length).toBe(1);

    await click(document.getElementById("bulk-tab-history"));

    expect(document.getElementById("bulk-pane-history")?.hasAttribute("hidden")).toBe(false);
    expect(dialogs().length, "탭이 바뀌면 타임라인은 닫힌다").toBe(0);
  });
});

describe("HistoryTab.tsx 소스 — 이 모달을 더 이상 그리지 않는다", () => {
  it("중복 렌더 자리가 없다", () => {
    const historyTabSource = readFileSync(join(__dirname, "HistoryTab.tsx"), "utf8");
    expect(historyTabSource).not.toContain("HistoryTimelineModal");
  });
});
