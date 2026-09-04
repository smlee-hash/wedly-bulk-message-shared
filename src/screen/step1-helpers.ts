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

/** 두 줄이 「같은 값」인가 — 칸이 하나라도 다르면 새 줄로 갈아 끼운다(줄은 납작한 객체다). */
function sameRow(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * 새 목록을 받을 때마다 고른 명단을 손본다.
 *
 * ★규칙 **세** 가지가 서로 다른 방향이라 헷갈리기 쉽다 —
 *  ㉠ **이번 목록에 있는데 보낼 수 없게 바뀌었으면 뺀다.** 수신거부한 분이 「보낼 사람」으로
 *     세어지면 담당자가 오해한다. 서버가 발송 직전 또 거른다는 것과 별개로 화면이 먼저 정직해야 한다.
 *  ㉡ **이번 목록에 아예 없으면 그대로 둔다.** 검색·담당을 바꿔 안 보이는 것일 뿐 자격이 사라진 게
 *     아니다. 여기서 빼면 「담아 두기」가 통째로 깨진다.
 *  ㉢ **이번 목록에 있고 여전히 보낼 수 있으면 새 줄로 갈아 끼운다.** 옛 줄을 그대로 두면
 *     표에는 새 대표자명이 보이는데 명단엔 옛 이름이 남아 발송 확인이 어긋난다.
 *
 * 바뀐 게 없으면 **받은 Map 을 그대로** 돌려준다 — 화면이 괜히 다시 그려지지 않게.
 */
export function reconcilePicked<T extends { sendable: boolean; excludeReason: string }>(
  picked: Map<string, T>,
  incoming: Array<{ key: string; row: T }>,
): { picked: Map<string, T>; dropped: PickedDrop[] } {
  const byKey = new Map<string, T>();
  for (const item of incoming) {
    if (!byKey.has(item.key)) byKey.set(item.key, item.row);
  }
  const dropped: PickedDrop[] = [];
  const next = new Map<string, T>();
  let changed = false;
  for (const [key, old] of picked) {
    const fresh = byKey.get(key);
    if (!fresh) {
      next.set(key, old); // ㉡ 목록에 없음 → 그대로
      continue;
    }
    if (!fresh.sendable) {
      dropped.push({ key, reason: fresh.excludeReason || "제외" }); // ㉠ 뺀다
      changed = true;
      continue;
    }
    if (sameRow(old, fresh)) {
      next.set(key, old);
    } else {
      next.set(key, fresh); // ㉢ 갈아 끼운다
      changed = true;
    }
  }
  return changed ? { picked: next, dropped } : { picked, dropped };
}

/**
 * 자동으로 빠진 사람 알림을 **쌓는다**.
 *
 * ★검색어를 천천히 치면 조회가 여러 번 돈다. 새 응답으로 알림을 통째로 갈아치우면 첫 응답이
 *  알린 「수신거부 1명 빠짐」이 곧바로 지워져 담당자는 인원이 왜 줄었는지 영영 못 본다.
 *  같은 사람이 두 번 빠질 일은 없으니 열쇠로 합친다. 비우는 것은 **사람이 닫거나 발송이 시작될 때**뿐.
 * ★단 **다시 보낼 수 있게 된 사람은 지운다**(`sendableKeys`). 중복 번호를 고쳐 되살아났는데도
 *  「명단에서 뺐어요 · 체크가 잠깁니다」가 남아 있으면 그 안내가 거짓말이 된다.
 *
 * 바뀐 게 없으면 받은 배열을 그대로 돌려준다 — 화면이 괜히 다시 그려지지 않게.
 */
export function mergeDropped(
  prev: PickedDrop[],
  next: PickedDrop[],
  sendableKeys: Iterable<string> = [],
): PickedDrop[] {
  const recovered = new Set(sendableKeys);
  const by = new Map<string, PickedDrop>();
  for (const d of prev) {
    if (recovered.has(d.key)) continue; // 되살아난 사람 → 알림에서 지운다
    by.set(d.key, d);
  }
  for (const d of next) by.set(d.key, d); // 자리는 그대로 두고 사유만 최신으로
  const out = [...by.values()];
  if (out.length === prev.length && out.every((d, i) => d === prev[i])) return prev;
  return out;
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
/** 아직 잠금 여부를 모르는 동안 그 자리에 뜨는 글. */
export const MANAGER_UNKNOWN_LABEL = "확인 중…";

/** `null` = 아직 서버 답을 못 받아 **모름**. 모르는 동안엔 고르개를 그리지 않는다. */
export type ManagerLock = boolean | null;

/**
 * 담당 잠금 상태를 다음 값으로.
 *
 * ★조회가 **실패**하면 지금 상태를 그대로 지킨다 — 한 번 잠긴 사용자에게 갑자기 고르개가
 *  나타나면 「고를 수 있나 보다」로 읽는다. 첫 조회가 실패하면 `null`(모름)이 그대로 남아
 *  화면은 고르개 대신 「확인 중」을 그린다.
 * ★응답에 **`lockedToMe` 칸이 아예 없으면**(값을 안 주던 옛 서버) 역시 그대로 지킨다.
 *  `Boolean(data?.lockedToMe)` 로 읽으면 「칸이 없음」과 「false」를 구분하지 못해,
 *  새 화면이 옛 서버와 만나는 배포 중간에 파트너 사용자에게 「전체」 선택지가 뜬다.
 *  그래서 `"lockedToMe" in data` 로 **칸의 있고 없음**을 먼저 가른다.
 */
export function nextManagerLock(prev: ManagerLock, res: { ok: boolean; data?: unknown }): ManagerLock {
  if (!res.ok) return prev;
  const data = res.data;
  if (!data || typeof data !== "object" || !("lockedToMe" in data)) return prev;
  return Boolean((data as { lockedToMe: unknown }).lockedToMe);
}

/** 담당 자리에 무엇을 그릴지 — 모름이면 고르개를 아예 안 그린다(고를 수 없는 것을 내밀지 않게). */
export function managerControl(lock: ManagerLock): "loading" | "locked" | "picker" {
  if (lock === null) return "loading";
  return lock ? "locked" : "picker";
}

/**
 * 이 줄이 환불 고객인가 — **판정 근거는 환불일 하나뿐이다**(2026-09-04 사장님 확정).
 *
 * ★진행상태 글자에 「환불」이 있어도 환불일이 비면 환불로 보지 않는다. 실제로 그런 줄이 있다.
 *  표의 빨간 띠와 3단계 경고가 같은 함수를 봐야 둘이 어긋나지 않는다.
 */
export function isRefunded(row: { refundedAt?: string | null }): boolean {
  return Boolean(row.refundedAt && String(row.refundedAt).trim());
}

/** 한 칸에 늘어놓을 딱지 수 — 넘치면 「+N」으로 접는다(표 칸이 좁다). */
export const STATUS_BADGES_SHOWN = 2;

/**
 * 표의 진행상태 딱지 — **딱지마다 색과 글자가 같은 값을 본다.**
 *
 * ★두 번 데였다.
 *  ㉠ 색은 배열 전체에 「계약완료」가 있는지로 정하고 글자는 첫 값을 그려서
 *     `["진행중","계약완료"]` 가 **초록색 「진행중」** 으로 떴다 — 색이 거짓말.
 *  ㉡ 그걸 고치며 「계약완료」만 그렸더니, 진행상태가 「환불」인데 환불일은 빈칸인 줄(운영 DB 실측 1건)이
 *     **빨간 표시도 없고 딱지는 초록 「계약완료」** 라 담당자가 「환불」을 **어디서도 못 봤다.**
 *  그래서 **원래 들어 있던 상태를 다 보이게** 하되, 딱지 하나하나가 제 글자에 맞는 색을 쓴다.
 *  계약 고객이라는 게 요점이라 「계약완료」를 앞에 세우고 나머지는 원래 순서대로.
 */
export function statusBadgesOf(
  statuses: string[],
  maxShown: number = STATUS_BADGES_SHOWN,
): Array<{ label: string; variant: "green" | "default" }> {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const s of statuses) {
    const v = (s ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    list.push(v);
  }
  if (list.length === 0) return [];
  const ordered = [...list.filter((s) => s === "계약완료"), ...list.filter((s) => s !== "계약완료")];
  const shown = ordered.slice(0, Math.max(1, maxShown));
  const badges = shown.map((label) => ({
    label,
    // 초록은 오직 「계약완료」 — 딱지의 색과 글자가 어긋나는 짝이 없다.
    variant: label === "계약완료" ? ("green" as const) : ("default" as const),
  }));
  const rest = ordered.length - shown.length;
  if (rest > 0) badges.push({ label: `+${rest}`, variant: "default" });
  return badges;
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
