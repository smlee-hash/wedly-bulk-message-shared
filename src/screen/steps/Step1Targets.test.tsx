import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Target } from "../useBulkState";
import { Step1Targets, type Step1TargetsProps } from "./Step1Targets";

// 1단계를 **실제로 그려서** 잰다 — 배포본 검사(2026-09-06)가 잡은 두 곳:
//  ① 「둘 다」인데 「자동 제외됩니다」 경고가 뜨던 자리 ② 「발송 가능」 딱지가 낱말 중간에서 끊기던 자리.

function target(over: Partial<Target> = {}): Target {
  return {
    rowId: "row-1",
    companyName: "(주)한빛정밀",
    representative: "김대표",
    phone: "010-2•••-4567",
    statuses: ["계약완료"],
    manager: "김민수",
    contractDate: "2026-08-01",
    refundedAt: "",
    sendable: true,
    excludeReason: "",
    email: "",
    emailSource: "",
    bizNo: "1234567890",
    emailSendable: false,
    emailExcludeReason: "이메일 없음",
    ...over,
  };
}

function props(over: Partial<Step1TargetsProps> = {}): Step1TargetsProps {
  const rows = [target()];
  return {
    lockedToMe: false,
    managerFilter: "__mine__",
    onManagerChange: () => {},
    managerOptions: [{ value: "__mine__", label: "내 고객" }],
    search: "",
    setSearch: () => {},
    channel: "both",
    setChannel: () => {},
    targetCounts: { contract: 1, chatOk: 1, emailOk: 0, excluded: 0 },
    noEmailCount: 3,
    pickedTotals: { total: 0, email: 0 },
    manualEmails: new Map(),
    manualEdits: new Map(),
    startManualEmail: () => {},
    changeManualEmail: () => {},
    toggleManualPersist: () => {},
    cancelManualEmail: () => {},
    saveManualEmail: () => {},
    listPhase: "ready",
    loadError: "",
    retryLoad: () => {},
    droppedPicked: [],
    setDroppedPicked: () => {},
    loadingTargets: false,
    loadedOnce: true,
    visibleTargets: rows,
    sendableTargets: rows,
    excludeSummary: "",
    allChecked: false,
    toggleAll: () => {},
    picked: new Map(),
    toggleOne: () => {},
    goStep: () => {},
    targetsOk: false,
    selectedCount: 0,
    hiddenPicked: 0,
    ...over,
  };
}

const draw = (over: Partial<Step1TargetsProps> = {}) => renderToStaticMarkup(<Step1Targets {...props(over)} />);

const AUTO_EXCLUDE = "이메일이 없는 분 3명은 이 발송에서 자동 제외됩니다";
const BOTH_INFO = "이메일이 없는 3명은 알림톡·채팅으로만 받아요 — 표에서 직접 입력하면 이메일도 함께 갑니다";

describe("이메일 없는 분 안내 — 통로에 따라 말이 달라진다(2026-09-06 반려 2)", () => {
  it("「둘 다」에서는 자동 제외가 아니다 — 알림톡·채팅으로는 그대로 나간다", () => {
    const html = draw({ channel: "both" });
    // 배포본 실측: 「둘 다」인데도 「이 발송에서 자동 제외됩니다」가 떠, 담당자가 안 나가는 줄로 읽었다.
    expect(html).not.toContain(AUTO_EXCLUDE);
    expect(html).toContain(BOTH_INFO);
  });

  it("「이메일」만 고르면 자동 제외 경고 그대로, 「알림톡·채팅」이면 둘 다 안 뜬다", () => {
    const email = draw({ channel: "email" });
    expect(email).toContain(AUTO_EXCLUDE);
    expect(email).not.toContain(BOTH_INFO);

    const chat = draw({ channel: "chat" });
    expect(chat).not.toContain(AUTO_EXCLUDE);
    expect(chat).not.toContain(BOTH_INFO);
  });
});

describe("「직접 입력」을 여는 동안 다른 열이 눌리지 않는다(2026-09-06 반려 6)", () => {
  it("고치는 칸은 고정 폭이고, 이메일·발송 열에 최소 폭이 있다", () => {
    // 배포본 실측: 입력칸이 늘어나며 같은 줄 「이메일 없음」 딱지가 44×86px 로 3~4줄 붕괴했다.
    const editing = draw({
      manualEdits: new Map([["row-1", { draft: "ceo@hanbit.kr", error: "", persist: true }]]),
    });
    const at = editing.indexOf('aria-label="(주)한빛정밀 이메일 주소"');
    expect(at, "고치는 입력칸이 있어야 한다").toBeGreaterThan(0);
    const tag = editing.slice(editing.lastIndexOf("<input", at), at);
    expect(tag).toContain("w-56");
    // 열 최소 폭 — 이메일 열과 발송 열 둘 다(한쪽만 주면 다른 쪽이 눌린다)
    expect(editing).toContain("min-w-[280px]");
    expect(editing).toContain("min-w-[150px]");
  });
});

