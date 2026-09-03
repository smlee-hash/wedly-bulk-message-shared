import { describe, expect, it } from "vitest";
import {
  LIST_DEBOUNCE_MS,
  MANAGER_ALL,
  MANAGER_MINE,
  LOADING_TARGETS_HINT,
  PICK_TAB_HINT,
  canProceedWithTargets,
  checkedKeysOnLoad,
  step1ListPhase,
  listFetchDelayMs,
  managerQueryOf,
  managerSelectOptions,
  mergeManagerNames,
  multiSelectOptionKey,
  multiSelectTriggerKey,
  nextOptionIndex,
  resolveManagerScope,
  STATUS_PLACEHOLDER,
  statusTriggerLabel,
  uniqueManagers,
} from "./step1-helpers";

const t = (manager: string) => ({ manager });

describe("uniqueManagers", () => {
  it("빈 값은 빼고 중복 없이 가나다순으로 돌린다", () => {
    expect(uniqueManagers([
      t("우수하"),
      t("이충훈"),
      t(""),
      t(" 이충훈 "),
      t("강민아"),
      t("   "),
    ])).toEqual(["강민아", "우수하", "이충훈"]);
  });
});

describe("statusTriggerLabel", () => {
  it("없으면 빈 문자열 — 버튼은 placeholder 를 쓴다", () => {
    expect(statusTriggerLabel([])).toBe("");
    expect(STATUS_PLACEHOLDER).toBe("진행상태 선택");
  });

  it("하나면 그 이름", () => {
    expect(statusTriggerLabel(["계약완료"])).toBe("계약완료");
  });

  it("여러 개면 고른 값을 모두 이어 붙인다", () => {
    expect(statusTriggerLabel(["계약완료", "가망"])).toBe("계약완료, 가망");
    expect(statusTriggerLabel(["계약완료", "가망", "입금완료"])).toBe("계약완료, 가망, 입금완료");
  });
});

describe("managerSelectOptions", () => {
  it("내 고객·전체 뒤에 서버가 준 담당 이름을 가나다순으로 붙인다", () => {
    expect(managerSelectOptions(["우수하", "", "이충훈", " 우수하 "])).toEqual([
      { value: MANAGER_MINE, label: "내 고객" },
      { value: MANAGER_ALL, label: "전체" },
      { value: "우수하", label: "우수하" },
      { value: "이충훈", label: "이충훈" },
    ]);
  });

  it("이름이 없어도 내 고객·전체는 남는다", () => {
    expect(managerSelectOptions([])).toEqual([
      { value: MANAGER_MINE, label: "내 고객" },
      { value: MANAGER_ALL, label: "전체" },
    ]);
  });
});

describe("managerQueryOf", () => {
  it("내 고객은 onlyMine:true — 서버가 로그인 이름으로 거른다", () => {
    expect(managerQueryOf(MANAGER_MINE)).toEqual({ onlyMine: true });
  });

  it("전체는 onlyMine:false, 이름 없음", () => {
    expect(managerQueryOf(MANAGER_ALL)).toEqual({ onlyMine: false });
  });

  it("다른 담당은 그 이름을 managerName 으로 보낸다", () => {
    expect(managerQueryOf("이충훈")).toEqual({ onlyMine: false, managerName: "이충훈" });
    expect(managerQueryOf("  우수하  ")).toEqual({ onlyMine: false, managerName: "우수하" });
  });
});

describe("resolveManagerScope", () => {
  it("명시적 내 고객은 클라이언트가 보낸 이름을 무시한다", () => {
    expect(resolveManagerScope({ onlyMine: true })).toEqual({ mode: "mine" });
    expect(resolveManagerScope({ onlyMine: true, managerName: "이충훈" })).toEqual({ mode: "mine" });
  });

  it("전체는 이름 없이 onlyMine:false", () => {
    expect(resolveManagerScope({ onlyMine: false })).toEqual({ mode: "all" });
  });

  it("다른 담당은 그 이름", () => {
    expect(resolveManagerScope({ onlyMine: false, managerName: "이충훈" })).toEqual({
      mode: "named",
      managerName: "이충훈",
    });
    expect(resolveManagerScope({ managerName: "  우수하  " })).toEqual({
      mode: "named",
      managerName: "우수하",
    });
  });

  it("값이 없으면 내 고객 — 화면만 열어도 전체 고객이 내려가지 않게", () => {
    expect(resolveManagerScope({})).toEqual({ mode: "mine" });
    expect(resolveManagerScope({ onlyMine: undefined })).toEqual({ mode: "mine" });
  });
});

describe("mergeManagerNames", () => {
  it("이전 목록과 새 응답을 합쳐 가나다순으로 유지한다", () => {
    expect(mergeManagerNames(["이충훈"], ["우수하", "이충훈", ""])).toEqual(["우수하", "이충훈"]);
  });
});

describe("listFetchDelayMs", () => {
  it("첫 진입(아직 조회한 적 없음)은 즉시", () => {
    expect(listFetchDelayMs({ hadListQuery: false, statusesChanged: false })).toBe(0);
    expect(listFetchDelayMs({ hadListQuery: false, statusesChanged: true, managerChanged: true })).toBe(0);
  });

  it("진행상태가 바뀌면 300ms", () => {
    expect(listFetchDelayMs({ hadListQuery: true, statusesChanged: true })).toBe(LIST_DEBOUNCE_MS);
    expect(LIST_DEBOUNCE_MS).toBe(300);
  });

  it("담당이 바뀌면 300ms", () => {
    expect(listFetchDelayMs({
      hadListQuery: true,
      statusesChanged: false,
      managerChanged: true,
    })).toBe(LIST_DEBOUNCE_MS);
  });

  it("붙여넣기 탭에서 목록 탭으로 돌아올 때는 즉시", () => {
    expect(listFetchDelayMs({ hadListQuery: true, statusesChanged: false, managerChanged: false })).toBe(0);
  });
});

