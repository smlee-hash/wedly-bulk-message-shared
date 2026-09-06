import { describe, expect, it } from "vitest";
import {
  CHANNEL_OPTIONS,
  LIST_DEBOUNCE_MS,
  MANAGER_ALL,
  MANAGER_MINE,
  LOADING_TARGETS_HINT,
  MANAGER_LOCKED_LABEL,
  MANAGER_UNKNOWN_LABEL,
  SEARCH_PLACEHOLDER,
  applyManualEmail,
  canProceedWithTargets,
  channelExcludeReason,
  channelNote,
  droppedSummary,
  emailMode,
  emailTargetCounts,
  excludeChipVariant,
  hiddenPickedCount,
  isRefunded,
  managerControl,
  mergeDropped,
  pickedCounts,
  reconcilePicked,
  sendableForChannel,
  statusBadgesOf,
  step1ListPhase,
  targetForChannel,
  validateManualEmail,
  listFetchDelayMs,
  managerQueryOf,
  managerSelectOptions,
  mergeManagerNames,
  nextManagerLock,
  resolveManagerScope,
  uniqueManagers,
  type BulkChannel,
  type ChannelTarget,
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
    expect(nextManagerLock(null, { ok: true, data: { lockedToMe: true } })).toBe(true);
    expect(nextManagerLock(false, { ok: true, data: { lockedToMe: true } })).toBe(true);
  });

  it("서버가 「안 잠갔다」고 **말하면** 고르개를 그린다", () => {
    expect(nextManagerLock(null, { ok: true, data: { lockedToMe: false } })).toBe(false);
    expect(nextManagerLock(true, { ok: true, data: { lockedToMe: false } })).toBe(false);
  });

  it("★칸이 아예 없으면(옛 서버) 이전 값을 지킨다 — 배포 중간에 잠금이 풀리면 안 된다", () => {
    // 잠겨 있었으면 잠긴 채
    expect(nextManagerLock(true, { ok: true, data: { targets: [], managers: [] } })).toBe(true);
    // 모름이면 모름 그대로(고르개를 안 그린다)
    expect(nextManagerLock(null, { ok: true, data: { targets: [] } })).toBeNull();
    expect(managerControl(nextManagerLock(null, { ok: true, data: {} }))).toBe("loading");
    // 칸이 있으면 그 값을 그대로 반영한다
    expect(nextManagerLock(true, { ok: true, data: { lockedToMe: false } })).toBe(false);
    // 덩어리가 아예 없어도 「모른다」로 본다
    expect(nextManagerLock(true, { ok: true })).toBe(true);
    expect(nextManagerLock(true, { ok: true, data: null })).toBe(true);
  });

  it("조회가 실패하면 지금 상태를 그대로 지킨다 — 잠긴 사람에게 고르개가 나타나면 안 된다", () => {
    expect(nextManagerLock(true, { ok: false })).toBe(true);
    expect(nextManagerLock(false, { ok: false })).toBe(false);
    // 실패 응답에 값이 섞여 와도 안 믿는다
    expect(nextManagerLock(true, { ok: false, data: { lockedToMe: false } })).toBe(true);
  });

  it("★첫 조회가 실패하면 「모름」이 그대로 남는다 — 파트너 앱에 고르개가 뜨면 안 된다", () => {
    expect(nextManagerLock(null, { ok: false })).toBeNull();
    expect(managerControl(nextManagerLock(null, { ok: false }))).toBe("loading");
  });

  it("모르는 동안엔 고르개를 아예 안 그린다", () => {
    expect(managerControl(null)).toBe("loading");
    expect(managerControl(true)).toBe("locked");
    expect(managerControl(false)).toBe("picker");
  });

  it("자리에 뜨는 글이 고정이다", () => {
    expect(MANAGER_LOCKED_LABEL).toBe("내 고객만 볼 수 있어요");
    expect(MANAGER_UNKNOWN_LABEL).toBe("확인 중…");
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
  type Row = { key: string; representative: string; sendable: boolean; excludeReason: string };
  const row = (key: string, extra: Partial<Row> = {}): Row => ({
    key,
    representative: `${key}대표`,
    sendable: true,
    excludeReason: "",
    ...extra,
  });
  const pickedOf = (...keys: string[]) => new Map(keys.map((k) => [k, row(k)] as const));
  const incoming = (...rows: Row[]) => rows.map((r) => ({ key: r.key, row: r }));

  it("ⓐ 목록에 있고 값도 그대로면 손대지 않는다", () => {
    const before = pickedOf("a", "b");
    const out = reconcilePicked(before, incoming(row("a"), row("b")));
    expect([...out.picked.keys()]).toEqual(["a", "b"]);
    expect(out.dropped).toEqual([]);
    // 바뀐 게 없으면 받은 Map 을 그대로 — 화면이 괜히 다시 그려지지 않게
    expect(out.picked).toBe(before);
  });

  it("ⓑ 목록에 있는데 수신거부로 바뀌면 명단에서 뺀다", () => {
    const before = pickedOf("a", "b");
    const out = reconcilePicked(
      before,
      incoming(row("a"), row("b", { sendable: false, excludeReason: "수신거부" })),
    );
    expect([...out.picked.keys()]).toEqual(["a"]);
    expect(out.dropped).toEqual([{ key: "b", reason: "수신거부" }]);
    expect(out.picked).not.toBe(before); // 원본은 안 건드린다
    expect([...before.keys()]).toEqual(["a", "b"]);
  });

  it("ⓒ 목록에 아예 없으면 그대로 둔다 — 검색·담당 때문에 안 보이는 것뿐이다", () => {
    const out = reconcilePicked(pickedOf("a", "b"), incoming(row("a")));
    expect([...out.picked.keys()]).toEqual(["a", "b"]);
    expect(out.dropped).toEqual([]);
  });

  it("ⓓ 뺀 사유별 건수가 맞는다", () => {
    const out = reconcilePicked(
      pickedOf("a", "b", "c", "d"),
      incoming(
        row("a", { sendable: false, excludeReason: "수신거부" }),
        row("b", { sendable: false, excludeReason: "중복 번호" }),
        row("c", { sendable: false, excludeReason: "수신거부" }),
        row("d"),
      ),
    );
    expect([...out.picked.keys()]).toEqual(["d"]);
    expect(droppedSummary(out.dropped)).toBe("수신거부 2 · 중복 번호 1");
  });

  it("ⓔ 여전히 보낼 수 있으면 **새 줄로 갈아 끼운다** — 표엔 새 이름, 명단엔 옛 이름이면 안 된다", () => {
    const before = pickedOf("a");
    const fresh = row("a", { representative: "새대표" });
    const out = reconcilePicked(before, incoming(fresh));
    expect(out.picked.get("a")?.representative).toBe("새대표");
    expect(out.picked.get("a")).toBe(fresh);
    expect(out.dropped).toEqual([]);
    expect(out.picked).not.toBe(before);
    // 목록에 없는 줄은 갈아 끼울 새 값이 없으니 옛 값 그대로
    const kept = reconcilePicked(pickedOf("a", "z"), incoming(fresh)).picked.get("z");
    expect(kept?.representative).toBe("z대표");
  });

  it("사유가 비어 있어도 「제외」로 알려 준다 — 조용히 사라지지 않게", () => {
    const out = reconcilePicked(pickedOf("a"), incoming(row("a", { sendable: false })));
    expect(out.dropped).toEqual([{ key: "a", reason: "제외" }]);
  });

  it("고른 사람이 없으면 아무 일도 없다", () => {
    const before = new Map<string, Row>();
    const out = reconcilePicked(before, incoming(row("a", { sendable: false, excludeReason: "수신거부" })));
    expect(out.picked).toBe(before);
    expect(out.dropped).toEqual([]);
  });
});

