// 1단계(받을 분 고르기) — 담당 조회 파라미터·진행상태 버튼 라벨·키보드 판정.

export const MANAGER_ALL = "__all__";
export const MANAGER_MINE = "__mine__";
export const LIST_DEBOUNCE_MS = 300;
export const PASTE_DEBOUNCE_MS = 500;
export const LOADING_TARGETS_HINT = "대상을 불러오는 중이에요";
export const PICK_TAB_HINT = "보낼 분을 직접 체크해 주세요";

/** 목록 탭: 첫 진입·탭 복귀는 즉시, 진행상태·담당 변경만 디바운스. */
export function listFetchDelayMs(input: {
  hadListQuery: boolean;
  statusesChanged: boolean;
  managerChanged?: boolean;
}): number {
  if (!input.hadListQuery) return 0;
  if (input.statusesChanged || input.managerChanged) return LIST_DEBOUNCE_MS;
  return 0;
}

/** 조건 탭 조회 직후 체크 — 서버가 이미 담당으로 거른 뒤의 보낼 수 있는 사람 전부. */
export function checkedKeysOnLoad(
  tab: "filter" | "pick" | "paste",
  targets: Array<{ key: string; sendable: boolean }>,
): string[] {
  if (tab !== "filter") return [];
  return targets.filter((t) => t.sendable).map((t) => t.key);
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

/** 진행상태를 하나도 안 골랐을 때 트리거 버튼에 보이는 글. */
export const STATUS_PLACEHOLDER = "진행상태 선택";

/** 0개 → ""(placeholder), 그 외 → 고른 값을 모두 이어 붙인 글(접근성). 화면은 칩으로 그린다. */
export function statusTriggerLabel(selected: string[]): string {
  return selected.join(", ");
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

export function nextOptionIndex(current: number, length: number, dir: 1 | -1): number {
  if (length <= 0) return 0;
  if (current < 0 || current >= length) return dir === 1 ? 0 : length - 1;
  return (current + dir + length) % length;
}

export type MultiSelectKeyAction =
  | { type: "none" }
  | { type: "open"; index: number }
  | { type: "close" }
  | { type: "move"; index: number }
  | { type: "toggle" };

export function multiSelectTriggerKey(
  key: string,
  open: boolean,
  highlight: number,
  length: number,
): MultiSelectKeyAction {
  if (!open) {
    if (key === "Enter" || key === " " || key === "ArrowDown") {
      return { type: "open", index: 0 };
    }
    if (key === "ArrowUp") return { type: "open", index: Math.max(0, length - 1) };
    return { type: "none" };
  }
  if (key === "Escape") return { type: "close" };
  if (key === "ArrowDown") return { type: "move", index: nextOptionIndex(highlight, length, 1) };
  if (key === "ArrowUp") return { type: "move", index: nextOptionIndex(highlight, length, -1) };
  if (key === "Home") return { type: "move", index: 0 };
  if (key === "End") return { type: "move", index: Math.max(0, length - 1) };
  if (key === "Enter" || key === " ") return { type: "toggle" };
  return { type: "none" };
}

export function multiSelectOptionKey(
  key: string,
  index: number,
  length: number,
): MultiSelectKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key === "Enter" || key === " ") return { type: "toggle" };
  if (key === "ArrowDown") return { type: "move", index: nextOptionIndex(index, length, 1) };
  if (key === "ArrowUp") return { type: "move", index: nextOptionIndex(index, length, -1) };
  if (key === "Home") return { type: "move", index: 0 };
  if (key === "End") return { type: "move", index: Math.max(0, length - 1) };
  return { type: "none" };
}
