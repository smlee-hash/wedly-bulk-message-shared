import { describe, expect, it } from "vitest";
import {
  LIST_DEBOUNCE_MS,
  MANAGER_ALL,
  MANAGER_MINE,
  LOADING_TARGETS_HINT,
  MANAGER_LOCKED_LABEL,
  SEARCH_PLACEHOLDER,
  canProceedWithTargets,
  droppedSummary,
  hiddenPickedCount,
  reconcilePicked,
  step1ListPhase,
  listFetchDelayMs,
  managerQueryOf,
  managerSelectOptions,
  mergeManagerNames,
  nextManagerLock,
  resolveManagerScope,
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
  it("기본은 내 고객 — 서버가 로그인 이름으로 거른다", () => {
    expect(managerQueryOf(MANAGER_MINE)).toEqual({ onlyMine: true });
  });

  it("전체는 onlyMine:false, 이름 없음", () => {
    expect(managerQueryOf(MANAGER_ALL)).toEqual({ onlyMine: false });
  });

  it("이름을 고르면 그 이름으로", () => {
    expect(managerQueryOf("김서연")).toEqual({ onlyMine: false, managerName: "김서연" });
    expect(managerQueryOf("이충훈")).toEqual({ onlyMine: false, managerName: "이충훈" });
    expect(managerQueryOf("  우수하  ")).toEqual({ onlyMine: false, managerName: "우수하" });
  });
});

