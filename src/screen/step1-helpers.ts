// 1단계(받을 분 고르기) — 담당·검색 조회 파라미터와 선택 유지 계산.
//
// 2026-09-04 개편: 탭 3개(조건으로 찾기·목록에서 고르기·번호 붙여넣기)와 진행상태 칸이 없어졌다.
// 대상은 「정부지원금 계약일이 적힌 고객」 하나로 고정되고, 화면은 담당·검색만 보낸다.

export const MANAGER_ALL = "__all__";
export const MANAGER_MINE = "__mine__";
export const LIST_DEBOUNCE_MS = 300;
export const LOADING_TARGETS_HINT = "대상을 불러오는 중이에요";
export const SEARCH_PLACEHOLDER = "예) 위들리 · 김대표 · 4567";

/** 첫 조회는 즉시, 담당·검색 변경만 잠깐 기다린다. */
export function listFetchDelayMs(input: {
  hadListQuery: boolean;
  managerChanged?: boolean;
  searchChanged?: boolean;
}): number {
  if (!input.hadListQuery) return 0;
  if (input.managerChanged || input.searchChanged) return LIST_DEBOUNCE_MS;
  return 0;
}

/** 고른 사람 중 지금 목록에 안 보이는 수 — 화면이 「그중 N명은 안 보여요」로 알린다. */
export function hiddenPickedCount(pickedKeys: string[], visibleKeys: string[]): number {
  const shown = new Set(visibleKeys);
  return pickedKeys.filter((k) => !shown.has(k)).length;
}

/** 명단에서 빠진 한 사람 — 열쇠와 빠진 사유(수신거부·중복 번호 …). */
export interface PickedDrop {
  key: string;
  reason: string;
}

/**
 * 새 목록을 받을 때마다 고른 명단을 손본다.
 *
 * ★규칙 두 가지가 서로 반대 방향이라 헷갈리기 쉽다 —
 *  ㉠ **이번 목록에 있는데 보낼 수 없게 바뀌었으면 뺀다.** 수신거부한 분이 「보낼 사람」으로
 *     세어지면 담당자가 오해한다. 서버가 발송 직전 또 거른다는 것과 별개로 화면이 먼저 정직해야 한다.
 *  ㉡ **이번 목록에 아예 없으면 그대로 둔다.** 검색·담당을 바꿔 안 보이는 것일 뿐 자격이 사라진 게
 *     아니다. 여기서 빼면 「담아 두기」가 통째로 깨진다.
 *
 * 뺄 사람이 없으면 **받은 Map 을 그대로** 돌려준다 — 화면이 괜히 다시 그려지지 않게.
 */
export function reconcilePicked<T>(
  picked: Map<string, T>,
  incoming: Array<{ key: string; sendable: boolean; excludeReason: string }>,
): { picked: Map<string, T>; dropped: PickedDrop[] } {
  const byKey = new Map<string, { sendable: boolean; excludeReason: string }>();
  for (const row of incoming) {
    if (!byKey.has(row.key)) byKey.set(row.key, row);
  }
  const dropped: PickedDrop[] = [];
  for (const key of picked.keys()) {
    const row = byKey.get(key);
    if (!row || row.sendable) continue; // 목록에 없음(㉡) 또는 아직 보낼 수 있음 → 유지
    dropped.push({ key, reason: row.excludeReason || "제외" });
  }
  if (dropped.length === 0) return { picked, dropped };
  const next = new Map(picked);
  for (const d of dropped) next.delete(d.key);
  return { picked: next, dropped };
}

/**
 * 「수신거부 2 · 중복 번호 1」 — 사유별 건수를 적는 **문법의 정본**.
 *
 * ★1단계(고르다 빠진 사람)와 3단계(발송이 걸러낸 사람)가 같은 뜻을 말한다. 두 곳이 각자
 *  모양을 만들면 같은 뜻이 두 모양으로 그려진다 — 그래서 여기 한 곳에서만 정한다.
 *  3단계 도우미(step3-helpers)가 이 함수를 가져다 쓴다.
 */