describe("mergeDropped — 알림을 쌓는다", () => {
  const d = (key: string, reason: string) => ({ key, reason });

  it("다음 조회가 빈 손이어도 앞서 알린 것을 지우지 않는다", () => {
    const prev = [d("a", "수신거부")];
    expect(mergeDropped(prev, [])).toBe(prev);
  });

  it("새로 빠진 사람을 뒤에 붙인다", () => {
    expect(mergeDropped([d("a", "수신거부")], [d("b", "중복 번호")])).toEqual([
      d("a", "수신거부"),
      d("b", "중복 번호"),
    ]);
  });

  it("같은 사람이 또 오면 한 줄로 합치고 사유는 최신으로", () => {
    const out = mergeDropped([d("a", "중복 번호"), d("b", "수신거부")], [d("a", "수신거부")]);
    expect(out).toEqual([d("a", "수신거부"), d("b", "수신거부")]);
    expect(droppedSummary(out)).toBe("수신거부 2");
  });

  it("세 번에 걸쳐 빠져도 건수가 다 남는다 — 검색어를 천천히 칠 때의 실제 흐름", () => {
    let acc = mergeDropped([], [d("a", "수신거부")]);
    acc = mergeDropped(acc, []); // 두 번째 응답은 빈 손
    acc = mergeDropped(acc, [d("b", "중복 번호")]);
    expect(acc).toHaveLength(2);
    expect(droppedSummary(acc)).toBe("수신거부 1 · 중복 번호 1");
  });

  it("★다시 보낼 수 있게 되면 알림에서 지운다 — 빠짐 → 고쳐짐 → 사라짐", () => {
    // ㉠ 중복 번호로 빠진다
    let acc = mergeDropped([], [d("a", "중복 번호")]);
    expect(droppedSummary(acc)).toBe("중복 번호 1");
    // ㉡ 번호를 고쳐 다시 보낼 수 있게 됐다(이번 목록에서 sendable)
    acc = mergeDropped(acc, [], ["a"]);
    expect(acc).toEqual([]);
    // ㉢ 「체크가 잠깁니다」가 사실이 아니게 된 알림이 남아 있으면 안 된다
    expect(droppedSummary(acc)).toBe("");
  });

  it("되살아난 사람만 지우고 나머지는 남긴다", () => {
    const acc = mergeDropped([d("a", "수신거부"), d("b", "중복 번호")], [], ["b"]);
    expect(acc).toEqual([d("a", "수신거부")]);
  });

  it("지울 것도 더할 것도 없으면 받은 배열을 그대로 돌려준다", () => {
    const prev = [d("a", "수신거부")];
    expect(mergeDropped(prev, [])).toBe(prev);
    expect(mergeDropped(prev, [], ["z"])).toBe(prev);
    expect(mergeDropped(prev, [d("a", "수신거부")])).not.toBe(prev); // 사유 갱신은 새 배열
  });
});

