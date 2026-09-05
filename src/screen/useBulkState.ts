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
import { MAX_RECIPIENTS } from "./limits";
import {
  MANAGER_MINE,
  canProceedWithTargets,
  hiddenPickedCount,
  listFetchDelayMs,
  managerQueryOf,
  managerSelectOptions,
  mergeDropped,
  mergeManagerNames,
  nextManagerLock,
  reconcilePicked,
  step1ListPhase,
  uniqueManagers,
  type ManagerLock,
  type PickedDrop,
} from "./step1-helpers";
import {
  CONVERT_DEBOUNCE_MS,
  CONVERT_INCOMPLETE_MESSAGE,
  MIN_ORIGINAL_LEN,
  allFillsComplete,
  applyFillValues,
  composedLengthNotice,
  composedTooLong,
  conversionReady,
  convertApiErrorMessage,
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
  DEFAULT_NOTICE_CATEGORY_LABEL,
  DEFAULT_PRICING,
  JOB_GONE_NOTICE,
  NOTICE_CATEGORIES,
  alimtalkFailedCountOf,
  canConfirmSend,
  estimateCost,
  parsePricing,
  refundedNotice,
  restoredJobFromStore,
  skippedNotice,
  type BulkPricing,
  type SkippedNotice,
} from "./step3-helpers";

// ────────────────────────────────────────────────────────────── 타입·상수


export interface Target {
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
}

export interface FailedRow {
  companyName: string;
  representative: string;
  phone: string;
  error: string;
}

/** 발송 결과 한 줄. 연락처는 서버가 가려서 준다. */
export interface RecipientRow extends FailedRow {
  status: string;
  /** "sent" | "failed" | "" — 빈 값은 「모름」이다(성공으로 위장하지 않는다). */
  alimtalkStatus: string;
  /** 알림톡만 실패했을 때의 사유. 옛 응답에는 없다. */
  alimtalkError?: string;
  viewedAt: string | null;
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
}

export type Step = 1 | 2 | 3;

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

  // 보낸 사람 이름(답장 배정 안내에 쓴다)
  const [myName, setMyName] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.name) setMyName(String(j.name)); })
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
      //  단 **이번 목록에 있는데 보낼 수 없게 바뀐 줄**(수신거부·중복 번호)은 자동으로 빼고 알린다.
      //  판정 규칙은 reconcilePicked 가 혼자 안다(시험이 못을 박아 둔다).
      const fixed = reconcilePicked(pickedRef.current, t.map((x) => ({ key: keyOf(x), row: x })));
      setPicked(fixed.picked); // 바뀐 게 없으면 같은 Map 이라 React 가 다시 그리지 않는다
      // ★알림은 쌓는다 — 다음 조회가 「누가 왜 빠졌는지」를 지워 버리면 사람이 영영 못 본다.
      //  단 다시 보낼 수 있게 된 사람은 지운다(그 줄엔 「체크가 잠깁니다」가 더 이상 사실이 아니다).
      const sendableNow = t.filter((x) => x.sendable).map(keyOf);
      setDroppedPicked((prev) => mergeDropped(prev, fixed.dropped, sendableNow));
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
  const visibleTargets = targets;
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
  }, [step, originalText, lastConvertedOriginal, convert]);

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
      const recipients = selected.map((t) => ({
        // 목록에서 고른 줄은 rowId 만 보낸다 — 화면이 가진 번호는 가려진 것이라 못 쓴다.
        // 서버가 rowId 로 자료에서 원문을 다시 찾는다(rowId 가 없는 줄은 지금 통로엔 오지 않는다).
        phone: t.rowId ? "" : t.phone,
        companyName: t.companyName,
        representative: t.representative,
        rowId: t.rowId,
      }));
      const res = await fetch("/api/bulk-message/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText, finalText: composedText, recipients, noticeCategory }),
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
      setPollError("");
      setProgress({
        status: "running",
        total: j.data.total,
        sent: 0,
        failed: 0,
        error: "",
        stalled: false,
        failedRows: [],
        recipients: [],
      });
    } catch (e) {
      // 모달을 먼저 닫아야 화면 위 오류 상자가 덮개에 가리지 않는다.
      setConfirmOpen(false);
      alertError(`발송을 시작하지 못했어요: ${String((e as Error).message)}`);
    } finally {
      setSending(false);
    }
  }, [selected, originalText, composedText, noticeCategory, alertError, loadingTargets, loadError]);

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
          setProgress(j.data as Progress);
          if (j.data.status !== "running" && timer) clearInterval(timer);
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

  // ── 단계 이동 가드 ───────────────────────────────────────────
  const targetsOk = canProceedWithTargets({
    loading: loadingTargets,
    selectedCount,
    loadError,
  });
  /** 발송 단추가 눌리는 조건 — 대상·상한에 더해 **안내 내용을 골랐는지**까지 본다. */
  const sendReady = canConfirmSend({ targetsOk, tooMany, noticeCategory });
  /**
   * 고른 명단에 섞인 환불 고객 — 판정은 환불일 하나뿐(진행상태 글자는 안 본다).
   * ★표 안의 줄별 판정(`refunded`)과 이름이 겹치지 않게 둔다 — 겹치면 안쪽이 바깥을 가린다.
   */
  const refundedInSelection = useMemo(() => refundedNotice(selected), [selected]);
  const listPhase = step1ListPhase({ loading: loadingTargets, loadError });
  const step2Hint = step2FooterHint({
    tooLong,
    composedLength: composedText.length,
    conversionReady: step2ConversionReady,
    remainingFillCount: remainingMarkers.length,
  });
  const canGo = useCallback(
    (s: Step) => {
      if (s === 1) return !jobId; // 발송을 시작하면 대상을 바꿀 수 없다
      if (s === 2) return targetsOk && !jobId;
      return step2ConversionReady && remainingMarkers.length === 0 && targetsOk && !tooLong;
    },
    [targetsOk, step2ConversionReady, remainingMarkers, jobId, tooLong],
  );

  const goStep = useCallback(
    (s: Step) => {
      if (canGo(s)) { setStep(s); return; }
      if (s === 2) {
        if (loadingTargets) alertError("대상을 불러오는 중이에요.");
        else if (loadError) alertError("대상을 다시 불러온 뒤에 진행해 주세요.");
        else alertError("받을 분을 한 명 이상 골라 주세요.");
      } else if (s === 3) {
        if (!step2ConversionReady) alertError("안내문을 먼저 만들어 주세요.");
        else if (remainingMarkers.length) alertError(`「확인 필요」 표시 ${remainingMarkers.length}곳을 먼저 채워 주세요.`);
        else if (tooLong) alertError(composedLengthNotice(composedText.length));
        else if (!targetsOk) alertError("받을 분을 한 명 이상 골라 주세요.");
        else alertError("받을 분을 한 명 이상 골라 주세요.");
      } else alertError("발송을 시작한 뒤에는 받을 분을 바꿀 수 없어요.");
    },
    [canGo, step2ConversionReady, remainingMarkers, alertError, loadingTargets, loadError, tooLong, composedText.length, targetsOk],
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

  return {
    errorMsg,
    step,
    canGo,
    goStep,
    myName,
    managerFilter,
    onManagerChange,
    managerOptions,
    lockedToMe,
    search,
    setSearch,
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
  };
}