export function reasonCountsText(pairs: Array<{ reason: string; count: number }>): string {
  return pairs.map((p) => `${p.reason} ${p.count}`).join(" · ");
}

/** 「수신거부 2 · 중복 번호 1」 — 왜 몇 명이 명단에서 빠졌는지. */
export function droppedSummary(dropped: PickedDrop[]): string {
  const by = new Map<string, number>();
  for (const d of dropped) by.set(d.reason, (by.get(d.reason) ?? 0) + 1);
  return reasonCountsText([...by.entries()].map(([reason, count]) => ({ reason, count })));
}

export function uniqueManagers(targets: Array<{ manager: string }>): string[] {
  const names = new Set<string>();
  for (const t of targets) {
    const n = t.manager.trim();
    if (n) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "ko"));
}

export function mergeManagerNames(prev: string[], incoming: string[]): string[] {
  return uniqueManagers([...prev, ...incoming].map((manager) => ({ manager })));
}

/** 담당 드롭다운 → 서버 조회 파라미터. 기본 「내 고객」. */
export function managerQueryOf(selected: string): { onlyMine: boolean; managerName?: string } {
  if (selected === MANAGER_MINE) return { onlyMine: true };
  if (selected === MANAGER_ALL) return { onlyMine: false };
  const managerName = selected.trim();
  if (!managerName) return { onlyMine: true };
  return { onlyMine: false, managerName };
}

export type ManagerScope =
  | { mode: "mine" }
  | { mode: "all" }
  | { mode: "named"; managerName: string };

/**
 * 서버가 받는 담당 파라미터 해석.
 * onlyMine 을 안 보내면 내 고객 — 화면만 열어도 전체 고객이 내려가지 않게.
 * onlyMine:true 일 때 클라이언트가 보낸 이름은 쓰지 않는다.
 */
export function resolveManagerScope(body: {
  onlyMine?: boolean;
  managerName?: string;
}): ManagerScope {
  const named = typeof body.managerName === "string" ? body.managerName.trim() : "";
  if (body.onlyMine === true || (body.onlyMine !== false && !named)) {
    return { mode: "mine" };
  }
  if (named) return { mode: "named", managerName: named };
  return { mode: "all" };
}

/** 담당을 고를 수 없는 앱(파트너)에서 고르개 자리에 뜨는 글. */
export const MANAGER_LOCKED_LABEL = "내 고객만 볼 수 있어요";

/**
 * 담당 잠금 상태를 다음 값으로.
 *
 * ★조회가 **실패**하면 지금 상태를 그대로 지킨다 — 한 번 잠긴 사용자에게 갑자기 고르개가
 *  나타나면 「고를 수 있나 보다」로 읽는다. 서버가 값을 안 주는 앱(ERP)은 성공 응답에서
 *  false 가 되어 고르개가 그대로 뜬다.
 */
export function nextManagerLock(
  prev: boolean,
  res: { ok: boolean; lockedToMe?: unknown },
): boolean {
  if (!res.ok) return prev;
  return Boolean(res.lockedToMe);
}

export function managerSelectOptions(
  managerNames: string[],
): Array<{ value: string; label: string }> {
  return [
    { value: MANAGER_MINE, label: "내 고객" },
    { value: MANAGER_ALL, label: "전체" },
    ...uniqueManagers(managerNames.map((manager) => ({ manager }))).map((name) => ({
      value: name,
      label: name,
    })),
  ];
}

/** 조회 중이거나 실패면 다음 단계·발송을 막는다. */
export function canProceedWithTargets(input: {
  loading: boolean;
  selectedCount: number;
  loadError?: string;
}): boolean {
  if (input.loading) return false;
  if (input.loadError) return false;
  return input.selectedCount > 0;
}

export type Step1ListPhase = "loading" | "error" | "ready";

/** 조회 실패면 옛 목록·통계를 그리지 않는다. 조회 중이 오류보다 앞선다. */
export function step1ListPhase(input: { loading: boolean; loadError?: string }): Step1ListPhase {
  if (input.loading) return "loading";
  if (input.loadError) return "error";
  return "ready";
}