describe("statusBadgesOf — 색과 글자가 같은 값을 보고, 다른 상태를 숨기지 않는다", () => {
  it("★「계약완료」가 있어도 다른 상태를 숨기지 않는다 — 환불일이 빈 「환불」 줄을 못 보면 안 된다", () => {
    expect(statusBadgesOf(["계약완료", "환불"])).toEqual([
      { label: "계약완료", variant: "green" },
      { label: "환불", variant: "default" },
    ]);
    // 계약 고객이라는 게 요점이라 「계약완료」가 앞에 선다(원래 순서가 뒤여도)
    expect(statusBadgesOf(["진행중", "계약완료"])).toEqual([
      { label: "계약완료", variant: "green" },
      { label: "진행중", variant: "default" },
    ]);
  });

  it("하나뿐이면 하나만", () => {
    expect(statusBadgesOf(["계약완료"])).toEqual([{ label: "계약완료", variant: "green" }]);
    expect(statusBadgesOf(["진행중"])).toEqual([{ label: "진행중", variant: "default" }]);
  });

  it("많으면 「+N」으로 접는다 — 표 칸이 좁다", () => {
    expect(statusBadgesOf(["계약완료", "환불", "보류", "상담중"])).toEqual([
      { label: "계약완료", variant: "green" },
      { label: "환불", variant: "default" },
      { label: "+2", variant: "default" },
    ]);
    expect(statusBadgesOf(["가", "나", "다"], 1)).toEqual([
      { label: "가", variant: "default" },
      { label: "+2", variant: "default" },
    ]);
  });

  it("빈 값·공백·중복은 없앤다", () => {
    expect(statusBadgesOf([])).toEqual([]);
    expect(statusBadgesOf(["", "   "])).toEqual([]);
    expect(statusBadgesOf(["", "계약완료"])).toEqual([{ label: "계약완료", variant: "green" }]);
    expect(statusBadgesOf(["환불", " 환불 ", "환불"])).toEqual([{ label: "환불", variant: "default" }]);
  });

  it("초록은 「계약완료」 딱지에만 — 색과 글자가 어긋나는 짝이 하나도 없다", () => {
    const cases = [["진행중"], ["환불"], ["조회완료", "상담중"], ["계약완료", "환불"], ["계약완료", "가", "나"]];
    for (const statuses of cases) {
      for (const badge of statusBadgesOf(statuses)) {
        expect(badge.variant === "green").toBe(badge.label === "계약완료");
      }
    }
  });
});

