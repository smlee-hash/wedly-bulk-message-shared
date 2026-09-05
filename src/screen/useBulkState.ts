"use client";

// 단체 안내 발송 — 화면 상태·효과·핸들러. JSX 는 단계 파일이 그린다.
// 반환 이름은 BulkMessageScreen 이 쓰던 것과 같다.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { detectAdWords } from "../rules/checks";
import type {
  BulkEmailBody,
  ConvertEmailData,
  EmailAttachment,
  EmailFactLock,
} from "../rules/email-body";
import { MAX_RECIPIENTS } from "./limits";
import {
  MANAGER_MINE,
  applyManualEmail,
  canProceedWithTargets,
  emailMode,
  emailTargetCounts,
  hiddenPickedCount,
  listFetchDelayMs,
  managerQueryOf,
  managerSelectOptions,
  mergeDropped,
  mergeManagerNames,
  nextManagerLock,
  normalizeManualEmail,
  pickedCounts,
  reconcilePicked,
  step1ListPhase,
  targetForChannel,
  uniqueManagers,
  validateManualEmail,
  type BulkChannel,
  type ChannelTarget,
  type ManagerLock,
  type ManualEmail,
  type PickedDrop,
} from "./step1-helpers";
import {
  ATTACH_TOO_LARGE_NOTICE,
  CONVERT_DEBOUNCE_MS,
  CONVERT_INCOMPLETE_MESSAGE,
  EMAIL_STEP2_NOTE,
  MIN_ORIGINAL_LEN,
  PREVIEW_DEBOUNCE_MS,
  allFillsComplete,
  applyFillValues,
  applyFillsToBody,
  applyInlineEdit,
  attachmentTotalOk,
  bodyToText,
  composedLengthNotice,
  composedTooLong,
  conversionReady,
  convertApiErrorMessage,
  emailReady,
  insertAtCursor,
  isAbortError,
  readPlainTextStream,
  shouldAutoConvert,
  showFillForm,
  step2FooterHint,
  testSendAllowed,
  uniqueNeedsFill,
} from "./step2-helpers";
import {
  HISTORY_DEBOUNCE_MS,
  type HistoryCompanyDetail,
  type HistoryCompanyRow,
  type HistoryJobRecipient,
  type HistoryJobRow,
  type HistoryMailState,
  type HistoryMode,
} from "./history-helpers";
import {
  DEFAULT_NOTICE_CATEGORY_LABEL,
  DEFAULT_PRICING,
  JOB_GONE_NOTICE,
  NOTICE_CATEGORIES,
  alimtalkFailedCountOf,
  canConfirmSend,
  canStopSend,
  emailChecklist,
  emailChecklistFailedCount,
  estimateCost,
  parsePricing,
  progressOf,
  refundedNotice,
  restoredJobFromStore,
  sendRunning,
  skippedNotice,
  type BulkPricing,
  type EmailChecklistItem,
  type SkippedNotice,
} from "./step3-helpers";

// ────────────────────────────────────────────────────────────── 타입·상수


export interface Target extends ChannelTarget {
  rowId: string;
  companyName: string;
  representative: string;
  phone: string;
  statuses: string[];
  manager: string;
  /** 정부지원금 계약정보의 계약일. 이 값이 있는 줄만 서버가 내려 준다. */
  contractDate: string;
  /** 정부지원금 환불정보의 환불일. 채워져 있으면 화면이 빨갛게 그린다(진행상태 글자는 안 본다). */
  refundedAt: string;
  sendable: boolean;
  excludeReason: string;
  /**
   * 이메일 판정(2026-09-05 신설) — 서버가 기본정보 「이메일」 → 「53이메일」 → 「신청자이메일」
   * 순서로 고른 주소와 그 출처, 사업자번호, 보낼 수 있는지와 못 보내는 사유.
   * ★배포 교체 중 **옛 서버**가 이 칸들을 안 실어 줄 수 있다 — 그때는 전부 빈 값·false 로 읽혀
   *  「이메일 없음」으로 보인다(없는 주소로 보내는 쪽보다 안전한 방향).
   */
  email: string;
  emailSource: string;
  bizNo: string;
  emailSendable: boolean;
  emailExcludeReason: string;
}

export interface FailedRow {
  companyName: string;
  representative: string;
  phone: string;
  error: string;
}

/** 발송 결과 한 줄. 연락처·이메일 주소는 서버가 가려서 준다. */
export interface RecipientRow extends FailedRow {
  status: string;
  /** "sent" | "failed" | "" — 빈 값은 「모름」이다(성공으로 위장하지 않는다). */
  alimtalkStatus: string;
  /** 알림톡만 실패했을 때의 사유. 옛 응답에는 없다. */
  alimtalkError?: string;
  viewedAt: string | null;
  /**
   * 이메일 칸(2026-09-05 신설). 주소는 가려서 온다(`ho***@wedly.kr`).
   * ★채팅만 보내던 옛 응답에는 이 칸이 통째로 없다 — 전부 물음표(?)다.
   */
  email?: string;
  emailSource?: string;
  emailStatus?: string;
  emailSkipReason?: string;
  emailError?: string;
  emailSentAt?: string | null;
  emailDeliveredAt?: string | null;
  emailBouncedAt?: string | null;
  emailViewedAt?: string | null;
}

export interface Progress {
  status: string;
  total: number;
  sent: number;
  failed: number;
  error: string;
  stalled: boolean;
  failedRows: FailedRow[];
  recipients: RecipientRow[];
  /** 이 작업이 실제로 쓴 통로 — 새로고침 뒤에도 화면 고르개가 아니라 이 값이 정본이다. */
  channelChat?: boolean;
  channelEmail?: boolean;
  emailSubject?: string;
  emailStatus?: string;
  emailSent?: number;
  emailFailed?: number;
  stopRequested?: boolean;
  /**
   * 통로별 인원 — **발송 응답에만** 있다(진행 조회는 안 준다).
   * 그래서 조회 결과를 덮어쓸 때 이 두 칸은 남겨 둔다. 되살린 화면에는 처음부터 없다.
   */
  chatTotal?: number | null;
  emailTotal?: number | null;
}

export type Step = 1 | 2 | 3;

/** 표 칸에서 이메일을 고치는 중인 한 줄 — 적던 글·오류 문구·「고객 자료에도 저장」 스위치. */
export interface ManualEmailEdit {
  draft: string;
  error: string;
  persist: boolean;
}

/**
 * 줄을 가리키는 열쇠.
 *
 * ★번호로 세면 안 된다 — 가린 번호는 서로 겹칠 수 있어(010-2•••-4567 이 두 사람일 수 있다)
 *  한 사람을 고르면 다른 사람까지 같이 골라진다. 목록 줄은 rowId 로 센다.
 */
export function keyOf(t: { rowId: string; phone: string }): string {
  return t.rowId || t.phone;
}

function loadErrorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const m = (err as { message: string }).message.trim();
    if (m) return m;
  }
  return fallback;
}

/**
 * 작업 번호를 적어 두는 자리(탭이 살아 있는 동안만).
 * ★새로고침하면 진행 표가 사라지던 것을 막는다 — 화면이 다시 뜰 때 이 값으로 3단계를 되살린다.
 */
const JOB_ID_STORE_KEY = "wedly-bulk-message:jobId";