describe("nextManagerLock — 파트너 앱 담당 잠금", () => {
  it("서버가 잠갔다고 하면 잠근다", () => {
    expect(nextManagerLock(false, { ok: true, lockedToMe: true })).toBe(true);
  });

  it("서버가 안 잠갔거나 값을 안 주면(ERP) 고르개를 그린다", () => {
    expect(nextManagerLock(false, { ok: true, lockedToMe: false })).toBe(false);
    expect(nextManagerLock(false, { ok: true })).toBe(false);
    expect(nextManagerLock(true, { ok: true, lockedToMe: false })).toBe(false);
  });

  it("조회가 실패하면 지금 상태를 그대로 지킨다 — 잠긴 사람에게 고르개가 나타나면 안 된다", () => {
    expect(nextManagerLock(true, { ok: false })).toBe(true);
    expect(nextManagerLock(false, { ok: false })).toBe(false);
    // 실패 응답에 값이 섞여 와도 안 믿는다
    expect(nextManagerLock(true, { ok: false, lockedToMe: false })).toBe(true);
  });

  it("잠긴 자리에 뜨는 글이 고정이다", () => {
    expect(MANAGER_LOCKED_LABEL).toBe("내 고객만 볼 수 있어요");
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
  it("첫 조회는 기다리지 않는다", () => {
    expect(listFetchDelayMs({ hadListQuery: false })).toBe(0);
    expect(listFetchDelayMs({ hadListQuery: false, managerChanged: true, searchChanged: true })).toBe(0);
  });

  it("담당이 바뀌면 잠깐 기다린다", () => {
    expect(listFetchDelayMs({ hadListQuery: true, managerChanged: true })).toBe(LIST_DEBOUNCE_MS);
    expect(LIST_DEBOUNCE_MS).toBe(300);
  });

  it("검색어가 바뀌면 잠깐 기다린다 — 한 글자마다 서버를 부르지 않게", () => {
    expect(listFetchDelayMs({ hadListQuery: true, searchChanged: true })).toBe(LIST_DEBOUNCE_MS);
  });

  it("아무것도 안 바뀌었으면 기다리지 않는다", () => {
    expect(listFetchDelayMs({ hadListQuery: true })).toBe(0);
    expect(listFetchDelayMs({ hadListQuery: true, managerChanged: false, searchChanged: false })).toBe(0);
  });
});

describe("hiddenPickedCount", () => {
  it("고른 사람 중 지금 목록에 없는 수를 센다", () => {
    expect(hiddenPickedCount(["a", "b", "c"], ["a", "c"])).toBe(1);
  });

  it("전부 보이면 0", () => {
    expect(hiddenPickedCount(["a"], ["a", "b"])).toBe(0);
  });

  it("아무도 안 골랐으면 0", () => {
    expect(hiddenPickedCount([], ["a", "b"])).toBe(0);
  });

  it("목록이 비면 고른 사람이 전부 안 보이는 것으로 센다", () => {
    expect(hiddenPickedCount(["a", "b"], [])).toBe(2);
  });
});

describe("reconcilePicked", () => {
  const row = (key: string) => ({ key, name: `${key}회사` });
  const pickedOf = (...keys: string[]) =>
    new Map(keys.map((k) => [k, row(k)] as const));
  const incoming = (
    ...rows: Array<{ key: string; sendable: boolean; excludeReason?: string }>
  ) => rows.map((r) => ({ excludeReason: "", ...r }));

  it("ⓐ 목록에 있고 여전히 보낼 수 있으면 그대로 둔다", () => {
    const before = pickedOf("a", "b");
    const out = reconcilePicked(before, incoming({ key: "a", sendable: true }, { key: "b", sendable: true }));
    expect([...out.picked.keys()]).toEqual(["a", "b"]);
    expect(out.dropped).toEqual([]);
    // 뺄 사람이 없으면 받은 Map 을 그대로 — 화면이 괜히 다시 그려지지 않게
    expect(out.picked).toBe(before);
  });

  it("ⓑ 목록에 있는데 수신거부로 바뀌면 명단에서 뺀다", () => {
    const before = pickedOf("a", "b");
    const out = reconcilePicked(
      before,
      incoming({ key: "a", sendable: true }, { key: "b", sendable: false, excludeReason: "수신거부" }),
    );
    expect([...out.picked.keys()]).toEqual(["a"]);
    expect(out.dropped).toEqual([{ key: "b", reason: "수신거부" }]);
    expect(out.picked).not.toBe(before); // 원본은 안 건드린다
    expect([...before.keys()]).toEqual(["a", "b"]);
  });

  it("ⓒ 목록에 아예 없으면 그대로 둔다 — 검색·담당 때문에 안 보이는 것뿐이다", () => {
    const out = reconcilePicked(pickedOf("a", "b"), incoming({ key: "a", sendable: true }));
    expect([...out.picked.keys()]).toEqual(["a", "b"]);
    expect(out.dropped).toEqual([]);
  });

  it("ⓓ 뺀 사유별 건수가 맞는다", () => {
    const out = reconcilePicked(
      pickedOf("a", "b", "c", "d"),
      incoming(
        { key: "a", sendable: false, excludeReason: "수신거부" },
        { key: "b", sendable: false, excludeReason: "중복 번호" },
        { key: "c", sendable: false, excludeReason: "수신거부" },
        { key: "d", sendable: true },
      ),
    );
    expect([...out.picked.keys()]).toEqual(["d"]);
    expect(droppedSummary(out.dropped)).toBe("수신거부 2 · 중복 번호 1");
  });

  it("사유가 비어 있어도 「제외」로 알려 준다 — 조용히 사라지지 않게", () => {
    const out = reconcilePicked(pickedOf("a"), incoming({ key: "a", sendable: false, excludeReason: "" }));
    expect(out.dropped).toEqual([{ key: "a", reason: "제외" }]);
  });

  it("고른 사람이 없으면 아무 일도 없다", () => {
    const before = new Map<string, { key: string; name: string }>();
    const out = reconcilePicked(before, incoming({ key: "a", sendable: false, excludeReason: "수신거부" }));
    expect(out.picked).toBe(before);
    expect(out.dropped).toEqual([]);
  });
});

describe("droppedSummary", () => {
  it("아무도 안 빠졌으면 빈 글", () => {
    expect(droppedSummary([])).toBe("");
  });

  it("한 사유면 그 사유와 건수", () => {
    expect(droppedSummary([{ key: "a", reason: "수신거부" }])).toBe("수신거부 1");
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
  it("조회 중 안내·검색 칸 예시 문구가 고정이다", () => {
    expect(LOADING_TARGETS_HINT).toBe("대상을 불러오는 중이에요");
    expect(SEARCH_PLACEHOLDER).toBe("예) 위들리 · 김대표 · 4567");
  });
});