describe("isRefunded — 판정은 환불일 하나뿐", () => {
  it("환불일이 채워졌으면 환불", () => {
    expect(isRefunded({ refundedAt: "2026-06-02" })).toBe(true);
  });

  it("비었거나 공백뿐이면 아니다", () => {
    expect(isRefunded({ refundedAt: "" })).toBe(false);
    expect(isRefunded({ refundedAt: "   " })).toBe(false);
    expect(isRefunded({ refundedAt: null })).toBe(false);
    expect(isRefunded({})).toBe(false);
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

// ─────────────────────────────────────────────────── 채널(알림톡·채팅 / 이메일 / 둘 다)

/** 시험용 줄 한 개 — 필요한 칸만 바꿔 쓴다. */
function er(over: Partial<ChannelTarget & { rowId: string }> = {}) {
  return {
    rowId: "r1",
    sendable: true,
    excludeReason: "",
    email: "a@x.kr",
    emailSource: "basic",
    emailSendable: true,
    emailExcludeReason: "",
    ...over,
  };
}

describe("CHANNEL_OPTIONS · channelNote", () => {
  it("구간 단추 3개의 값·글자가 시안 순서 그대로다", () => {
    expect(CHANNEL_OPTIONS).toEqual([
      { value: "chat", label: "알림톡·채팅" },
      { value: "email", label: "이메일" },
      { value: "both", label: "둘 다" },
    ]);
  });

  it("채널마다 설명이 한 줄씩 있고 서로 다르다", () => {
    const notes = ["chat", "email", "both"].map((c) => channelNote(c as BulkChannel));
    expect(new Set(notes).size).toBe(3);
    for (const n of notes) expect(n.length).toBeGreaterThan(10);
    expect(channelNote("chat")).toContain("지금과 같습니다");
    expect(channelNote("email")).toContain("주소가 있는 분에게만");
    expect(channelNote("both")).toContain("두 통로로 받습니다");
  });

  it("이메일 열·카드를 그리는 채널은 email·both 둘뿐이다", () => {
    expect(emailMode("chat")).toBe(false);
    expect(emailMode("email")).toBe(true);
    expect(emailMode("both")).toBe(true);
  });
});

describe("sendableForChannel", () => {
  const phoneOnly = er({ emailSendable: false, email: "", emailExcludeReason: "이메일 없음" });
  const emailOnly = er({ sendable: false, excludeReason: "번호 없음" });
  const neither = er({
    sendable: false,
    excludeReason: "번호 없음",
    emailSendable: false,
    email: "",
    emailExcludeReason: "이메일 없음",
  });

  it("알림톡·채팅은 번호만 본다", () => {
    expect(sendableForChannel(phoneOnly, "chat")).toBe(true);
    expect(sendableForChannel(emailOnly, "chat")).toBe(false);
  });

  it("이메일은 주소만 본다", () => {
    expect(sendableForChannel(phoneOnly, "email")).toBe(false);
    expect(sendableForChannel(emailOnly, "email")).toBe(true);
  });

  it("둘 다는 하나만 되어도 보낼 수 있다 — 둘 다 안 될 때만 못 보낸다", () => {
    expect(sendableForChannel(phoneOnly, "both")).toBe(true);
    expect(sendableForChannel(emailOnly, "both")).toBe(true);
    expect(sendableForChannel(neither, "both")).toBe(false);
  });
});

describe("emailTargetCounts", () => {
  const rows = [
    er({ rowId: "1" }), // 둘 다 됨
    er({ rowId: "2", emailSendable: false, email: "", emailExcludeReason: "이메일 없음" }), // 번호만
    er({ rowId: "3", sendable: false, excludeReason: "번호 없음" }), // 이메일만
    er({
      rowId: "4",
      sendable: false,
      excludeReason: "수신거부",
      emailSendable: false,
      emailExcludeReason: "수신거부",
    }), // 둘 다 안 됨
  ];

  it("계약·알림톡 가능·이메일 가능은 채널과 상관없이 같은 수다", () => {
    for (const ch of ["chat", "email", "both"] as const) {
      const c = emailTargetCounts(rows, ch);
      expect(c.contract).toBe(4);
      expect(c.chatOk).toBe(2);
      expect(c.emailOk).toBe(2);
    }
  });

  it("자동 제외는 채널 기준으로 센다 — chat 은 번호, email 은 주소, both 는 둘 다 안 되는 줄", () => {
    expect(emailTargetCounts(rows, "chat").excluded).toBe(2);
    expect(emailTargetCounts(rows, "email").excluded).toBe(2);
    expect(emailTargetCounts(rows, "both").excluded).toBe(1);
  });

  it("빈 목록은 전부 0", () => {
    expect(emailTargetCounts([], "both")).toEqual({ contract: 0, chatOk: 0, emailOk: 0, excluded: 0 });
  });
});

describe("channelExcludeReason · excludeChipVariant", () => {
  it("보낼 수 있으면 사유가 없다", () => {
    expect(channelExcludeReason(er(), "chat")).toBe("");
    expect(channelExcludeReason(er(), "email")).toBe("");
    expect(channelExcludeReason(er(), "both")).toBe("");
  });

  it("채널이 보는 쪽의 사유만 적는다", () => {
    const emailOnly = er({ sendable: false, excludeReason: "번호 없음" });
    expect(channelExcludeReason(emailOnly, "chat")).toBe("번호 없음");
    const phoneOnly = er({ emailSendable: false, email: "", emailExcludeReason: "수신거부" });
    expect(channelExcludeReason(phoneOnly, "email")).toBe("수신거부");
  });

  it("둘 다에서 막힌 줄은 두 사유를 다 적고, 같은 사유면 한 번만 적는다", () => {
    const neither = er({
      sendable: false,
      excludeReason: "번호 없음",
      emailSendable: false,
      email: "",
      emailExcludeReason: "이메일 없음",
    });
    expect(channelExcludeReason(neither, "both")).toBe("번호 없음 · 이메일 없음");
    const bothBlocked = er({
      sendable: false,
      excludeReason: "수신거부",
      emailSendable: false,
      emailExcludeReason: "수신거부",
    });
    expect(channelExcludeReason(bothBlocked, "both")).toBe("수신거부");
  });

  it("사유 글자가 비어 있어도 칩이 빈칸으로 뜨지 않는다", () => {
    expect(channelExcludeReason(er({ sendable: false }), "chat")).toBe("제외");
    expect(channelExcludeReason(er({ emailSendable: false }), "email")).toBe("이메일 없음");
  });

  it("칩 색은 「아직 없음」만 금색, 막힌 것은 빨강이다", () => {
    expect(excludeChipVariant("번호 없음")).toBe("yellow");
    expect(excludeChipVariant("이메일 없음")).toBe("yellow");
    expect(excludeChipVariant("번호 없음 · 이메일 없음")).toBe("yellow");
    expect(excludeChipVariant("수신거부")).toBe("red");
    expect(excludeChipVariant("중복 주소")).toBe("red");
    expect(excludeChipVariant("범위 밖")).toBe("red");
    expect(excludeChipVariant("수신거부 확인 불가")).toBe("red");
    expect(excludeChipVariant("번호 없음 · 수신거부")).toBe("red");
  });
});

describe("targetForChannel", () => {
  it("채널 기준의 발송 가능·사유로 갈아 끼운다", () => {
    const emailOnly = er({ sendable: false, excludeReason: "번호 없음" });
    const forEmail = targetForChannel(emailOnly, "email");
    expect(forEmail.sendable).toBe(true);
    expect(forEmail.excludeReason).toBe("");
  });

  it("바뀔 게 없으면 받은 줄을 그대로 돌려준다 — 화면이 괜히 다시 그려지지 않게", () => {
    const row = er();
    expect(targetForChannel(row, "chat")).toBe(row);
  });
});

describe("applyManualEmail", () => {
  const empty = er({ email: "", emailSource: "", emailSendable: false, emailExcludeReason: "이메일 없음" });

  it("직접 입력한 주소를 얹으면 그 줄은 보낼 수 있는 줄이 된다", () => {
    const out = applyManualEmail(empty, { email: "new@x.kr", persist: true });
    expect(out.email).toBe("new@x.kr");
    expect(out.emailSource).toBe("manual");
    expect(out.emailSendable).toBe(true);
    expect(out.emailExcludeReason).toBe("");
  });

  it("직접 입력이 없으면 받은 줄 그대로다", () => {
    expect(applyManualEmail(empty, undefined)).toBe(empty);
  });
});

describe("validateManualEmail", () => {
  const rows = [
    er({ rowId: "1", email: "" , emailSendable: false, emailExcludeReason: "이메일 없음" }),
    er({ rowId: "2", email: "taken@x.kr" }),
    er({ rowId: "3", email: "stop@x.kr", emailSendable: false, emailExcludeReason: "수신거부" }),
  ];

  it("제대로 된 주소는 통과한다", () => {
    expect(validateManualEmail("new@x.kr", rows, "1")).toBe("");
    expect(validateManualEmail("  NEW@X.KR  ", rows, "1")).toBe("");
  });

  it("형식이 아니면 예시를 곁들여 알린다", () => {
    for (const bad of ["", "abc", "a@b", "a b@x.kr", "@x.kr"]) {
      expect(validateManualEmail(bad, rows, "1")).toBe("이메일 형식이 아니에요 (예: ceo@company.co.kr)");
    }
  });

  it("이 발송의 다른 회사가 쓰는 주소면 중복으로 막는다 — 대소문자·공백은 안 본다", () => {
    expect(validateManualEmail("taken@x.kr", rows, "1")).toBe(
      "이 발송의 다른 회사와 같은 주소예요 — 중복으로 제외돼요",
    );
    expect(validateManualEmail(" TAKEN@X.KR ", rows, "1")).toBe(
      "이 발송의 다른 회사와 같은 주소예요 — 중복으로 제외돼요",
    );
  });

  it("수신거부한 주소는 형식이 맞아도 못 보낸다 — 판정은 서버가 내려준 줄에서 읽는다", () => {
    expect(validateManualEmail("stop@x.kr", rows, "1")).toBe("수신거부한 주소예요 — 보낼 수 없어요");
  });

  it("자기 줄의 주소는 중복으로 세지 않는다", () => {
    expect(validateManualEmail("taken@x.kr", rows, "2")).toBe("");
  });
});

describe("pickedCounts", () => {
  const picked = [
    er({ rowId: "1" }),
    er({ rowId: "2", emailSendable: false, email: "", emailExcludeReason: "이메일 없음" }),
    er({ rowId: "3", sendable: false, excludeReason: "번호 없음" }),
  ];

  it("고른 사람 수는 채널과 상관없이 담은 그대로다", () => {
    for (const ch of ["chat", "email", "both"] as const) {
      expect(pickedCounts(picked, ch).total).toBe(3);
    }
  });

  it("이메일 수는 주소가 있는 줄만, 알림톡·채팅일 때는 0", () => {
    expect(pickedCounts(picked, "chat").email).toBe(0);
    expect(pickedCounts(picked, "email").email).toBe(2);
    expect(pickedCounts(picked, "both").email).toBe(2);
  });

  it("빈 명단은 0", () => {
    expect(pickedCounts([], "both")).toEqual({ total: 0, email: 0 });
  });
});