export function useBulkState() {
  const [step, setStep] = useState<Step>(1);
  // 오류 알림 — window.alert 금지. 화면 위 빨간 상태 박스로 띄우고 5초 뒤 지운다.
  const [errorMsg, setErrorMsg] = useState("");
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertError = useCallback((msg: string) => {
    setErrorMsg(msg || "알 수 없는 문제가 생겼어요.");
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setErrorMsg(""), 5000);
  }, []);
  useEffect(() => () => { if (errorTimer.current) clearTimeout(errorTimer.current); }, []);

  // 보낸 사람 이름(답장 배정 안내에 쓴다)과 업무 메일(이메일 발송의 회신 주소가 된다)
  const [myName, setMyName] = useState("");
  const [myEmail, setMyEmail] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        if (j.name) setMyName(String(j.name));
        // ★회신 주소를 화면이 지어내지 않는다 — 못 얻으면 3단계가 「담당자 메일로 옵니다」로만 적는다.
        if (j.email) setMyEmail(String(j.email));
      })
      .catch(() => { /* 이름을 못 얻어도 화면은 돈다 */ });
    return () => { alive = false; };
  }, []);

  // ── 1단계: 대상 ──────────────────────────────────────────────
  // 대상은 「정부지원금 계약일이 적힌 고객」으로 고정 — 탭도 진행상태 칸도 없다(2026-09-04 사장님 확정).
  const [managerFilter, setManagerFilter] = useState(MANAGER_MINE);
  const [knownManagers, setKnownManagers] = useState<string[]>([]);
  /**
   * 파트너 앱(일루아 등)은 서버가 「본인 담당만」으로 못 박는다 — 고르개를 그리면 고를 수 없는
   * 선택지를 내미는 꼴이다. 그래서 잠긴 표시로 바꾼다.
   *
   * ★이 잠금은 **거들 뿐**이다. 실제 방어는 서버에 있다(화면 값을 고쳐도 남의 고객은 안 내려온다).
   * ★조회가 실패해도 이 값을 false 로 되돌리지 않는다 — 한 번 잠긴 사용자에게 갑자기 고르개가
   *  나타나면 「고를 수 있나 보다」로 읽는다.
   */
  const [lockedToMe, setLockedToMe] = useState<ManagerLock>(null);
  const [search, setSearch] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  /**
   * 어떤 통로로 보낼까 — 기본은 「알림톡·채팅」(지금까지 하던 것과 같다).
   * 이 값 하나가 표의 이메일 열·숫자 카드·「전체 고르기」·발송 몸통까지 전부 가른다.
   */
  const [channel, setChannel] = useState<BulkChannel>("chat");
  /** 손으로 넣은 이메일 — 열쇠는 줄 열쇠(keyOf). 확인을 누른 것만 들어온다. */
  const [manualEmails, setManualEmails] = useState<Map<string, ManualEmail>>(new Map());
  /** 지금 칸에서 고치고 있는 줄 — 여러 줄을 동시에 열어 두고 위에서 아래로 채울 수 있다. */
  const [manualEdits, setManualEdits] = useState<Map<string, ManualEmailEdit>>(new Map());
  /**
   * 고른 사람 — **줄 정보를 통째로** 담는다.
   *
   * ★열쇠만 담으면 안 된다. 검색·담당을 바꾸면 그 줄이 목록에서 사라지는데, 발송 명단을
   *  「지금 목록 ∩ 고른 열쇠」로 만들면 **안 보이는 사람이 조용히 명단에서 빠진다.**
   *  줄을 통째로 들고 있으면 화면에서 사라져도 명단은 그대로다.
   */
  const [picked, setPicked] = useState<Map<string, Target>>(new Map());
  /** 조회 응답 안에서 지금 명단을 손보려면 최신 picked 가 필요하다 — 거울 ref 로 읽는다. */
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  /** 방금 조회에서 「보낼 수 없게 바뀌어」 명단에서 자동으로 뺀 사람들. 다음 조회에 다시 계산된다. */
  const [droppedPicked, setDroppedPicked] = useState<PickedDrop[]>([]);
  /**
   * 발송 1건 단가 — 서버가 목록 응답에 실어 준다.
   * ★조회 전(그리고 옛 서버)에도 3단계가 금액을 그려야 하므로 기본값에서 시작한다.
   */
  const [pricing, setPricing] = useState<BulkPricing>(DEFAULT_PRICING);
  const [loadingTargets, setLoadingTargets] = useState(true); // 첫 화면부터 자동 조회
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState("");
  const fetchSeq = useRef(0);

  const loadListNow = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoadingTargets(true);
    setLoadError("");
    try {
      const res = await fetch("/api/bulk-message/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search, ...managerQueryOf(managerFilter) }),
      });
      const j = await res.json();
      if (seq !== fetchSeq.current) return;
      if (!j.success) throw new Error(loadErrorText(j.error, "대상을 불러오지 못했어요."));
      const t = (j.data?.targets ?? []) as Target[];
      const incoming = Array.isArray(j.data?.managers)
        ? (j.data.managers as unknown[]).filter((x): x is string => typeof x === "string")
        : uniqueManagers(t);
      setKnownManagers((prev) => mergeManagerNames(prev, incoming));
      // ★응답 덩어리를 통째로 넘긴다 — 「lockedToMe 칸이 없음」과 「false」를 함수가 구분해야 한다.
      setLockedToMe((prev) => nextManagerLock(prev, { ok: true, data: j.data }));
      // ★단가는 응답에 **객체로 실려 있을 때만** 갱신한다 — 없으면 직전 값을 그대로 둔다.
      //  배포 교체 중 옛 서버(단가를 안 실어 주던 판)에 걸린 재조회 한 번에 화면 단가가
      //  기본값으로 되돌아가면, 담당자가 보던 금액이 발송 직전에 조용히 바뀐다.
      //  칸 하나만 망가진 경우는 parsePricing 이 그 칸만 기본값으로 접는다.
      const rawPricing = j.data?.pricing;
      if (rawPricing && typeof rawPricing === "object") setPricing(parsePricing(rawPricing));
      setTargets(t);
      // ★고른 사람은 검색·담당이 바뀌어도 유지한다 — 찾아서 담고, 또 찾아서 담을 수 있어야 한다.
      //  단 **이번 목록에 있는데 보낼 수 없게 바뀐 줄**은 자동으로 빼고 알린다 —
      //  그 손질은 아래 한 곳(명단 손질 효과)이 맡는다. 여기서 한 번 더 하면 **채널을 모르는 채로**
      //  걸러서, 이메일로 보내는 중에 번호 없는 줄이 조용히 빠진다.
      setLoadedOnce(true);
    } catch (e) {
      if (seq !== fetchSeq.current) return;
      setTargets([]);
      // ★빠진 사람 알림은 조회가 실패해도 지우지 않는다 — 이미 일어난 사실이다.
      // ★조회 실패로 잠금도 풀지 않는다 — 규칙은 nextManagerLock 이 혼자 안다(시험이 못을 박는다).
      setLockedToMe((prev) => nextManagerLock(prev, { ok: false }));
      setLoadedOnce(true);
      setLoadError(`대상을 불러오지 못했어요: ${loadErrorText(e, "잠시 후 다시 시도해 주세요.")}`);
    } finally {
      if (seq === fetchSeq.current) setLoadingTargets(false);
    }
  }, [search, managerFilter]);

  const retryLoad = useCallback(() => { void loadListNow(); }, [loadListNow]);

  const listQueryKeyRef = useRef<string | null>(null);
  const listManagerRef = useRef<string | null>(null);
  const listSearchRef = useRef<string | null>(null);

  const onManagerChange = useCallback((value: string) => {
    setManagerFilter(value);
    setLoadingTargets(true);
  }, []);

  useEffect(() => {
    fetchSeq.current += 1; // 담당·검색이 바뀌면 이전 조회 응답은 버린다
    const delay = listFetchDelayMs({
      hadListQuery: listQueryKeyRef.current !== null,
      managerChanged: listManagerRef.current !== null && listManagerRef.current !== managerFilter,
      searchChanged: listSearchRef.current !== null && listSearchRef.current !== search,
    });
    listQueryKeyRef.current = `${managerFilter}\0${search}`;
    listManagerRef.current = managerFilter;
    listSearchRef.current = search;
    if (delay === 0) {
      void loadListNow();
      return;
    }
    setLoadingTargets(true);
    const timer = setTimeout(() => { void loadListNow(); }, delay);
    return () => clearTimeout(timer);
  }, [loadListNow, managerFilter, search]);

  // 담당 필터는 서버 조회 파라미터 — 화면에서 한 번 더 거르지 않는다.
  /** 서버가 준 줄에 **직접 입력한 주소만** 얹은 것 — 채널은 아직 안 녹였다(숫자 카드가 원래 값을 센다). */
  const mergedTargets = useMemo(
    () => targets.map((t) => applyManualEmail(t, manualEmails.get(keyOf(t)))),
    [targets, manualEmails],
  );
  /**
   * 표가 그리는 줄 — 여기서 **채널을 한 번만 녹인다.**
   * 아래(표·전체 고르기·명단 손질)는 `sendable` 한 칸만 보면 되고 채널을 몰라도 된다.
   */
  const visibleTargets = useMemo(
    () => mergedTargets.map((t) => targetForChannel(t, channel)),
    [mergedTargets, channel],
  );
  /** 숫자 카드 4장 — 앞 셋은 사실이라 채널과 무관, 자동 제외만 채널 기준. */
  const targetCounts = useMemo(() => emailTargetCounts(mergedTargets, channel), [mergedTargets, channel]);
  /** 주소가 아예 없는 분 — 경고 상자의 숫자(수신거부·중복은 「없음」이 아니라 여기서 안 센다). */
  const noEmailCount = useMemo(() => mergedTargets.filter((t) => !t.email).length, [mergedTargets]);
  const sendableTargets = useMemo(() => visibleTargets.filter((t) => t.sendable), [visibleTargets]);
  const excluded = useMemo(() => visibleTargets.filter((t) => !t.sendable), [visibleTargets]);
  const excludeSummary = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of excluded) by.set(t.excludeReason || "제외", (by.get(t.excludeReason || "제외") ?? 0) + 1);
    return [...by.entries()].map(([k, v]) => `${k} ${v}`).join(" / ");
  }, [excluded]);

  // ★발송 명단은 「지금 목록 ∩ 고른 열쇠」가 아니라 picked 그 자체다 —
  //  검색·담당을 바꿔 화면에서 사라진 사람도 명단에 그대로 남아야 한다.
  const selected = useMemo(() => [...picked.values()], [picked]);
  const selectedCount = selected.length;
  // ★3단계 표와 발송 확인 모달이 이 하나를 나눠 쓴다 — 두 곳에서 따로 곱하면 숫자가 어긋난다.
  const cost = useMemo(() => estimateCost(selectedCount, pricing), [selectedCount, pricing]);
  const tooMany = selectedCount > MAX_RECIPIENTS;
  const visibleKeys = useMemo(() => sendableTargets.map(keyOf), [sendableTargets]);
  const allChecked = visibleKeys.length > 0 && visibleKeys.every((k) => picked.has(k));
  const hiddenPicked = useMemo(
    () => hiddenPickedCount([...picked.keys()], visibleKeys),
    [picked, visibleKeys],
  );
  const managerOptions = useMemo(() => managerSelectOptions(knownManagers), [knownManagers]);
  /** 아래 단추 옆 「지금 고른 사람 N명 · 이메일 M명」. */
  const pickedTotals = useMemo(() => pickedCounts(picked.values(), channel), [picked, channel]);

  /**
   * 명단 손질 — 목록이 새로 오거나 **채널이 바뀌거나** 직접 입력한 주소가 늘 때마다 돈다.
   *
   * ★채널이 바뀌면 「보낼 수 있나」의 기준이 통째로 바뀐다. 알림톡으로 담아 둔 분 중
   *  이메일 주소가 없는 분은 이메일 발송 명단에 남아 있으면 안 된다(반대도 같다).
   *  규칙 세 가지(빼기·그대로 두기·갈아 끼우기)는 reconcilePicked 가 혼자 안다.
   * ★손질 결과가 그대로면 같은 Map·같은 배열이 돌아와 화면은 다시 그려지지 않는다.
   */
  useEffect(() => {
    const fixed = reconcilePicked(
      pickedRef.current,
      visibleTargets.map((x) => ({ key: keyOf(x), row: x })),
    );
    if (fixed.picked !== pickedRef.current) setPicked(fixed.picked);
    // ★알림은 쌓는다 — 다음 조회가 「누가 왜 빠졌는지」를 지워 버리면 사람이 영영 못 본다.
    //  단 다시 보낼 수 있게 된 사람은 지운다(그 줄엔 「체크가 잠깁니다」가 더 이상 사실이 아니다).
    const sendableNow = visibleTargets.filter((x) => x.sendable).map(keyOf);
    setDroppedPicked((prev) => mergeDropped(prev, fixed.dropped, sendableNow));
  }, [visibleTargets]);

  const toggleOne = useCallback((row: Target) => {
    setPicked((prev) => {
      const next = new Map(prev);
      const k = keyOf(row);
      if (next.has(k)) next.delete(k);
      else next.set(k, row);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setPicked((prev) => {
      const next = new Map(prev);
      const allOn = visibleKeys.length > 0 && visibleKeys.every((k) => next.has(k));
      if (allOn) for (const k of visibleKeys) next.delete(k);
      else for (const t of sendableTargets) next.set(keyOf(t), t);
      return next;
    });
  }, [sendableTargets, visibleKeys]);

  // ── 1단계: 이메일 직접 입력 ──────────────────────────────────
  //
  // 2026-09-04 사장님 요청 「입력 안 된 경우 직접 넣어 보낼 수 있어야 한다」.
  // 표의 빈 이메일 칸 → 「직접 입력」 → 그 칸이 입력창이 된다(Enter 확인 · Esc 취소).

  const startManualEmail = useCallback((key: string) => {
    setManualEdits((prev) => {
      if (prev.has(key)) return prev;
      const next = new Map(prev);
      // 「고객 자료에도 저장」은 기본 켬 — 다음 발송부터 손으로 다시 안 넣게(설계서 §4-3-1).
      next.set(key, { draft: "", error: "", persist: true });
      return next;
    });
  }, []);

  const changeManualEmail = useCallback((key: string, draft: string) => {
    setManualEdits((prev) => {
      const cur = prev.get(key);
      if (!cur) return prev;
      const next = new Map(prev);
      // 글자를 고치면 옛 오류 문구는 지운다 — 다 고쳤는데 빨간 줄이 남아 있으면 거짓말이다.
      next.set(key, { ...cur, draft, error: "" });
      return next;
    });
  }, []);

  const toggleManualPersist = useCallback((key: string) => {
    setManualEdits((prev) => {
      const cur = prev.get(key);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(key, { ...cur, persist: !cur.persist });
      return next;
    });
  }, []);

  const cancelManualEmail = useCallback((key: string) => {
    setManualEdits((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  /**
   * 확인 — 세 검사를 통과해야 칸에 들어간다.
   * ★통과하면 그 줄의 체크를 **켜 준다**(시안). 방금 주소를 넣은 사람을 다시 찾아 체크하게 두면
   *  여러 줄을 채울 때 반드시 하나를 빠뜨린다.
   */
  const saveManualEmail = useCallback((row: Target) => {
    const key = keyOf(row);
    const edit = manualEdits.get(key);
    if (!edit) return;
    const error = validateManualEmail(edit.draft, mergedTargets, row.rowId);
    if (error) {
      setManualEdits((prev) => {
        const cur = prev.get(key);
        if (!cur) return prev;
        const next = new Map(prev);
        next.set(key, { ...cur, error });
        return next;
      });
      return;
    }
    const email = normalizeManualEmail(edit.draft);
    setManualEmails((prev) => new Map(prev).set(key, { email, persist: edit.persist }));
    setManualEdits((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setPicked((prev) => {
      if (prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, applyManualEmail(row, { email, persist: edit.persist }));
      return next;
    });
  }, [manualEdits, mergedTargets]);

  // ── 2단계: 안내문 ────────────────────────────────────────────
  const [originalText, setOriginalText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [adWords, setAdWords] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  /** 스트림 첫 글자가 오기 전까지만 스켈레톤을 보인다 — 온 뒤로는 미리보기가 실시간으로 자란다. */
  const [streamHasChunk, setStreamHasChunk] = useState(false);
  const [converted, setConverted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lastConvertedOriginal, setLastConvertedOriginal] = useState("");
  const originalRef = useRef<HTMLTextAreaElement>(null);
  const originalTextRef = useRef(originalText);
  originalTextRef.current = originalText;
  const lastConvertedRef = useRef(lastConvertedOriginal);
  lastConvertedRef.current = lastConvertedOriginal;
  /** ★취소·실패 시 되돌릴 「직전 완성본」을 읽기 위한 거울 ref — finalText 를 항상 그대로 비춘다. */
  const finalTextRef = useRef(finalText);
  finalTextRef.current = finalText;
  const convertGen = useRef(0);
  const convertAbortRef = useRef<AbortController | null>(null);
  const pendingCursor = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convertingRef = useRef(converting);
  convertingRef.current = converting;

  // 표식은 finalText 에 남겨 두고 fillValues 로 덮어쓴다.
  // 첫 글자에서 표식을 지워 버리면 입력 줄이 중간에 사라진다.
  const composedText = useMemo(
    () => applyFillValues(finalText, fillValues),
    [finalText, fillValues],
  );
  const fillMarkers = useMemo(() => uniqueNeedsFill(finalText), [finalText]);
  const remainingMarkers = useMemo(() => uniqueNeedsFill(composedText), [composedText]);
  const fillsComplete = allFillsComplete(fillMarkers, fillValues);
  const tooLong = composedTooLong(composedText);
  const step2ConversionReady = conversionReady({
    finalText: composedText,
    originalText,
    lastConvertedOriginal,
    converting,
  });
  const fillFormVisible = showFillForm({
    conversionReady: step2ConversionReady,
    editing,
    markerCount: fillMarkers.length,
  });
  const canTestSend = testSendAllowed({
    originalText,
    lastConvertedOriginal,
    converting,
  }) && !!composedText.trim();
  const showTestSendWait =
    converting ||
    (originalText.trim().length > 0 && originalText.trim() !== lastConvertedOriginal.trim());

  const convert = useCallback(async (opts?: { force?: boolean }) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const text = originalTextRef.current.trim();
    if (text.length < MIN_ORIGINAL_LEN) return;
    if (!opts?.force && !shouldAutoConvert(text, lastConvertedRef.current)) return;
    convertAbortRef.current?.abort();
    const ac = new AbortController();
    convertAbortRef.current = ac;
    const gen = ++convertGen.current;
    // ★취소·실패 시 되돌릴 「직전 완성본」 — 스트리밍이 finalText 를 덮어쓰기 전에 미리 챙겨 둔다.
    // 여기서부터 finalText 는 다시 이 값으로(또는 새 변환 완료본으로) 정리될 때까지만 흔들린다.
    const priorFinalText = finalTextRef.current;
    setConverting(true);
    setStreamHasChunk(false);
    try {
      const res = await fetch("/api/bulk-message/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText: text }),
        signal: ac.signal,
      });
      const contentType = res.headers.get("Content-Type") ?? "";
      let acc: string;
      if (contentType.includes("application/json")) {
        // ★롤링 배포 중 옛 화면이 새 서버를 만나면 스트림 대신 JSON 성공 응답이 올 수도 있다 —
        //   무조건 오류로 보지 않고 success:true + data.text 형태면 그대로 받아 쓴다.
        const payload = await res.json().catch(() => null);
        const p = payload as { success?: unknown; data?: { text?: unknown } } | null;
        const jsonText = p?.data?.text;
        const ok = res.ok && p?.success === true && typeof jsonText === "string" && jsonText.trim();
        if (!ok) throw new Error(convertApiErrorMessage(payload));
        acc = jsonText as string;
        if (gen === convertGen.current) {
          setFinalText(acc);
          setStreamHasChunk(true);
        }
      } else {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(convertApiErrorMessage(payload));
        }
        if (!res.body) throw new Error(CONVERT_INCOMPLETE_MESSAGE);
        // 받는 대로 누적해 미리보기에 바로 찍는다 — 타이핑되듯 보이게.
        try {
          acc = await readPlainTextStream(
            res.body,
            (accumulated) => {
              if (gen !== convertGen.current) return;
              setFinalText(accumulated);
              setStreamHasChunk(true);
            },
            ac.signal,
          );
        } catch (streamErr) {
          // 취소는 그대로 위로 던져 아래 catch 의 취소 분기가 처리하게 한다.
          if (isAbortError(streamErr) || ac.signal.aborted) throw streamErr;
          // 그 밖의 스트림 중단(서버가 잘림·거절을 감지해 끊은 경우 포함)은 한 가지 안내로 통일한다 —
          // 브라우저·서버 환경마다 실제 오류 문구가 달라 믿을 수 없다.
          throw new Error(CONVERT_INCOMPLETE_MESSAGE);
        }
      }
      if (ac.signal.aborted || gen !== convertGen.current) return;
      if (!acc.trim()) throw new Error(CONVERT_INCOMPLETE_MESSAGE);
      // 타이핑이 이어졌으면 이 응답은 버린다 — 디바운스가 새 변환을 부를 때까지 스켈레톤 유지.
      if (text !== originalTextRef.current.trim()) return;
      setFillValues({});
      lastConvertedRef.current = text;
      setLastConvertedOriginal(text); // ★스트림이 정상 종료됐을 때만 갱신 — 취소·실패 경로는 절대 안 건드린다.
      setConverted(true);
      setEditing(false);
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        if (gen === convertGen.current) {
          // ★취소 — 반쪽 글이 남지 않게 직전 완성본으로 되돌린다(없으면 빈 문자열).
          setFinalText(priorFinalText);
          if (!shouldAutoConvert(originalTextRef.current, lastConvertedRef.current)) {
            setConverting(false);
          }
        }
        return;
      }
      if (gen !== convertGen.current) return;
      // ★실패 — 마찬가지로 직전 완성본으로 되돌린다. lastConvertedOriginal 은 손대지 않는다.
      setFinalText(priorFinalText);
      alertError(
        e instanceof Error && e.message === CONVERT_INCOMPLETE_MESSAGE
          ? CONVERT_INCOMPLETE_MESSAGE
          : `변환하지 못했어요: ${loadErrorText(e, "잠시 후 다시 시도해 주세요.")}`,
      );
    } finally {
      if (ac.signal.aborted || gen !== convertGen.current) {
        if (gen === convertGen.current && !shouldAutoConvert(originalTextRef.current, lastConvertedRef.current)) {
          setConverting(false);
        }
        return;
      }
      const current = originalTextRef.current.trim();
      const stillPending = current !== text && shouldAutoConvert(current, lastConvertedRef.current);
      if (!stillPending) setConverting(false);
    }
  }, [alertError]);

  useEffect(() => () => { convertAbortRef.current?.abort(); }, []);

  useEffect(() => {
    if (step !== 2) return;
    // ★통로가 「이메일」뿐이면 채팅 안내문은 만들지 않는다 — 안 쓸 글을 만드느라 유료 호출이 나간다.
    if (channel === "email") return;
    if (!shouldAutoConvert(originalText, lastConvertedOriginal)) return;
    debounceTimerRef.current = setTimeout(() => { void convert(); }, CONVERT_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // 원문이 바뀌면 진행 중 변환을 바로 취소한다 — 다음 디바운스까지 기다리면 유료 호출이 겹친다.
      convertAbortRef.current?.abort();
    };
  }, [step, channel, originalText, lastConvertedOriginal, convert]);

  useLayoutEffect(() => {
    const cursor = pendingCursor.current;
    if (cursor == null) return;
    pendingCursor.current = null;
    const el = originalRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(cursor, cursor);
  }, [originalText]);

  const insertToken = (token: string) => {
    const el = originalRef.current;
    const start = el?.selectionStart ?? originalText.length;
    const end = el?.selectionEnd ?? start;
    const { next, cursor } = insertAtCursor(originalText, token, start, end);
    if (next.length > 4000) return;
    pendingCursor.current = cursor;
    setOriginalText(next);
  };

  const toggleEditing = () => {
    if (editing) {
      setEditing(false);
      return;
    }
    setFinalText((prev) => applyFillValues(prev, fillValues));
    setFillValues({});
    setEditing(true);
  };

  // 서버는 더 이상 광고성 낱말을 알려주지 않는다 — 변환문이 바뀔 때마다(스트리밍 중·직접 고치기 포함) 화면에서 사전으로 다시 센다.
  // ★검사 대상은 finalText(표식이 남은 원본)가 아니라 composedText(실제 발송문 — [확인 필요] 칸이 채운 값으로
  //   치환된 글)여야 한다. 채우기 칸에 광고성 표현을 넣어도 여기서 잡힌다.
  useEffect(() => { setAdWords(detectAdWords(composedText)); }, [composedText]);

  /**
   * 알림톡 문안의 `#{안내구분}` 에 그대로 들어가는 값.
   * ★기본값을 두지 않는다 — 담당자가 이번 안내가 무엇인지 직접 고르게 한다.
   * ★쓰이는 곳은 3단계지만 선언은 여기다 — 아래 시험 발송이 이 값을 함께 보내야 하는데,
   *  useCallback 의 의존성 목록은 그리는 동안 읽히므로 선언이 뒤에 있으면 화면이 통째로 깨진다.
   */
  const [noticeCategory, setNoticeCategory] = useState("");

  // 시험 발송
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testDone, setTestDone] = useState("");
  // 모달 안의 오류는 모달 안에서 보여 준다 — 화면 위 오류 상자는 덮개에 가린다.
  const [testError, setTestError] = useState("");

  const testSend = useCallback(async () => {
    if (!testSendAllowed({
      originalText: originalTextRef.current,
      lastConvertedOriginal: lastConvertedRef.current,
      converting: convertingRef.current,
    })) return;
    setTestSending(true);
    setTestDone("");
    setTestError("");
    try {
      const res = await fetch("/api/bulk-message/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★안내 내용을 함께 보낸다 — 실제 발송과 같은 `#{안내구분}` 으로 나가야 시험 발송이
        //  「고객이 받는 그대로」가 된다. 아직 안 골랐으면 빈 값 그대로 보낸다(서버가 판단한다).
        body: JSON.stringify({ finalText: composedText, phone: testPhone, noticeCategory }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setTestDone("보냈어요. 카카오톡 알림톡을 확인해 주세요.");
    } catch (e) {
      setTestError(String((e as Error).message));
    } finally {
      setTestSending(false);
    }
  }, [composedText, testPhone, noticeCategory]);

  // ── 2단계: 이메일 ────────────────────────────────────────────
  // 채팅 쪽(finalText)과 **원문 한 칸을 함께 쓰고** 결과만 따로 든다.
  // 이메일은 글 한 덩어리가 아니라 8구획 JSON 이라, 미리보기 HTML 은 서버(렌더러 한 곳)가 그린다.
  const [emailBody, setEmailBody] = useState<BulkEmailBody | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailPreheader, setEmailPreheader] = useState("");
  /** 서버가 「소제목 4개까지만 남겼어요」처럼 손본 것을 알려 준 줄. */
  const [emailWarnings, setEmailWarnings] = useState<string[]>([]);
  /** 광고로 읽히는 문장 — 하나라도 있으면 다음 단계가 잠긴다. */
  const [adSentences, setAdSentences] = useState<string[]>([]);
  const [factLock, setFactLock] = useState<EmailFactLock | null>(null);
  const [emailFilled, setEmailFilled] = useState<Record<string, string>>({});
  const [emailAttachments, setEmailAttachments] = useState<EmailAttachment[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewReal, setPreviewReal] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [emailConverting, setEmailConverting] = useState(false);
  /** 변환 실패 안내 — 브라우저 alert 금지. 이 판 안의 빨간 상자로만 보인다. */
  const [emailError, setEmailError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [attachError, setAttachError] = useState("");
  const [attachUploading, setAttachUploading] = useState(false);
  const [lastEmailOriginal, setLastEmailOriginal] = useState("");
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailTestDone, setEmailTestDone] = useState("");
  const [emailTestError, setEmailTestError] = useState("");

  const lastEmailRef = useRef(lastEmailOriginal);
  lastEmailRef.current = lastEmailOriginal;
  const emailGen = useRef(0);
  const emailAbortRef = useRef<AbortController | null>(null);
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewGen = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  const convertEmail = useCallback(async (opts?: { force?: boolean }) => {
    if (emailDebounceRef.current) {
      clearTimeout(emailDebounceRef.current);
      emailDebounceRef.current = null;
    }
    const text = originalTextRef.current.trim();
    if (text.length < MIN_ORIGINAL_LEN) return;
    if (!opts?.force && !shouldAutoConvert(text, lastEmailRef.current)) return;
    emailAbortRef.current?.abort();
    const ac = new AbortController();
    emailAbortRef.current = ac;
    const gen = ++emailGen.current;
    setEmailConverting(true);
    setEmailError("");
    try {
      const res = await fetch("/api/bulk-message/convert-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText: text }),
        signal: ac.signal,
      });
      const payload = await res.json().catch(() => null);
      if (ac.signal.aborted || gen !== emailGen.current) return;
      const p = payload as { success?: unknown; data?: Partial<ConvertEmailData> } | null;
      const body = p?.data?.body;
      if (!res.ok || p?.success !== true || !body) throw new Error(convertApiErrorMessage(payload));
      // 타이핑이 이어졌으면 이 응답은 버린다 — 옛 원문으로 만든 안내문이 남지 않게.
      if (text !== originalTextRef.current.trim()) return;
      setEmailBody(body);
      setEmailSubject(body.subject ?? "");
      setEmailPreheader(body.preheader ?? "");
      setEmailWarnings(p.data?.warnings ?? []);
      setAdSentences(p.data?.adSentences ?? []);
      setFactLock(p.data?.factLock ?? null);
      setEmailFilled({});
      lastEmailRef.current = text;
      setLastEmailOriginal(text);
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) return;
      if (gen !== emailGen.current) return;
      setEmailError(loadErrorText(e, "잠시 후 다시 시도해 주세요."));
    } finally {
      if (gen === emailGen.current) setEmailConverting(false);
    }
  }, []);

  useEffect(() => () => {
    emailAbortRef.current?.abort();
    previewAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    if (!emailMode(channel)) return;
    if (!shouldAutoConvert(originalText, lastEmailOriginal)) return;
    emailDebounceRef.current = setTimeout(() => { void convertEmail(); }, CONVERT_DEBOUNCE_MS);
    return () => {
      if (emailDebounceRef.current) {
        clearTimeout(emailDebounceRef.current);
        emailDebounceRef.current = null;
      }
      emailAbortRef.current?.abort();
    };
  }, [step, channel, originalText, lastEmailOriginal, convertEmail]);

  /** 본문 어디에 있든 남은 「확인 필요」 표식 — 제목·미리보기 문구까지 함께 센다. */
  const emailFillMarkers = useMemo(() => {
    if (!emailBody) return [] as string[];
    return uniqueNeedsFill([emailSubject, emailPreheader, bodyToText(emailBody)].join("\n"));
  }, [emailBody, emailSubject, emailPreheader]);

  /**
   * 실제로 나갈 본문 — 카드에서 고친 제목·미리보기 문구를 얹고 채운 값까지 반영한 것.
   * ★미리보기·시험 발송·실제 발송이 **모두 이 하나**를 쓴다. 한 곳만 원본을 쓰면
   *  고객이 「[확인 필요: 요일]」을 그대로 받는다.
   */
  const emailComposedBody = useMemo(() => {
    if (!emailBody) return null;
    return applyFillsToBody({ ...emailBody, subject: emailSubject, preheader: emailPreheader }, emailFilled);
  }, [emailBody, emailSubject, emailPreheader, emailFilled]);

  /** 「실제 수신자로 보기」가 도는 명단 — 고른 사람 중 이메일이 있는 분. */
  const emailPreviewTargets = useMemo(() => selected.filter((t) => t.emailSendable), [selected]);
  const previewRecipient = useMemo(() => {
    if (!previewReal || emailPreviewTargets.length === 0) return null;
    return emailPreviewTargets[previewIdx % emailPreviewTargets.length];
  }, [previewReal, previewIdx, emailPreviewTargets]);

  const requestPreview = useCallback(async () => {
    const body = emailComposedBody;
    if (!body) return;
    previewAbortRef.current?.abort();
    const ac = new AbortController();
    previewAbortRef.current = ac;
    const gen = ++previewGen.current;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const res = await fetch("/api/bulk-message/preview-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          ...(previewRecipient
            ? {
                recipient: {
                  representative: previewRecipient.representative,
                  companyName: previewRecipient.companyName,
                },
              }
            : {}),
          ...(emailAttachments.length ? { attachments: emailAttachments } : {}),
        }),
        signal: ac.signal,
      });
      const payload = await res.json().catch(() => null);
      if (ac.signal.aborted || gen !== previewGen.current) return;
      const p = payload as { success?: unknown; data?: { html?: unknown } } | null;
      const html = p?.data?.html;
      if (!res.ok || p?.success !== true || typeof html !== "string") {
        throw new Error(convertApiErrorMessage(payload, "미리보기를 불러오지 못했어요."));
      }
      setPreviewHtml(html);
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) return;
      if (gen !== previewGen.current) return;
      setPreviewError(loadErrorText(e, "미리보기를 불러오지 못했어요."));
    } finally {
      if (gen === previewGen.current) setPreviewLoading(false);
    }
  }, [emailComposedBody, previewRecipient, emailAttachments]);

  useEffect(() => {
    if (step !== 2 || !emailMode(channel)) return;
    if (!emailComposedBody) {
      setPreviewHtml("");
      return;
    }
    // 기기를 바꿔도 다시 부른다 — 폭에 따라 서식이 달라질 수 있어 화면이 짐작하지 않는다.
    const timer = setTimeout(() => { void requestPreview(); }, PREVIEW_DEBOUNCE_MS);
    return () => { clearTimeout(timer); };
  }, [step, channel, emailComposedBody, previewDevice, requestPreview]);

  /** 고른 사람이 줄면 「다음 수신자」 번호가 명단 밖으로 나가지 않게 되돌린다. */
  useEffect(() => {
    if (previewIdx !== 0 && previewIdx >= emailPreviewTargets.length) setPreviewIdx(0);
  }, [previewIdx, emailPreviewTargets.length]);

  const nextPreviewRecipient = useCallback(() => {
    setPreviewIdx((i) => (emailPreviewTargets.length ? (i + 1) % emailPreviewTargets.length : 0));
  }, [emailPreviewTargets.length]);

  const editEmailBody = useCallback((path: string, value: string) => {
    setEmailBody((prev) => (prev ? applyInlineEdit(prev, path, value) : prev));
  }, []);

  const addAttachments = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setAttachError("");
    // 올리기 **전에** 먼저 잰다 — 10MB 를 넘길 파일을 서버까지 보내지 않는다.
    if (!attachmentTotalOk([...emailAttachments, ...files.map((f) => ({ bytes: f.size }))])) {
      setAttachError(ATTACH_TOO_LARGE_NOTICE);
      return;
    }
    setAttachUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const payload = await res.json().catch(() => null);
        const p = payload as
          | { success?: unknown; data?: { id?: unknown; fileName?: unknown; size?: unknown } }
          | null;
        const id = p?.data?.id;
        if (!res.ok || p?.success !== true || typeof id !== "string" || !id) {
          throw new Error(convertApiErrorMessage(payload, "파일을 올리지 못했어요."));
        }
        const added: EmailAttachment = {
          uploadId: id,
          fileName: typeof p.data?.fileName === "string" ? p.data.fileName : file.name,
          bytes: Number(p.data?.size ?? file.size) || 0,
        };
        // 올리는 사이에 다른 파일이 늘었을 수 있으니 넣기 직전에 한 번 더 잰다.
        let rejected = false;
        setEmailAttachments((prev) => {
          if (!attachmentTotalOk([...prev, added])) { rejected = true; return prev; }
          return [...prev, added];
        });
        if (rejected) { setAttachError(ATTACH_TOO_LARGE_NOTICE); break; }
      }
    } catch (e) {
      setAttachError(loadErrorText(e, "파일을 올리지 못했어요."));
    } finally {
      setAttachUploading(false);
    }
  }, [emailAttachments]);

  const removeAttachment = useCallback((uploadId: string) => {
    setEmailAttachments((prev) => prev.filter((a) => a.uploadId !== uploadId));
    setAttachError("");
  }, []);

  const testSendEmail = useCallback(async () => {
    if (!emailComposedBody) return;
    setEmailTestSending(true);
    setEmailTestDone("");
    setEmailTestError("");
    try {
      const res = await fetch("/api/bulk-message/test-send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailComposedBody.subject,
          preheader: emailComposedBody.preheader,
          bodyJson: emailComposedBody,
          attachments: emailAttachments,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setEmailTestDone("보냈어요. 내 메일함을 확인해 주세요.");
    } catch (e) {
      setEmailTestError(loadErrorText(e, "잠시 후 다시 시도해 주세요."));
    } finally {
      setEmailTestSending(false);
    }
  }, [emailComposedBody, emailAttachments]);

  const emailStepReady = emailReady({
    subject: emailSubject,
    adSentences,
    factLock,
    fillMarkers: emailFillMarkers,
    fillValues: emailFilled,
  });

  // ── 3단계: 발송 ─────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [jobId, setJobId] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pollKey, setPollKey] = useState(0);
  /**
   * 발송 통로가 걸러낸 사람 — 사유별 건수(대상 아님 · 번호 없음 · 수신거부 · 중복 번호 · 범위 밖).
   * ★고른 인원과 실제로 나간 인원이 다른 이유다. 조용히 줄어들면 담당자가 사고로 읽는다.
   */
  const [skipped, setSkipped] = useState<SkippedNotice | null>(null);
  /** 서버가 발송 직전에 한 번 더 걸러낸 수신거부 인원 — 화면 목록을 만든 뒤에 차단된 분이 있을 수 있다. */
  const [blockedCount, setBlockedCount] = useState(0);
  /** 발송 직전 서버가 범위 밖으로 뺀 수(파트너 앱). */
  const [sendOutOfScopeCount, setSendOutOfScopeCount] = useState(0);
  /** 진행 조회가 연달아 실패했을 때의 안내 — 「보내는 중」이 굳어 보이지 않게. */
  const [pollError, setPollError] = useState("");
  /**
   * 발송은 됐지만 알려 둘 일(직접 입력 주소를 고객 자료에 못 적었다 등).
   * ★서버가 `warnings` 로 준다. 조용히 버리면 담당자는 저장된 줄 안다.
   */
  const [sendWarnings, setSendWarnings] = useState<string[]>([]);
  /**
   * 「발송 중단」 — 확인 모달(브라우저 confirm 금지)과 누르는 동안의 잠금.
   */
  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  /**
   * 발송 현황 머리에 적는 시각.
   *
   * ★진행 조회 응답에는 시각 칸이 없다(서버 `getJob` 이 status·총계만 준다) —
   *  그래서 **이 화면에서 보낸 발송에 한해** 보낸 순간·끝난 것을 본 순간을 적어 둔다.
   *  새로고침으로 되살린 화면에는 값이 없고, 그때는 시각을 아예 안 그린다(지어내지 않는다).
   */
  const [sendStartedAt, setSendStartedAt] = useState<Date | null>(null);
  const [sendFinishedAt, setSendFinishedAt] = useState<Date | null>(null);
  /**
   * 보관한 작업 번호로 되살린 화면인가.
   * ★대상·안내문은 복원 대상이 아니다 — 3단계 확인 표를 그대로 그리면 「받는 사람 0명 · 약 0원」이 뜬다.
   *  되살린 화면에서는 진행 표만 그린다.
   */
  const [restoredFromStore, setRestoredFromStore] = useState(false);
  // noticeCategory 는 시험 발송보다 위에서 선언한다(위 주석 참고).

  // ★새로고침 뒤 되살리기 — 적어 둔 작업 번호가 있으면 3단계로 열어 아래 폴링이 진행 표를 다시 채운다.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(JOB_ID_STORE_KEY); } catch { /* 보관함을 못 써도 화면은 돈다 */ }
    const restored = restoredJobFromStore(saved);
    if (!restored) return;
    setJobId(restored.jobId);
    setStep(3);
    setRestoredFromStore(true);
  }, []);

  const send = useCallback(async () => {
    if (!canProceedWithTargets({
      loading: loadingTargets,
      selectedCount: selected.length,
      loadError,
    })) return;
    setSending(true);
    try {
      const recipients = selected.map((t) => {
        // ★손으로 넣은 주소만 실어 보낸다 — 자료에 있던 주소는 서버가 rowId 로 다시 찾는다.
        //  화면이 가진 주소를 그대로 보내면 사이에 자료가 바뀌어도 옛 주소로 나간다.
        const manual = manualEmails.get(keyOf(t));
        return {
          // 목록에서 고른 줄은 rowId 만 보낸다 — 화면이 가진 번호는 가려진 것이라 못 쓴다.
          // 서버가 rowId 로 자료에서 원문을 다시 찾는다(rowId 가 없는 줄은 지금 통로엔 오지 않는다).
          phone: t.rowId ? "" : t.phone,
          companyName: t.companyName,
          representative: t.representative,
          rowId: t.rowId,
          ...(manual ? { email: manual.email, emailPersist: manual.persist } : {}),
        };
      });
      const res = await fetch("/api/bulk-message/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalText,
          finalText: composedText,
          recipients,
          noticeCategory,
          // 어떤 통로로 보낼지 — 서버는 이 값이 없으면 옛 화면으로 보고 알림톡·채팅만 보낸다.
          channels: { chat: channel !== "email", email: emailMode(channel) },
          // ★이메일 몸통은 **채운 값까지 반영한** 본문을 싣는다(emailComposedBody).
          //  표식이 남은 원본을 실어 보내고 서버가 채워 주기를 바라지 않는다 —
          //  서버가 안 채우면 고객이 「[확인 필요: 요일]」을 그대로 받는다.
          //  filledValues 는 서버 사실 잠금 재검사·기록용으로 함께 보낸다.
          ...(emailMode(channel) && emailComposedBody
            ? {
                email: {
                  subject: emailComposedBody.subject,
                  preheader: emailComposedBody.preheader,
                  bodyJson: emailComposedBody,
                  filledValues: emailFilled,
                  attachments: emailAttachments,
                },
              }
            : {}),
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setConfirmOpen(false);
      setJobId(j.data.jobId);
      // 새 발송은 옛 값을 덮어쓴다 — 새로고침해도 이 작업의 진행 표를 다시 연다.
      try { sessionStorage.setItem(JOB_ID_STORE_KEY, String(j.data.jobId)); } catch { /* 보관함을 못 써도 발송은 돈다 */ }
      // 새 발송은 이 화면에서 대상·안내문을 다 고른 것이라 확인 표를 그대로 그린다.
      setRestoredFromStore(false);
      // 옛 응답에는 skipped 가 없다 → null 이면 아래 두 옛 안내가 대신 뜬다.
      setSkipped(skippedNotice(j.data?.skipped));
      setDroppedPicked([]); // 발송이 시작되면 1단계 알림은 제 몫을 다했다
      setBlockedCount(Number(j.data.blockedCount ?? 0));
      setSendOutOfScopeCount(Number(j.data.outOfScopeCount ?? 0));
      // 발송은 됐지만 알려 둘 일(직접 입력 주소 저장 실패 등) — 조용히 버리지 않는다.
      setSendWarnings(Array.isArray(j.data?.warnings) ? j.data.warnings.map((w: unknown) => String(w)) : []);
      setPollError("");
      setSendStartedAt(new Date());
      setSendFinishedAt(null);
      const chatOn = channel !== "email";
      const emailOn = emailMode(channel);
      setProgress({
        status: "running",
        total: j.data.total,
        sent: 0,
        failed: 0,
        error: "",
        stalled: false,
        failedRows: [],
        recipients: [],
        // ★통로별 인원은 **이 응답에만** 있다 — 진행 조회는 안 준다. 아래 폴링이 덮어쓸 때 남긴다.
        chatTotal: j.data?.chatTotal == null ? null : Number(j.data.chatTotal),
        emailTotal: j.data?.emailTotal == null ? null : Number(j.data.emailTotal),
        channelChat: chatOn,
        channelEmail: emailOn,
        emailStatus: emailOn ? "running" : "",
        emailSent: 0,
        emailFailed: 0,
        stopRequested: false,
        emailSubject: emailOn ? emailComposedBody?.subject ?? "" : "",
      });
    } catch (e) {
      // 모달을 먼저 닫아야 화면 위 오류 상자가 덮개에 가리지 않는다.
      setConfirmOpen(false);
      alertError(`발송을 시작하지 못했어요: ${String((e as Error).message)}`);
    } finally {
      setSending(false);
    }
  }, [selected, originalText, composedText, noticeCategory, channel, manualEmails, alertError, loadingTargets, loadError, emailComposedBody, emailFilled, emailAttachments]);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    // ★실패를 삼키기만 하면 연결이 끊겨도 「보내는 중」이 영영 남는다 — 3회 연속 실패부터 안내를 띄운다.
    let misses = 0;
    const POLL_MISS_LIMIT = 3;
    const missed = (message: string) => {
      misses += 1;
      if (misses >= POLL_MISS_LIMIT) setPollError(message);
    };
    // ★앞 조회가 안 끝났으면 다음 회차를 건너뛴다 — 서버가 느릴 때 2초마다 요청이 쌓여 장애를 키운다.
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/bulk-message/jobs/${jobId}`);
        const j = await res.json();
        if (!alive) return;
        if (j.success) {
          misses = 0;
          setPollError("");
          // ★통로별 인원(chatTotal·emailTotal)은 진행 조회 응답에 없다 — 덮어쓰면 막대가 통째로 틀어진다.
          setProgress((prev) => ({
            ...(j.data as Progress),
            chatTotal: prev?.chatTotal ?? null,
            emailTotal: prev?.emailTotal ?? null,
          }));
          // ★이메일만 보내는 작업은 status 가 처음부터 "done" 이다 — 두 칸을 함께 봐야 멈춘다.
          if (!sendRunning(j.data) && timer) clearInterval(timer);
        } else if (res.status === 404) {
          // 남의 작업·없는 작업이면 적어 둔 번호를 지우고 **1단계로 돌려보낸다** —
          // jobId 를 남기면 1·2단계가 잠긴 채(canGo) 화면이 갇힌다.
          try { sessionStorage.removeItem(JOB_ID_STORE_KEY); } catch { /* 무시 */ }
          if (timer) clearInterval(timer);
          setJobId("");
          setProgress(null);
          setRestoredFromStore(false);
          setPollError("");
          setStep(1);
          alertError(JOB_GONE_NOTICE);
          return;
        } else {
          missed(typeof j.error === "string" && j.error ? j.error : "진행 상황을 불러오지 못했어요.");
        }
      } catch {
        if (alive) missed("진행 상황을 불러오지 못했어요.");
      } finally {
        inFlight = false;
      }
    };
    timer = setInterval(tick, 2000);
    void tick();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [jobId, pollKey, alertError]);

  /**
   * 끝난 것을 본 순간을 종료 시각으로 적는다.
   * ★서버가 끝난 시각을 안 준다(진행 조회에 시각 칸이 없다) — 그래서 **이 화면에서 보낸** 발송에만
   *  적고(시작 시각이 있는 경우), 되살린 화면에는 아무 시각도 안 그린다.
   */
  useEffect(() => {
    if (!sendStartedAt || sendFinishedAt) return;
    if (!progress || sendRunning(progress)) return;
    setSendFinishedAt(new Date());
  }, [progress, sendStartedAt, sendFinishedAt]);

  /**
   * 「발송 중단」 — 아직 안 나간 이메일을 그 자리에서 멈춘다(이미 나간 메일은 되돌릴 수 없다).
   * ★확인은 위들리 Modal 로 받는다(브라우저 confirm 금지).
   */
  const stopJob = useCallback(async () => {
    if (!jobId) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/bulk-message/jobs/${jobId}/stop`, { method: "POST" });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setStopOpen(false);
      // 다음 조회를 기다리지 않고 단추부터 닫는다 — 두 번 눌러 두 번 부르는 일을 막는다.
      setProgress((p) => (p ? { ...p, stopRequested: true } : p));
      setPollKey((k) => k + 1);
    } catch (e) {
      setStopOpen(false);
      alertError(`발송을 중단하지 못했어요: ${String((e as Error).message)}`);
    } finally {
      setStopping(false);
    }
  }, [jobId, alertError]);

  const pending = progress ? Math.max(0, progress.total - progress.sent - progress.failed) : 0;
  /** 채널톡에는 안내가 심겼는데 **알림톡만** 못 나간 사람 수. 요약의 「보냄」에 섞여 있어 따로 센다. */
  const alimtalkFailedCount = alimtalkFailedCountOf(progress?.recipients ?? []);
  const canResume =
    !!jobId && !!progress && (progress.status === "interrupted" || progress.status === "failed") && pending > 0;

  const resume = useCallback(async () => {
    try {
      const res = await fetch(`/api/bulk-message/jobs/${jobId}/resume`, { method: "POST" });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setProgress((p) => (p ? { ...p, status: "running", error: "" } : p));
      setPollKey((k) => k + 1);
    } catch (e) {
      alertError(`이어보내지 못했어요: ${String((e as Error).message)}`);
    }
  }, [jobId, alertError]);

  // ── 발송 기록 탭 ─────────────────────────────────────────────
  //
  // 「발송하기」와 완전히 따로 도는 판이다 — 여기 상태는 발송 상태를 건드리지 않는다.
  // ★탭을 열기 전에는 아무것도 안 부른다(`historyActive`). 화면을 띄우기만 해도 조회가 나가면
  //  이메일을 안 쓰는 담당자에게도 매번 수신자 표를 훑게 한다.
  const [historyActive, setHistoryActive] = useState(false);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("jobs");
  const [historyQ, setHistoryQ] = useState("");
  const [historyJobs, setHistoryJobs] = useState<HistoryJobRow[]>([]);
  const [historyCompanies, setHistoryCompanies] = useState<HistoryCompanyRow[]>([]);
  /**
   * 지금 목록이 **답하고 있는** 검색어. `historyQ` 와 다르면 아직 응답 전이라는 뜻이라,
   * 화면이 그 동안만 옛 목록을 스스로 좁혀 보여 준다(filterJobs).
   * ★응답이 도착한 뒤에는 서버 결과를 그대로 믿는다 — 수신자 이름으로 걸린 발송은
   *  목록 줄에 회사 이름이 없어 화면이 다시 거르면 **맞는 결과가 사라진다.**
   */
  const [historyLoadedQ, setHistoryLoadedQ] = useState("");
  /** 지금 무엇을 보고 있나 — 목록 / 발송 상세 / 회사 상세. */
  const [historyView, setHistoryView] = useState<"list" | "job" | "company">("list");
  const [historyJob, setHistoryJob] = useState<HistoryJobRow | null>(null);
  /**
   * 고른 발송의 수신자별 신호 — **기록 상세 통로** 응답(`history/jobs/[id]`).
   * ★3단계 진행 조회와 다른 줄이다 — 여기는 서버가 판정한 신호 한 마디와 회사 열쇠·서식 유무가 온다.
   */
  const [historyJobRecipients, setHistoryJobRecipients] = useState<HistoryJobRecipient[]>([]);
  const [historyCompany, setHistoryCompany] = useState<HistoryCompanyDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  /** 늦게 온 응답이 새 요청 결과를 덮지 않게 세는 번호(1단계 목록 조회와 같은 방식). */
  const historySeq = useRef(0);

  // ── 「서식 보기」 모달 ─────────────────────────────────────────
  //
  // ★목록·상세 조회와 **다른 번호표**를 쓴다 — 서식을 불러오는 동안 뒤에서 목록이 바뀌어도
  //  모달이 닫히거나 엉뚱한 서식이 들어오지 않게.
  const [historyMail, setHistoryMail] = useState<HistoryMailState | null>(null);
  const mailSeq = useRef(0);
  /** 다시 시도가 무엇을 다시 부를지 — 누른 줄과 그 발송 번호를 그대로 들고 있는다. */
  const mailTarget = useRef<{ jobId: string; r: HistoryJobRecipient } | null>(null);

  const closeHistoryMail = useCallback(() => {
    mailSeq.current += 1; // 돌아가는 중이던 서식 조회 응답은 버린다
    mailTarget.current = null;
    setHistoryMail(null);
  }, []);

  const loadHistoryMail = useCallback(async (jobId: string, r: HistoryJobRecipient) => {
    const seq = ++mailSeq.current;
    mailTarget.current = { jobId, r };
    // 누른 줄의 신원을 먼저 세운다 — 불러오는 동안에도 「누구에게 간 서식인지」가 모달에 보여야 한다.
    setHistoryMail({
      recipientId: r.id,
      companyName: r.companyName,
      representative: r.representative,
      phone: r.phone,
      email: r.email,
      subject: "",
      html: "",
      loading: true,
      error: "",
      expired: false,
    });
    try {
      const res = await fetch(
        `/api/bulk-message/history/jobs/${encodeURIComponent(jobId)}/mail?recipient=${encodeURIComponent(r.id)}`,
      );
      const j = await res.json().catch(() => null);
      if (seq !== mailSeq.current) return;
      if (!res.ok || j?.success !== true) {
        throw new Error(loadErrorText(j?.error, "잠시 후 다시 시도해 주세요."));
      }
      setHistoryMail((prev) =>
        prev
          ? {
              ...prev,
              subject: String(j.data?.subject ?? ""),
              // 서버가 서식을 안 주면(지워졌거나 없는 줄) 빈 글자 — 화면이 지어내지 않는다.
              html: String(j.data?.html ?? ""),
              expired: j.data?.expired === true,
              loading: false,
            }
          : prev,
      );
    } catch (e) {
      if (seq !== mailSeq.current) return;
      setHistoryMail((prev) =>
        prev ? { ...prev, loading: false, error: loadErrorText(e, "서식을 불러오지 못했어요.") } : prev,
      );
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const seq = ++historySeq.current;
    const mode = historyMode;
    const q = historyQ;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(
        `/api/bulk-message/history?mode=${mode}&q=${encodeURIComponent(q.trim())}`,
      );
      const j = await res.json().catch(() => null);
      if (seq !== historySeq.current) return;
      if (!res.ok || j?.success !== true) {
        throw new Error(loadErrorText(j?.error, "잠시 후 다시 시도해 주세요."));
      }
      const rows = Array.isArray(j.data?.rows) ? j.data.rows : [];
      if (mode === "companies") setHistoryCompanies(rows as HistoryCompanyRow[]);
      else setHistoryJobs(rows as HistoryJobRow[]);
      setHistoryLoadedQ(q);
    } catch (e) {
      if (seq !== historySeq.current) return;
      setHistoryError(`발송 기록을 불러오지 못했어요: ${loadErrorText(e, "잠시 후 다시 시도해 주세요.")}`);
    } finally {
      if (seq === historySeq.current) setHistoryLoading(false);
    }
  }, [historyMode, historyQ]);

  useEffect(() => {
    if (!historyActive) return;
    // 상세를 보는 동안에는 목록을 다시 부르지 않는다 — 뒤에서 목록이 바뀌어도 보던 상세는 그대로다.
    if (historyView !== "list") return;
    const timer = setTimeout(() => { void loadHistory(); }, HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [historyActive, historyView, loadHistory]);


  /**
   * 발송 한 건의 수신자별 신호를 연다.
   *
   * ★**기록 상세 통로**를 부른다(`history/jobs/[id]`) — 3단계가 쓰는 진행 조회(`jobs/[id]`)가 아니다.
   *  진행 조회는 「내가 보낸 것」만 열어 줘서, 목록에 보이는 남의 발송을 누르면 404 가 왔다.
   *  기록 통로는 같은 앱의 모든 직원 발송을 열어 주므로 화면에서 막던 안내도 함께 걷어냈다.
   * ★응답의 `job` 은 쓰지 않는다 — 머리 카드는 목록 줄이 들고 온 값(제목·통로)으로 그린다.
   *  기록 상세 응답에는 제목·통로 칸이 없다.
   */
  const openHistoryJob = useCallback(async (job: HistoryJobRow) => {
    const seq = ++historySeq.current;
    closeHistoryMail(); // 다른 발송을 열면 앞 발송의 서식 모달은 닫는다
    setHistoryView("job");
    setHistoryJob(job);
    setHistoryCompany(null);
    setHistoryJobRecipients([]);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(`/api/bulk-message/history/jobs/${encodeURIComponent(job.id)}`);
      const j = await res.json().catch(() => null);
      if (seq !== historySeq.current) return;
      if (!res.ok || j?.success !== true) {
        throw new Error(loadErrorText(j?.error, "잠시 후 다시 시도해 주세요."));
      }
      const rows = Array.isArray(j.data?.recipients) ? j.data.recipients : [];
      setHistoryJobRecipients(rows as HistoryJobRecipient[]);
    } catch (e) {
      if (seq !== historySeq.current) return;
      setHistoryError(loadErrorText(e, "발송 상세를 불러오지 못했어요."));
    } finally {
      if (seq === historySeq.current) setHistoryLoading(false);
    }
  }, [closeHistoryMail]);

  /** 누른 줄의 서식을 띄운다 — 어느 발송의 줄인지는 지금 열려 있는 발송 상세가 안다. */
  const openHistoryMail = useCallback(
    (r: HistoryJobRecipient) => {
      const jobId = historyJob?.id ?? "";
      if (!jobId || !r.id) return;
      void loadHistoryMail(jobId, r);
    },
    [historyJob, loadHistoryMail],
  );

  const retryHistoryMail = useCallback(() => {
    const t = mailTarget.current;
    if (!t) return;
    void loadHistoryMail(t.jobId, t.r);
  }, [loadHistoryMail]);

  /**
   * 「다시 시도」 — 지금 보고 있는 판을 다시 부른다.
   * ★발송 상세도 다시 부른다 — 남의 발송이라 막히던 갈래가 사라져, 여기서 나는 오류는
   *  이제 일시적 실패다(눌러 볼 값어치가 있다).
   */
  const retryHistory = useCallback(() => {
    if (historyView === "job" && historyJob) { void openHistoryJob(historyJob); return; }
    void loadHistory();
  }, [historyView, historyJob, openHistoryJob, loadHistory]);

  /**
   * 회사 한 곳이 받은 모든 안내를 연다(열쇠는 서버 값 그대로).
   *
   * ★사업장별 목록에서도, 발송 상세의 「이 회사의 다른 발송 ›」에서도 이 함수 하나로 온다.
   *  그래서 보기를 「사업장별」로 함께 돌려놓는다 — 닫으면 「사업장 목록으로」 라고 적힌
   *  단추가 실제로 사업장 목록으로 가야 한다.
   */
  const openHistoryCompany = useCallback(async (key: string) => {
    const seq = ++historySeq.current;
    closeHistoryMail();
    setHistoryMode("companies");
    setHistoryView("company");
    setHistoryJob(null);
    setHistoryJobRecipients([]);
    setHistoryCompany(null);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(`/api/bulk-message/history?company=${encodeURIComponent(key)}`);
      const j = await res.json().catch(() => null);
      if (seq !== historySeq.current) return;
      if (!res.ok || j?.success !== true) {
        throw new Error(loadErrorText(j?.error, "잠시 후 다시 시도해 주세요."));
      }
      setHistoryCompany(j.data as HistoryCompanyDetail);
    } catch (e) {
      if (seq !== historySeq.current) return;
      setHistoryError(`회사 이력을 불러오지 못했어요: ${loadErrorText(e, "잠시 후 다시 시도해 주세요.")}`);
    } finally {
      if (seq === historySeq.current) setHistoryLoading(false);
    }
  }, [closeHistoryMail]);

  const closeHistoryDetail = useCallback(() => {
    historySeq.current += 1; // 돌아가는 중이던 상세 조회 응답은 버린다
    closeHistoryMail();
    setHistoryView("list");
    setHistoryJob(null);
    setHistoryJobRecipients([]);
    setHistoryCompany(null);
    setHistoryError("");
    setHistoryLoading(false);
  }, [closeHistoryMail]);

  // ── 단계 이동 가드 ───────────────────────────────────────────
  const targetsOk = canProceedWithTargets({
    loading: loadingTargets,
    selectedCount,
    loadError,
  });
  /**
   * 발송 전 점검 아홉 줄(이메일). 채널이 「알림톡·채팅」이면 빈 배열이라 3단계가 카드를 안 그린다.
   * ★2단계 잠금(`emailStepReady`)과 같은 재료를 본다 — 두 곳이 다른 기준을 쓰면
   *  2단계는 통과인데 3단계에서만 막히는 일이 생긴다.
   */
  const emailChecks: EmailChecklistItem[] = useMemo(
    () =>
      emailChecklist({
        channel,
        subject: emailSubject,
        preheader: emailPreheader,
        fillMarkers: emailFillMarkers,
        fillValues: emailFilled,
        factLock,
        adSentences,
        attachments: emailAttachments,
      }),
    [channel, emailSubject, emailPreheader, emailFillMarkers, emailFilled, factLock, adSentences, emailAttachments],
  );
  const emailChecksFailed = emailChecklistFailedCount(emailChecks);
  /** 발송 단추가 눌리는 조건 — 대상·상한에 더해 통로별 검문(안내 내용 / 점검 아홉 줄)까지 본다. */
  const sendReady = canConfirmSend({ targetsOk, tooMany, noticeCategory, channel, emailChecks });
  /**
   * 고른 명단에 섞인 환불 고객 — 판정은 환불일 하나뿐(진행상태 글자는 안 본다).
   * ★표 안의 줄별 판정(`refunded`)과 이름이 겹치지 않게 둔다 — 겹치면 안쪽이 바깥을 가린다.
   */
  const refundedInSelection = useMemo(() => refundedNotice(selected), [selected]);
  const listPhase = step1ListPhase({ loading: loadingTargets, loadError });
  /**
   * 채팅 쪽 2단계가 끝났나 — **통로가 「이메일」뿐이면 볼 것이 없다**(채팅 안내문을 만들지 않는다).
   * 이걸 안 가르면 이메일만 보내려는 담당자가 3단계로 영영 못 간다.
   */
  const chatStepReady =
    channel === "email" || (step2ConversionReady && remainingMarkers.length === 0 && !tooLong);
  const chatHint =
    channel === "email"
      ? ""
      : step2FooterHint({
          tooLong,
          composedLength: composedText.length,
          conversionReady: step2ConversionReady,
          remainingFillCount: remainingMarkers.length,
        });
  const emailStepBlocking = emailMode(channel) && !emailStepReady;
  const step2Hint = chatHint || (emailStepBlocking ? EMAIL_STEP2_NOTE : "");
  const canGo = useCallback(
    (s: Step) => {
      if (s === 1) return !jobId; // 발송을 시작하면 대상을 바꿀 수 없다
      if (s === 2) return targetsOk && !jobId;
      return chatStepReady && !emailStepBlocking && targetsOk;
    },
    [targetsOk, chatStepReady, emailStepBlocking, jobId],
  );

  const goStep = useCallback(
    (s: Step) => {
      if (canGo(s)) { setStep(s); return; }
      if (s === 2) {
        if (loadingTargets) alertError("대상을 불러오는 중이에요.");
        else if (loadError) alertError("대상을 다시 불러온 뒤에 진행해 주세요.");
        else alertError("받을 분을 한 명 이상 골라 주세요.");
      } else if (s === 3) {
        if (channel === "email") {
          if (emailStepBlocking) alertError(EMAIL_STEP2_NOTE);
          else alertError("받을 분을 한 명 이상 골라 주세요.");
        } else if (!step2ConversionReady) alertError("안내문을 먼저 만들어 주세요.");
        else if (remainingMarkers.length) alertError(`「확인 필요」 표시 ${remainingMarkers.length}곳을 먼저 채워 주세요.`);
        else if (tooLong) alertError(composedLengthNotice(composedText.length));
        else if (emailStepBlocking) alertError(EMAIL_STEP2_NOTE);
        else if (!targetsOk) alertError("받을 분을 한 명 이상 골라 주세요.");
        else alertError("받을 분을 한 명 이상 골라 주세요.");
      } else alertError("발송을 시작한 뒤에는 받을 분을 바꿀 수 없어요.");
    },
    [canGo, channel, step2ConversionReady, remainingMarkers, alertError, loadingTargets, loadError, tooLong, composedText.length, targetsOk, emailStepBlocking],
  );
  // ── 그리기 ──────────────────────────────────────────────────
  const noticeCategoryOptions = useMemo(
    () => NOTICE_CATEGORIES.map((c) => ({ value: c, label: c })),
    [],
  );
  /**
   * 시험 발송 안내에 **보여 줄** 안내구분 — 3단계에서 고른 값이 있으면 그 값, 없으면 서버 기본값.
   * ★보여 주기만 한다. 보내는 값은 여전히 noticeCategory 그대로다(빈 값이면 빈 값) —
   *  화면이 기본값 글자를 지어내 실어 보내면 서버 검문(목록에 없는 값은 거절)에 걸린다.
   */
  const noticeCategoryPicked = noticeCategory.trim();
  const testNoticeCategoryLabel = noticeCategoryPicked || DEFAULT_NOTICE_CATEGORY_LABEL;

  /** 진행 막대가 읽는 값 — 통로마다 세는 칸이 다르다(chat: sent+failed / email: emailSent+emailFailed). */
  const sendProgress = progressOf(progress, channel);
  /** 아직 안 나간 사람 — 통로 기준으로 센다(이메일만 보낼 때 채팅 숫자로 세면 늘 전원이 남는다). */
  const remaining = Math.max(0, sendProgress.total - sendProgress.done);
  const stopAllowed = canStopSend(progress);
  const sending2 = sendRunning(progress);

  return {
    errorMsg,
    step,
    canGo,
    goStep,
    myName,
    myEmail,
    managerFilter,
    onManagerChange,
    managerOptions,
    lockedToMe,
    search,
    setSearch,
    channel,
    setChannel,
    targetCounts,
    noEmailCount,
    pickedTotals,
    manualEmails,
    manualEdits,
    startManualEmail,
    changeManualEmail,
    toggleManualPersist,
    cancelManualEmail,
    saveManualEmail,
    visibleTargets,
    picked,
    droppedPicked,
    setDroppedPicked,
    pricing,
    loadingTargets,
    loadedOnce,
    loadError,
    retryLoad,
    sendableTargets,
    excluded,
    excludeSummary,
    selected,
    selectedCount,
    cost,
    tooMany,
    allChecked,
    hiddenPicked,
    toggleOne,
    toggleAll,
    listPhase,
    targetsOk,
    originalText,
    setOriginalText,
    finalText,
    setFinalText,
    fillValues,
    setFillValues,
    adWords,
    converting,
    streamHasChunk,
    converted,
    editing,
    originalRef,
    composedText,
    fillMarkers,
    remainingMarkers,
    fillsComplete,
    tooLong,
    step2ConversionReady,
    fillFormVisible,
    canTestSend,
    showTestSendWait,
    convert,
    insertToken,
    toggleEditing,
    step2Hint,
    testOpen,
    setTestOpen,
    testPhone,
    setTestPhone,
    testSending,
    testDone,
    setTestDone,
    testError,
    setTestError,
    testSend,
    // 2단계 이메일
    emailBody,
    emailSubject,
    setEmailSubject,
    emailPreheader,
    setEmailPreheader,
    emailWarnings,
    adSentences,
    factLock,
    emailFilled,
    setEmailFilled,
    emailFillMarkers,
    emailAttachments,
    addAttachments,
    removeAttachment,
    attachError,
    attachUploading,
    previewHtml,
    previewLoading,
    previewError,
    previewDevice,
    setPreviewDevice,
    previewReal,
    setPreviewReal,
    previewRecipient,
    emailPreviewTargets,
    nextPreviewRecipient,
    emailConverting,
    emailError,
    convertEmail,
    editEmailBody,
    emailStepReady,
    testSendEmail,
    emailTestSending,
    emailTestDone,
    emailTestError,
    noticeCategory,
    setNoticeCategory,
    noticeCategoryOptions,
    noticeCategoryPicked,
    testNoticeCategoryLabel,
    confirmOpen,
    setConfirmOpen,
    sending,
    jobId,
    progress,
    skipped,
    blockedCount,
    sendOutOfScopeCount,
    pollError,
    restoredFromStore,
    send,
    pending,
    alimtalkFailedCount,
    canResume,
    resume,
    sendReady,
    refundedInSelection,
    // 3단계 이메일
    emailChecks,
    emailChecksFailed,
    sendWarnings,
    sendProgress,
    remaining,
    sendRunning: sending2,
    stopAllowed,
    stopOpen,
    setStopOpen,
    stopping,
    stopJob,
    sendStartedAt,
    sendFinishedAt,
    // 발송 기록 탭
    historyActive,
    setHistoryActive,
    historyMode,
    setHistoryMode,
    historyQ,
    setHistoryQ,
    historyLoadedQ,
    historyJobs,
    historyCompanies,
    historyView,
    historyJob,
    historyJobRecipients,
    historyCompany,
    historyLoading,
    historyError,
    openHistoryJob,
    openHistoryCompany,
    closeHistoryDetail,
    retryHistory,
    historyMail,
    openHistoryMail,
    closeHistoryMail,
    retryHistoryMail,
  };
}