describe("이메일 출처 딱지 — 경정청구·신청서만 표시, 기본정보·손입력은 그대로(2026-09-06 신설)", () => {
  /**
   * 이메일 칸 하나만 떼어 낸다 — 표 위 안내문("→ 경정청구 「53이메일」…")과
   * 새 범례 줄에도 "경정청구"·"신청서" 글자가 항상 있어, 페이지 전체에서 찾으면
   * 「이 줄엔 없다」를 증명할 수 없다(반드시 그 주소가 든 <td> 안쪽만 본다).
   */
  function emailCellOf(html: string, address: string): string {
    const at = html.indexOf(address);
    expect(at, `주소 「${address}」 가 화면에 있어야 한다`).toBeGreaterThan(0);
    const close = html.indexOf("</td>", at);
    expect(close, `주소 「${address}」 뒤에 칸 닫는 태그가 있어야 한다`).toBeGreaterThan(at);
    return html.slice(at, close);
  }

  it("tax53 줄엔 「경정청구」, applicant 줄엔 「신청서」 딱지가 그 줄의 이메일 칸에만 붙는다", () => {
    const rows = [
      target({ rowId: "row-tax", email: "box@x.com", emailSource: "tax53", emailSendable: true, emailExcludeReason: "" }),
      target({ rowId: "row-app", email: "app@x.com", emailSource: "applicant", emailSendable: true, emailExcludeReason: "" }),
    ];
    const html = draw({ visibleTargets: rows, sendableTargets: rows });
    const taxCell = emailCellOf(html, "box@x.com");
    expect(taxCell).toContain("경정청구");
    expect(taxCell).not.toContain("신청서");
    expect(taxCell).toContain("bg-wedly-purple");

    const appCell = emailCellOf(html, "app@x.com");
    expect(appCell).toContain("신청서");
    expect(appCell).not.toContain("경정청구");
    expect(appCell).toContain("bg-wedly-teal");
  });

  it("기본정보(basic) 주소는 그 줄의 이메일 칸에 딱지가 없다", () => {
    const row = target({ email: "basic@x.com", emailSource: "basic", emailSendable: true, emailExcludeReason: "" });
    const html = draw({ visibleTargets: [row], sendableTargets: [row] });
    const cell = emailCellOf(html, "basic@x.com");
    expect(cell).not.toContain("경정청구");
    expect(cell).not.toContain("신청서");
  });

  it("직접 입력(manual) 줄은 기존 「직접 입력」 딱지를 그대로 쓰고, 출처 딱지는 겹쳐 붙지 않는다", () => {
    const row = target({ email: "manual@x.com", emailSource: "manual", emailSendable: true, emailExcludeReason: "" });
    const html = draw({
      visibleTargets: [row],
      sendableTargets: [row],
      manualEmails: new Map([["row-1", { email: "manual@x.com", persist: false }]]),
    });
    const cell = emailCellOf(html, "manual@x.com");
    expect(cell).toContain("직접 입력 · 이번만");
    expect(cell).not.toContain("경정청구");
    expect(cell).not.toContain("신청서");
  });

  it("표 아래에 출처 범례 한 줄이 있다", () => {
    const html = draw();
    expect(html).toContain("출처 — 경정청구 · 신청서 · 직접 입력(기본정보 주소는 딱지 없음)");
  });
});

describe("발송 열 딱지 — 낱말 중간에서 끊기지 않는다(2026-09-06 반려 5)", () => {
  /** 딱지 글자 바로 앞의 여는 태그들을 꺼낸다(딱지는 알약 span + 색 점 span 으로 그려진다). */
  function tagsBefore(html: string, label: string): string {
    const at = html.indexOf(label);
    expect(at, `딱지 「${label}」 이 화면에 있어야 한다`).toBeGreaterThan(0);
    return html.slice(Math.max(0, at - 400), at);
  }

  it("「발송 가능」·제외 사유 딱지 둘 다 한 줄로 선다", () => {
    // 배포본 실측(1280px): 「발송 가 / 능」으로 끊겨 보였다.
    const ok = draw({ visibleTargets: [target()], sendableTargets: [target()] });
    expect(tagsBefore(ok, "발송 가능")).toContain("whitespace-nowrap");

    const blocked = target({ sendable: false, excludeReason: "번호 없음 · 이메일 없음" });
    const html = draw({ visibleTargets: [blocked], sendableTargets: [] });
    expect(tagsBefore(html, "번호 없음 · 이메일 없음")).toContain("whitespace-nowrap");
  });
});