describe("checkedKeysOnLoad", () => {
  const rows = [
    { key: "a", sendable: true },
    { key: "b", sendable: false },
    { key: "c", sendable: true },
  ];

  it("조건 탭은 보낼 수 있는 사람 전부", () => {
    expect(checkedKeysOnLoad("filter", rows)).toEqual(["a", "c"]);
  });

  it("목록에서 고르기는 비운다 — 직접 체크하는 탭", () => {
    expect(checkedKeysOnLoad("pick", rows)).toEqual([]);
  });

  it("붙여넣기는 비운다(호출부가 따로 채운다)", () => {
    expect(checkedKeysOnLoad("paste", rows)).toEqual([]);
  });
});

describe("canProceedWithTargets", () => {
  it("조회 중이면 인원이 있어도 다음 단계·발송을 막는다", () => {
    expect(canProceedWithTargets({ loading: true, selectedCount: 12 })).toBe(false);
  });

  it("조회 실패면 막는다", () => {
    expect(canProceedWithTargets({ loading: false, selectedCount: 12, loadError: "503" })).toBe(false);
  });

  it("조회가 끝났고 한 명 이상이면 진행", () => {
    expect(canProceedWithTargets({ loading: false, selectedCount: 1 })).toBe(true);
    expect(canProceedWithTargets({ loading: false, selectedCount: 0 })).toBe(false);
  });
});

describe("step1ListPhase", () => {
  it("조회 중이면 오류 글이 있어도 불러오는 중", () => {
    expect(step1ListPhase({ loading: true, loadError: "503" })).toBe("loading");
    expect(step1ListPhase({ loading: true })).toBe("loading");
  });

  it("조회가 끝났고 오류면 목록·통계를 숨긴다", () => {
    expect(step1ListPhase({ loading: false, loadError: "대상을 불러오지 못했어요" })).toBe("error");
  });

  it("조회가 끝났고 오류가 없으면 목록", () => {
    expect(step1ListPhase({ loading: false })).toBe("ready");
    expect(step1ListPhase({ loading: false, loadError: "" })).toBe("ready");
  });
});

describe("copy", () => {
  it("조회 중·직접 고르기 안내 문구가 고정이다", () => {
    expect(LOADING_TARGETS_HINT).toBe("대상을 불러오는 중이에요");
    expect(PICK_TAB_HINT).toBe("보낼 분을 직접 체크해 주세요");
  });
});

describe("nextOptionIndex", () => {
  it("아래·위로 순환한다", () => {
    expect(nextOptionIndex(0, 3, 1)).toBe(1);
    expect(nextOptionIndex(2, 3, 1)).toBe(0);
    expect(nextOptionIndex(0, 3, -1)).toBe(2);
  });

  it("아직 가리키는 칸이 없으면 방향의 끝에서 시작한다", () => {
    expect(nextOptionIndex(-1, 3, 1)).toBe(0);
    expect(nextOptionIndex(-1, 3, -1)).toBe(2);
  });
});

describe("multiSelectTriggerKey", () => {
  it("닫힌 상태에서 방향키·Enter·Space 로 연다", () => {
    expect(multiSelectTriggerKey("ArrowDown", false, -1, 4)).toEqual({ type: "open", index: 0 });
    expect(multiSelectTriggerKey("ArrowUp", false, -1, 4)).toEqual({ type: "open", index: 3 });
    expect(multiSelectTriggerKey("Enter", false, -1, 4)).toEqual({ type: "open", index: 0 });
    expect(multiSelectTriggerKey(" ", false, -1, 4)).toEqual({ type: "open", index: 0 });
  });

  it("열린 상태에서 방향키는 이동, Enter/Space 는 토글, Esc 는 닫기", () => {
    expect(multiSelectTriggerKey("ArrowDown", true, 0, 3)).toEqual({ type: "move", index: 1 });
    expect(multiSelectTriggerKey("ArrowUp", true, 0, 3)).toEqual({ type: "move", index: 2 });
    expect(multiSelectTriggerKey("Enter", true, 1, 3)).toEqual({ type: "toggle" });
    expect(multiSelectTriggerKey(" ", true, 1, 3)).toEqual({ type: "toggle" });
    expect(multiSelectTriggerKey("Escape", true, 1, 3)).toEqual({ type: "close" });
    expect(multiSelectTriggerKey("Home", true, 2, 3)).toEqual({ type: "move", index: 0 });
    expect(multiSelectTriggerKey("End", true, 0, 3)).toEqual({ type: "move", index: 2 });
  });
});

describe("multiSelectOptionKey", () => {
  it("옵션에서 Enter/Space 토글, 방향키 이동, Esc 닫기", () => {
    expect(multiSelectOptionKey("Enter", 1, 3)).toEqual({ type: "toggle" });
    expect(multiSelectOptionKey(" ", 1, 3)).toEqual({ type: "toggle" });
    expect(multiSelectOptionKey("ArrowDown", 1, 3)).toEqual({ type: "move", index: 2 });
    expect(multiSelectOptionKey("ArrowUp", 0, 3)).toEqual({ type: "move", index: 2 });
    expect(multiSelectOptionKey("Escape", 1, 3)).toEqual({ type: "close" });
  });
});
