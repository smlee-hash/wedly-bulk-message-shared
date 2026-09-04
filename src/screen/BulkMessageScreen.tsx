"use client";

// 단체 안내 발송 — 3단계 마법사(받을 분 고르기 → 안내문 만들기 → 발송 확인).
// 시각 계약(정본): docs/superpowers/specs/2026-09-01-bulk-message-mockup.html
//  - 이중 베젤 카드(Card 기본) · 알약 탭 · 아이콘 타일 숫자 카드(StatCard) · 흰 칩+색 점 딱지(Badge)
//  - 파란 표 머리 · 상태 박스 v3(StatusBox) · 구역 머리(번호 + 색 타일 + 밑선)
// 금지: 브라우저 confirm/alert, 기본 <select>, raw Tailwind 색.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Eye,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Checkbox, ProgressBar, Skeleton, StatCard, StatusBox, Textarea } from "@wedly/ui-shared/ui";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import CustomSelect from "../ui/CustomSelect";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { detectAdWords } from "../rules/checks";
import { cn } from "../ui/cn";
import { BulkMessageManual } from "./BulkMessageManual";
import { MAX_RECIPIENTS } from "./limits";
import {
  LOADING_TARGETS_HINT,
  MANAGER_LOCKED_LABEL,
  MANAGER_MINE,
  MANAGER_UNKNOWN_LABEL,
  SEARCH_PLACEHOLDER,
  canProceedWithTargets,
  droppedSummary,
  hiddenPickedCount,
  listFetchDelayMs,
  isRefunded,
  managerControl,
  managerQueryOf,
  managerSelectOptions,
  mergeDropped,
  mergeManagerNames,
  nextManagerLock,
  reconcilePicked,
  statusBadgeOf,
  step1ListPhase,
  uniqueManagers,
  type ManagerLock,
  type PickedDrop,
} from "./step1-helpers";
import {
  CONVERT_DEBOUNCE_MS,
  CONVERT_INCOMPLETE_MESSAGE,
  FILL_MAX_LEN,
  MIN_ORIGINAL_LEN,
  TEST_SEND_WAIT_HINT,
  allFillsComplete,
  applyFillValues,
  applyPreviewExamples,
  clampFillValue,
  composedLengthNotice,
  composedTooLong,
  conversionReady,
  convertApiErrorMessage,
  insertAtCursor,
  isAbortError,
  needsFillLabel,
  originalTooShort,
  readPlainTextStream,
  shouldAutoConvert,
  step2FooterHint,
  testSendAllowed,
  uniqueNeedsFill,
} from "./step2-helpers";
import {
  JOB_GONE_NOTICE,
  NOTICE_CATEGORIES,
  alimtalkBadgeOf,
  alimtalkFailedCountOf,
  canConfirmSend,
  failureReasonOf,
  progressHeadline,
  refundedNotice,
  restoredJobFromStore,
  skippedNotice,
  type SkippedNotice,
} from "./step3-helpers";

// ────────────────────────────────────────────────────────────── 타입·상수

interface Target {
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

interface FailedRow {
  companyName: string;
  representative: string;
  phone: string;
  error: string;
}

/** 발송 결과 한 줄. 연락처는 서버가 가려서 준다. */
interface RecipientRow extends FailedRow {
  status: string;
  /** "sent" | "failed" | "" — 빈 값은 「모름」이다(성공으로 위장하지 않는다). */
  alimtalkStatus: string;
  /** 알림톡만 실패했을 때의 사유. 옛 응답에는 없다. */
  alimtalkError?: string;
  viewedAt: string | null;
}

interface Progress {
  status: string;
  total: number;
  sent: number;
  failed: number;
  error: string;
  stalled: boolean;
  failedRows: FailedRow[];
  recipients: RecipientRow[];
}

type Step = 1 | 2 | 3;

/** 서버(checks.ts findNeedsFill)와 같은 규칙 — 담당자가 직접 고친 글도 화면에서 바로 다시 센다. */
const NEEDS_FILL_RE = /\[확인 필요[^\]]*\]/g;

/** 채널톡 알림 1건 단가(원) — 시안의 「7~28원/건」 안내와 같은 값. */
const COST_MIN = 7;
const COST_MAX = 28;

// MAX_RECIPIENTS 는 limits.ts 에 있다 — 사용방법 탭도 같은 값을 쓰기 때문(고리 방지).

// ────────────────────────────────────────────────────────────── 작은 도구

/**
 * 화면에 쓸 연락처.
 *
 * ★목록 줄(rowId 있음)의 번호는 **서버가 이미 가려서**(010-2•••-4567) 내려 준다 —
 *  화면은 원문을 아예 받지 않는다. 발송할 때 서버가 rowId 로 원문을 다시 찾아 쓴다.
 *  rowId 가 없는 줄은 지금 통로에는 없지만(붙여넣기 폐지), 옛 응답이 섞여 와도 안 깨지게 남겨 둔다.
 */
function displayPhone(t: { rowId: string; phone: string }): string {
  if (t.rowId) return t.phone || "—";
  const p = t.phone;
  if (!/^01\d{8,9}$/.test(p)) return "—";
  return p.length === 11
    ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
    : `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
}

/**
 * 줄을 가리키는 열쇠.
 *
 * ★번호로 세면 안 된다 — 가린 번호는 서로 겹칠 수 있어(010-2•••-4567 이 두 사람일 수 있다)
 *  한 사람을 고르면 다른 사람까지 같이 골라진다. 목록 줄은 rowId 로 센다.
 */
function keyOf(t: { rowId: string; phone: string }): string {
  return t.rowId || t.phone;
}

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

const TOKEN_CHIPS = ["{대표명}", "{회사명}"] as const;

/** 미리보기 — 「[확인 필요…]」 표식만 노란 표시로 도드라지게 그린다. */
function renderPreview(text: string): ReactNode[] {
  const marks = text.match(NEEDS_FILL_RE) ?? [];
  const chunks = text.split(NEEDS_FILL_RE);
  const out: ReactNode[] = [];
  chunks.forEach((chunk, i) => {
    if (chunk) out.push(<span key={`c${i}`}>{chunk}</span>);
    const mark = marks[i];
    if (mark) {
      out.push(
        <mark
          key={`m${i}`}
          className="rounded border border-wedly-gold bg-wedly-bg-yellow px-1 font-semibold text-wedly-t1"
        >
          {mark}
        </mark>,
      );
    }
  });
  return out;
}

function FillForm({
  markers,
  values,
  onChange,
}: {
  markers: string[];
  values: Record<string, string>;
  onChange: (marker: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wedly-gold shadow-sm">
          <AlertTriangle className="h-5 w-5 text-wedly-navy" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-wedly-sub font-semibold text-wedly-t1">채워야 할 내용</p>
          <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">
            원문에 없던 값은 오른쪽 칸에 적어 주세요. 미리보기에 바로 반영됩니다.
          </p>
        </div>
      </div>
      <div className="divide-y divide-wedly-bd/60 rounded-xl border border-wedly-bd/60 bg-wedly-bg-gray">
        {markers.map((m, i) => {
          const label = needsFillLabel(m);
          const id = `bm-fill-${i}`;
          return (
            <div
              key={m}
              className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(8rem,0.9fr)_minmax(0,1.4fr)] sm:items-center"
            >
              <label htmlFor={id} className="text-wedly-tablehead font-semibold text-wedly-t1 break-keep">
                {label}
              </label>
              <Input
                id={id}
                value={values[m] ?? ""}
                onChange={(e) => onChange(m, clampFillValue(e.target.value))}
                placeholder="여기에 적어 주세요"
                autoComplete="off"
                maxLength={FILL_MAX_LEN}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── 구역 머리

type Tone = "accent" | "purple" | "green";

const TILE_TONE: Record<Tone, string> = {
  accent: "bg-wedly-accent text-white",
  purple: "bg-wedly-purple text-white",
  green: "bg-wedly-green text-white",
};
const BAR_TONE: Record<Tone, string> = {
  accent: "bg-wedly-accent",
  purple: "bg-wedly-purple",
  green: "bg-wedly-green",
};

function SectionHead({
  no,
  tone,
  icon: Icon,
  title,
  desc,
}: {
  no: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-wedly-tablehead font-bold text-wedly-accent-ink tabular-nums">{no}</span>
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-sm",
            TILE_TONE[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h2 className="min-w-0 text-wedly-section font-semibold text-wedly-t1 break-keep">{title}</h2>
        <span className="ml-auto text-wedly-hint text-wedly-muted break-keep">{desc}</span>
      </div>
      <div className={cn("ml-[42px] mt-2 h-1 w-10 rounded-full", BAR_TONE[tone])} />
    </div>
  );
}

function LoadingStat() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-wedly-bd bg-white px-4 py-3 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
      <span
        className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-wedly-bd border-t-wedly-accent motion-reduce:animate-none"
        aria-hidden
      />
      <span className="text-wedly-sub text-wedly-t2">불러오는 중…</span>
    </div>
  );
}

function loadErrorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const m = (err as { message: string }).message.trim();
    if (m) return m;
  }
  return fallback;
}

// ────────────────────────────────────────────────────────────── 단계 표시

function Stepper({
  step,
  canGo,
  onGo,
}: {
  step: Step;
  canGo: (s: Step) => boolean;
  onGo: (s: Step) => void;
}) {
  const items: Array<{ n: Step; label: string }> = [
    { n: 1, label: "받을 분 고르기" },
    { n: 2, label: "안내문 만들기" },
    { n: 3, label: "발송 확인" },
  ];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {items.map((it, i) => {
        const on = step === it.n;
        const reachable = canGo(it.n);
        return (
          <div key={it.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-wedly-hint text-wedly-bd-blue">›</span>}
            <button
              type="button"
              onClick={() => onGo(it.n)}
              disabled={!reachable}
              aria-current={on ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-wedly-bd bg-white py-1.5 pl-1.5 pr-3.5 shadow-sm",
                "transition-colors duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                reachable ? "hover:bg-wedly-bg-page" : "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-wedly-hint font-bold tabular-nums",
                  // 색 깔린 바탕 위 글자는 t2 까지만 — muted 는 흰 바탕 전용(대비 3.27~4.22 미달)
                  on ? "bg-wedly-accent text-white" : "bg-wedly-bg-gray text-wedly-t2",
                )}
              >
                {it.n}
              </span>
              <span
                className={cn(
                  "text-wedly-tablehead break-keep",
                  on ? "font-semibold text-wedly-t1" : "font-medium text-wedly-muted",
                )}
              >
                {it.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────── 본체

/**
 * 작업 번호를 적어 두는 자리(탭이 살아 있는 동안만).
 * ★새로고침하면 진행 표가 사라지던 것을 막는다 — 화면이 다시 뜰 때 이 값으로 3단계를 되살린다.
 */
const JOB_ID_STORE_KEY = "wedly-bulk-message:jobId";

/** 화면 보기 탭 — 두 판을 늘 그려 두고 안 보는 쪽만 숨긴다(탭을 옮겨도 상태가 남게). */
const VIEW_TABS = [
  { id: "send", label: "발송하기", tabId: "bulk-tab-send", paneId: "bulk-pane-send" },
  { id: "manual", label: "사용방법", tabId: "bulk-tab-manual", paneId: "bulk-pane-manual" },
] as const;

export default function BulkMessageScreen() {
  const [step, setStep] = useState<Step>(1);
  // 화면 보기 — 「발송하기」와 「사용방법」. 발송 쪽 상태는 이 부품이 들고 있어
  // 사용방법을 보다 돌아와도 고르던 대상·안내문·발송 진행이 그대로 남는다.
  const [view, setView] = useState<"send" | "manual">("send");

  // 주소에 사용방법 구역 표식(#bulk-manual-…)이 붙어 오면 그 판을 열고 그 구역으로 내려 준다.
  // 판은 열려야 자리를 차지하므로 setView 뒤 화면이 한 번 그려진 다음(rAF) 옮긴다.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const hash = window.location.hash;
    if (!hash.startsWith("#bulk-manual-")) return undefined;
    setView("manual");
    const raf = window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

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
      setLockedToMe((prev) => nextManagerLock(prev, { ok: true, lockedToMe: j.data?.lockedToMe }));
      setTargets(t);
      // ★고른 사람은 검색·담당이 바뀌어도 유지한다 — 찾아서 담고, 또 찾아서 담을 수 있어야 한다.
      //  단 **이번 목록에 있는데 보낼 수 없게 바뀐 줄**(수신거부·중복 번호)은 자동으로 빼고 알린다.
      //  판정 규칙은 reconcilePicked 가 혼자 안다(시험이 못을 박아 둔다).
      const fixed = reconcilePicked(pickedRef.current, t.map((x) => ({ key: keyOf(x), row: x })));
      setPicked(fixed.picked); // 바뀐 게 없으면 같은 Map 이라 React 가 다시 그리지 않는다
      // ★알림은 쌓는다 — 다음 조회가 「누가 왜 빠졌는지」를 지워 버리면 사람이 영영 못 본다.
      setDroppedPicked((prev) => mergeDropped(prev, fixed.dropped));
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
        body: JSON.stringify({ finalText: composedText, phone: testPhone }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setTestDone("보냈어요. 휴대폰에서 확인해 주세요.");
    } catch (e) {
      setTestError(String((e as Error).message));
    } finally {
      setTestSending(false);
    }
  }, [composedText, testPhone]);

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
  /**
   * 알림톡 문안의 `#{안내구분}` 에 그대로 들어가는 값.
   * ★기본값을 두지 않는다 — 담당자가 이번 안내가 무엇인지 직접 고르게 한다.
   */
  const [noticeCategory, setNoticeCategory] = useState("");

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

  /** 탭 줄 글쇠 이동 — ←/→ 로 옮기고 Home/End 로 끝으로. 옮기면 포커스도 함께 간다. */
  const onViewTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const last = VIEW_TABS.length - 1;
    const cur = VIEW_TABS.findIndex((v) => v.id === view);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? last
      : e.key === "ArrowLeft" ? (cur <= 0 ? last : cur - 1)
      : (cur >= last ? 0 : cur + 1);
    setView(VIEW_TABS[next].id);
    document.getElementById(VIEW_TABS[next].tabId)?.focus();
  }, [view]);

  // ── 그리기 ──────────────────────────────────────────────────
  const noticeCategoryOptions = useMemo(
    () => NOTICE_CATEGORIES.map((c) => ({ value: c, label: c })),
    [],
  );

  return (
    <>
      {errorMsg && (
        <StatusBox tone="error" title="문제가 생겼어요" className="mb-4">
          {errorMsg}
        </StatusBox>
      )}

      {/* ══════════ 화면 보기 — 발송하기 / 사용방법 ══════════ */}
      <div role="tablist" aria-label="화면 보기" className="mb-4 flex flex-wrap items-center gap-2">
        {VIEW_TABS.map((v) => {
          const on = view === v.id;
          return (
            <button
              key={v.id}
              id={v.tabId}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={v.paneId}
              // 탭 줄은 화살표로 옮긴다 — 탭 글쇠는 판 안으로 들어가야 한다(활성 탭만 0).
              tabIndex={on ? 0 : -1}
              onClick={() => setView(v.id)}
              onKeyDown={onViewTabKeyDown}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent",
                on
                  ? "border border-wedly-accent bg-wedly-accent text-white"
                  : "border border-wedly-bd bg-white text-wedly-t2 hover:bg-wedly-bg-gray",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* 발송 판 — 떼지 않고 숨긴다(사용방법을 보다 돌아와도 고르던 대상·안내문·진행이 그대로). */}
      <div role="tabpanel" id="bulk-pane-send" aria-labelledby="bulk-tab-send" hidden={view !== "send"}>
      <Stepper step={step} canGo={canGo} onGo={goStep} />

      {/* ══════════ 01 받을 분 고르기 ══════════ */}
      {step === 1 && (
        <Card>
          <SectionHead
            no="01"
            tone="accent"
            icon={Users}
            title="받을 분 고르기"
            desc="계약일이 적힌 고객이 자동으로 올라와요. 보낼 분을 체크해 주세요"
          />

          <div className="mb-4 flex flex-wrap items-end gap-3">
            {/* ★화면의 잠금은 거들 뿐이다 — 실제 방어는 서버(lockedToMe 를 내려주는 쪽)에 있다.
                ★아직 답을 못 받았으면(모름) 고르개를 **아예 안 그린다** — 파트너 앱에서 첫 조회가
                  실패했을 때 「전체」를 고를 수 있는 것처럼 보이면 화면이 거짓말을 한다. */}
            {managerControl(lockedToMe) === "picker" ? (
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="bm-manager" className="text-wedly-label font-semibold text-wedly-muted">
                  담당 컨설턴트
                </label>
                <CustomSelect
                  id="bm-manager"
                  aria-label="담당 컨설턴트"
                  value={managerFilter}
                  onChange={onManagerChange}
                  options={managerOptions}
                  // 알약 — 옆의 검색 칸과 같은 모양으로(공용 부품은 안 건드리고 이 화면만).
                  className="w-[200px] [&>button]:rounded-full [&>button]:pl-4"
                />
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-wedly-label font-semibold text-wedly-muted">담당 컨설턴트</span>
                <div
                  className="flex h-10 w-[200px] items-center rounded-full border border-wedly-bd bg-wedly-bg-gray px-4 text-wedly-sub text-wedly-t2"
                  aria-live="polite"
                >
                  {managerControl(lockedToMe) === "locked" ? MANAGER_LOCKED_LABEL : MANAGER_UNKNOWN_LABEL}
                </div>
              </div>
            )}

            <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1">
              <label htmlFor="bm-search" className="text-wedly-label font-semibold text-wedly-muted">
                상호명 · 대표자명 · 연락처 검색
              </label>
              <div className="flex h-10 items-center gap-2 rounded-full border border-wedly-bd bg-white px-4 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wedly-accent">
                <Search className="h-4 w-4 shrink-0 text-wedly-muted" aria-hidden />
                <input
                  id="bm-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={SEARCH_PLACEHOLDER}
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-wedly-sub text-wedly-t1 outline-none placeholder:text-wedly-muted"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="검색어 지우기"
                    className="shrink-0 rounded-full p-0.5 text-wedly-muted transition-colors duration-150 ease-out hover:text-wedly-t1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="-mt-2 mb-4 text-wedly-hint text-wedly-muted break-keep">
            상세창 계약정보에 <b className="font-semibold text-wedly-t1">계약일이 적힌 고객만</b> 올라옵니다.
            회사명·대표자명은 일부만 쳐도 찾아지고, 연락처는 뒷자리 네 개나 전체 번호 모두 됩니다.
          </p>

          {listPhase === "error" && (
            <StatusBox tone="error" title="목록을 불러오지 못했어요" className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-keep">{loadError}</span>
                <Button type="button" variant="secondary" size="sm" onClick={retryLoad}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  다시 시도
                </Button>
              </div>
            </StatusBox>
          )}

          {listPhase !== "error" && (<>
          {/* ★알림은 쌓이고, 사람이 닫거나 발송이 시작될 때만 사라진다 — 다음 조회가 지우면
              검색어를 천천히 치는 동안 「누가 왜 빠졌는지」를 놓친다. */}
          {droppedPicked.length > 0 && (
            <StatusBox
              tone="warning"
              title={`${won(droppedPicked.length)}명은 고른 명단에서 자동으로 뺐어요`}
              className="mb-4"
              actions={
                <Button type="button" variant="secondary" size="sm" onClick={() => setDroppedPicked([])}>
                  알림 닫기
                </Button>
              }
            >
              보낼 수 없게 바뀐 분이라 뺐습니다 — {droppedSummary(droppedPicked)}. 표에는 그대로 남아 있지만 체크가 잠깁니다.
            </StatusBox>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy={loadingTargets}>
            {loadingTargets ? (
              <>
                <LoadingStat />
                <LoadingStat />
                <LoadingStat />
              </>
            ) : (
              <>
                <StatCard
                  icon={Users}
                  label={search.trim() ? "검색에 걸린 고객" : "계약한 고객"}
                  value={`${won(visibleTargets.length)}명`}
                />
                <StatCard icon={UserCheck} label="발송 가능" value={`${won(sendableTargets.length)}명`} />
                <StatCard
                  icon={AlertTriangle}
                  label={excludeSummary ? `자동 제외 · ${excludeSummary}` : "자동 제외"}
                  value={`${won(excluded.length)}명`}
                />
              </>
            )}
          </div>

          <div className="max-h-[440px] overflow-auto rounded-2xl border border-wedly-bd" aria-busy={loadingTargets}>
            <table className="w-full min-w-[720px] border-collapse">
              {/* 표 머리 글자 크기는 머리 묶음이 정한다 — 줄·칸에 크기를 적으면 그것이 이겨서 층이 어긋난다 */}
              <thead className="text-wedly-tablehead">
                <tr className="bg-wedly-accent text-left font-semibold text-white">
                  <th scope="col" className="sticky top-0 z-10 w-10 bg-wedly-accent px-3 py-2.5">
                    <Checkbox
                      checked={allChecked}
                      onChange={toggleAll}
                      disabled={sendableTargets.length === 0}
                      aria-label="보낼 수 있는 사람 전체 고르기"
                    />
                  </th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">회사명</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">대표명</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">연락처</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">계약일</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">진행상태</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">담당</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">발송</th>
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted">
                      불러오는 중…
                    </td>
                  </tr>
                ) : visibleTargets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted break-keep">
                      {search.trim()
                        ? "검색어와 맞는 고객이 없어요. 다른 말로 찾아 보세요."
                        : loadedOnce
                          ? "이 담당자의 계약 고객이 없어요. 담당을 바꿔 보세요."
                          : "잠시만요, 대상을 불러오고 있어요."}
                    </td>
                  </tr>
                ) : (
                  visibleTargets.map((t, i) => {
                    // 환불 판정은 **환불일이 채워졌는지** 하나로 한다(2026-09-04 사장님 확정).
                    // 3단계 경고도 같은 함수(isRefunded)를 봐야 표와 경고가 어긋나지 않는다.
                    const refunded = isRefunded(t);
                    const statusBadge = statusBadgeOf(t.statuses);
                    return (
                    <tr
                      key={`${keyOf(t)}-${i}`}
                      className={cn(
                        "border-t border-wedly-bd transition-colors duration-150 ease-out",
                        // 제외 줄은 회색 층 위라 글자를 t2 까지만 낮춘다(muted 는 색 바탕에서 안 읽힌다)
                        t.sendable ? "hover:bg-wedly-bg-page" : "bg-wedly-bg-gray/50 text-wedly-t2",
                        refunded && t.sendable && "shadow-[inset_3px_0_0_var(--wedly-red)]",
                      )}
                    >
                      <td className="px-3 py-2 align-middle">
                        <Checkbox
                          checked={picked.has(keyOf(t))}
                          disabled={!t.sendable}
                          onChange={() => toggleOne(t)}
                          aria-label={`${t.companyName || displayPhone(t)} 고르기`}
                        />
                      </td>
                      <td className={cn("min-w-0 px-3 py-2 text-wedly-sub break-keep", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.companyName || "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-wedly-sub break-keep", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.representative || "—"}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {displayPhone(t)}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.contractDate || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {refunded ? (
                          <Badge variant="red">환불 {t.refundedAt}</Badge>
                        ) : statusBadge ? (
                          // ★색과 글자는 반드시 같은 값에서 나온다(statusBadgeOf) — 따로 정하면
                          //  ["진행중","계약완료"] 에서 초록색 「진행중」이 뜬다.
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        ) : (
                          <span className="text-wedly-hint text-wedly-t2">—</span>
                        )}
                      </td>
                      <td className={cn("px-3 py-2 text-wedly-sub break-keep", t.sendable ? "text-wedly-t1" : "text-wedly-t2")}>
                        {t.manager || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {t.sendable ? (
                          <Badge variant="blue">가능</Badge>
                        ) : t.excludeReason === "번호 없음" ? (
                          <Badge variant="yellow">번호 없음</Badge>
                        ) : (
                          <Badge variant="red">{t.excludeReason || "제외"}</Badge>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => goStep(2)} disabled={!targetsOk}>
              안내문 만들러 가기
            </Button>
            {loadingTargets ? (
              <span className="text-wedly-hint text-wedly-muted break-keep">{LOADING_TARGETS_HINT}</span>
            ) : (
              <span className="text-wedly-hint text-wedly-muted tabular-nums break-keep">
                지금 고른 사람 <b className="font-semibold text-wedly-t1">{won(selectedCount)}명</b>
                {hiddenPicked > 0 && `  (그중 ${won(hiddenPicked)}명은 지금 화면에 안 보여요)`}
                {selectedCount > MAX_RECIPIENTS && ` — 한 번에 ${MAX_RECIPIENTS}명까지만 보낼 수 있어요`}
              </span>
            )}
          </div>
          </>)}
        </Card>
      )}

      {/* ══════════ 02 안내문 만들기 ══════════ */}
      {step === 2 && (
        <Card>
          <SectionHead
            no="02"
            tone="purple"
            icon={MessageSquare}
            title="안내문 만들기"
            desc="적고 잠시 멈추면 AI가 위들리 형식으로 바꿔 줘요"
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 왼쪽 — 원문 */}
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-wedly-sub font-semibold text-wedly-t1">보내고 싶은 내용 (원문)</span>
                <span className="text-wedly-hint text-wedly-muted break-keep">평소 쓰던 대로 편하게 적으면 됩니다</span>
              </div>
              <Textarea
                ref={originalRef}
                autosize={false}
                rows={10}
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="예) 안녕하세요 위들리입니다. 지원금 신청에 필요한 서류를 9월 5일까지 보내주셔야 합니다…"
                className="min-h-[240px] w-full leading-6"
                maxLength={4000}
                aria-label="보내고 싶은 내용 원문"
              />
              <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
                {originalTooShort(originalText)
                  ? "조금 더 자세히 적어 주세요"
                  : "입력을 멈추면 오른쪽 미리보기가 나와요"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-wedly-hint font-semibold text-wedly-t2">눌러서 넣기</span>
                {TOKEN_CHIPS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertToken(v)}
                    aria-label={`${v} 넣기`}
                    className={cn(
                      "inline-flex min-h-10 sm:min-h-[28px] cursor-pointer items-center gap-1 rounded-full border border-wedly-bd bg-white px-2.5 py-1",
                      "text-wedly-hint font-semibold text-wedly-t1 shadow-sm",
                      "transition-colors duration-150 ease-out hover:border-wedly-accent/50 hover:bg-wedly-bg-page",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                    )}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {v}
                  </button>
                ))}
                <span className="text-wedly-hint text-wedly-muted break-keep">
                  대표님 이름·회사명이 자동으로 채워져요
                </span>
              </div>
              <p className="mt-1.5 text-right text-wedly-hint text-wedly-muted tabular-nums">
                {originalText.length}/4,000
              </p>
            </div>

            {/* 오른쪽 — 변환 결과 */}
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-wedly-sub font-semibold text-wedly-t1">변환 결과 미리보기</span>
                <span className="text-wedly-hint text-wedly-muted break-keep">
                  {editing ? "고친 내용은 바로 반영됩니다" : "「직접 고치기」를 누르면 바로 고칠 수 있습니다"}
                </span>
                {converted && !converting && step2ConversionReady && (
                  <button
                    type="button"
                    onClick={toggleEditing}
                    className={cn(
                      "ml-auto inline-flex min-h-10 sm:min-h-[26px] items-center gap-1 rounded-full border border-wedly-bd bg-white px-2.5 py-1",
                      "text-wedly-hint font-semibold text-wedly-accent-ink shadow-sm",
                      "transition-colors duration-150 ease-out hover:bg-wedly-bg-page",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                    )}
                  >
                    {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {editing ? "미리보기" : "직접 고치기"}
                  </button>
                )}
              </div>

              {converting && !streamHasChunk ? (
                <div
                  className="min-h-[240px] rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-wedly-purple" aria-hidden />
                    <span className="text-wedly-sub font-semibold text-wedly-t1">AI가 다듬는 중…</span>
                  </div>
                  <Skeleton variant="line" className="mb-2" />
                  <Skeleton variant="line" className="mb-2 w-5/6" />
                  <Skeleton variant="line" className="mb-2 w-4/5" />
                  <Skeleton variant="line" className="w-2/3" />
                </div>
              ) : editing ? (
                <Textarea
                  autosize={false}
                  rows={12}
                  value={finalText}
                  onChange={(e) => setFinalText(e.target.value)}
                  className="min-h-[240px] w-full leading-6"
                  aria-label="변환된 안내문 직접 고치기"
                />
              ) : (
                <div className="min-h-[240px] rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-wedly-accent text-wedly-hint font-bold text-white">
                      W
                    </span>
                    <span className="text-wedly-tablehead font-semibold text-wedly-t1">위들리</span>
                  </div>
                  <div className="rounded-[4px_16px_16px_16px] border border-wedly-bd bg-white px-4 py-3.5 text-wedly-sub leading-6 text-wedly-t1 shadow-sm break-keep">
                    {composedText ? (
                      <p className="whitespace-pre-wrap">{renderPreview(applyPreviewExamples(composedText))}</p>
                    ) : (
                      <span className="text-wedly-muted break-keep">
                        왼쪽 칸에 내용을 적고 잠시 멈추면 여기에 미리보기가 나와요.
                      </span>
                    )}
                  </div>
                  {composedText && (composedText.includes("{대표명}") || composedText.includes("{회사명}")) && (
                    <p className="mt-2 text-wedly-hint text-wedly-muted break-keep">
                      대표님마다 실제 이름·회사명으로 바뀝니다
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => { void convert({ force: true }); }}
                  loading={converting}
                  disabled={originalText.trim().length < MIN_ORIGINAL_LEN}
                >
                  <RotateCcw className="h-[15px] w-[15px]" />
                  다시 변환
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setTestDone(""); setTestError(""); setTestOpen(true); }}
                  disabled={!canTestSend}
                >
                  <Smartphone className="h-[15px] w-[15px]" />
                  내 번호로 시험 발송
                </Button>
                {showTestSendWait && (
                  <span className="self-center text-wedly-hint text-wedly-muted break-keep">{TEST_SEND_WAIT_HINT}</span>
                )}
              </div>
            </div>
          </div>

          {/* 자동 점검 · 채우기 폼 */}
          <div className="mt-4 space-y-3">
            {adWords.length > 0 && (
              <StatusBox tone="warning" title="광고로 읽힐 수 있는 낱말이 있어요">
                {adWords.join(" · ")} — 정보성 안내로 보내려면 이 표현을 빼는 편이 안전해요. 「직접 고치기」로 고칠 수 있습니다.
              </StatusBox>
            )}
            {step2ConversionReady && !editing && fillMarkers.length > 0 && !fillsComplete && (
              <FillForm
                markers={fillMarkers}
                values={fillValues}
                onChange={(marker, value) => setFillValues((prev) => ({ ...prev, [marker]: value }))}
              />
            )}
            {step2ConversionReady && !editing && fillMarkers.length > 0 && fillsComplete && (
              <StatusBox tone="success" title="모두 채웠어요">
                미리보기에 반영됐어요. 다음 단계로 갈 수 있어요.
              </StatusBox>
            )}
            {step2ConversionReady && fillMarkers.length === 0 && adWords.length === 0 && composedText.trim() && (
              <StatusBox tone="success" title="발송 전 자동 점검 통과">
                광고성 표현 없음 · 빠진 정보 없음. 바로 다음 단계로 넘어갈 수 있어요.
              </StatusBox>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => goStep(1)}>이전 단계</Button>
            <Button onClick={() => goStep(3)} disabled={!canGo(3)}>발송 확인으로</Button>
            {step2Hint && (
              <span className="text-wedly-hint text-wedly-muted break-keep">{step2Hint}</span>
            )}
          </div>
        </Card>
      )}

      {/* ══════════ 03 발송 확인 ══════════ */}
      {step === 3 && (
        <Card>
          <SectionHead
            no="03"
            tone="green"
            icon={Send}
            title="발송 확인"
            desc="마지막으로 한 번 더 확인하고 보냅니다"
          />

          {/* 되살린 화면에서는 확인 표를 안 그린다 — 대상·안내문이 복원되지 않아 0명·0원으로 보인다. */}
          {!restoredFromStore && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-wedly-bd">
            {[
              {
                // ★자동 제외 건수를 여기 붙이지 마라 — 그 숫자는 「지금 1단계에 보이는 목록」에서
                //  세는 값이라 검색어만 바꿔도 발송 확인 화면의 숫자가 흔들린다. 보낼 명단과
                //  관계없는 숫자가 발송 직전에 움직이면 사람이 오해한다(자동 제외는 1단계 숫자 카드 몫).
                k: "받는 사람",
                v: <b className="font-semibold tabular-nums">{won(selectedCount)}명</b>,
              },
              { k: "보내는 이름", v: <>위들리 <span className="text-wedly-muted">— 채널톡 공식 채널</span></> },
              { k: "고객이 받는 방법", v: <>카카오톡 알림 「새로운 메시지가 도착했어요」 → 누르면 채팅방에서 안내문 확인</> },
              {
                k: "답장 오면",
                v: (
                  <>
                    <b className="font-semibold">보낸 담당자{myName ? `(${myName})` : ""}</b>에게 자동 배정
                    <span className="text-wedly-t2">(채널톡 담당자로 등록돼 있는 경우)</span> · 등록이 없으면 기존 담당 컨설턴트 규칙으로 배정됩니다
                  </>
                ),
              },
              {
                k: "예상 비용",
                v: (
                  <>
                    알림 건당 {COST_MIN}~{COST_MAX}원 · 이번 발송 최대{" "}
                    <b className="font-semibold tabular-nums">약 {won(selectedCount * COST_MAX)}원</b>
                  </>
                ),
              },
            ].map((row) => (
              <div key={row.k} className="grid grid-cols-[110px_1fr] border-t border-wedly-bd first:border-t-0 sm:grid-cols-[160px_1fr]">
                <div className="bg-wedly-bg-gray px-3 py-2.5 text-wedly-tablehead font-semibold text-wedly-t2 break-keep">
                  {row.k}
                </div>
                <div className="min-w-0 bg-white px-3 py-2.5 text-wedly-sub text-wedly-t1 break-keep">{row.v}</div>
              </div>
            ))}
          </div>
          )}

          {!jobId && (
            <div className="mb-4 flex min-w-0 flex-col gap-1">
              <label htmlFor="bm-notice-category" className="text-wedly-label font-semibold text-wedly-muted">
                안내 내용
              </label>
              <CustomSelect
                id="bm-notice-category"
                aria-label="안내 내용"
                value={noticeCategory}
                onChange={setNoticeCategory}
                options={noticeCategoryOptions}
                placeholder="무엇에 대한 안내인지 골라 주세요"
                className="w-full sm:w-[280px] [&>button]:rounded-full [&>button]:pl-4"
              />
              <p className="text-wedly-hint text-wedly-muted break-keep">
                카카오 알림톡에 이 값이 그대로 들어가요. 비어 있으면 발송이 거절될 수 있어요.
              </p>
            </div>
          )}

          {!jobId && (
            <div className="space-y-3">
              {tooMany && (
                <StatusBox tone="error" title={`한 번에 ${won(MAX_RECIPIENTS)}명까지만 보낼 수 있어요`}>
                  지금 고른 사람이 {won(selectedCount)}명입니다. 1단계로 돌아가 {won(selectedCount - MAX_RECIPIENTS)}명을 빼 주세요.
                </StatusBox>
              )}
              {/* ★전체 선택은 목록 아래쪽 환불 고객까지 담는다 — 빨간 줄을 못 보고 지나쳤을 수 있어
                  보내기 직전에 한 번 더 알린다(고르는 동작 자체는 그대로 둔다). */}
              {refundedInSelection && (
                <StatusBox
                  tone="warning"
                  title={`환불 고객 ${won(refundedInSelection.count)}명이 포함돼 있어요`}
                >
                  {refundedInSelection.text ? `${refundedInSelection.text} — ` : ""}
                  환불일이 적힌 고객입니다. 보내도 괜찮은 안내인지 1단계에서 한 번 더 확인해 주세요.
                </StatusBox>
              )}
              <StatusBox tone="warning" title="발송 후에는 취소할 수 없어요">
                이미 나간 알림은 되돌릴 수 없습니다. 미리보기와 받는 분 목록을 한 번 더 확인해 주세요. 같은 안내를 실수로 두 번 실행해도 이미 받은 분은 자동으로 건너뜁니다.
              </StatusBox>
            </div>
          )}

          {!jobId ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="lg" onClick={() => goStep(2)}>이전 단계</Button>
              <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={!sendReady}>
                <Send className="h-[15px] w-[15px]" />
                {won(selectedCount)}명에게 발송하기
              </Button>
              {loadingTargets ? (
                <span className="text-wedly-hint text-wedly-muted break-keep">{LOADING_TARGETS_HINT}</span>
              ) : (
                <span className="text-wedly-hint text-wedly-muted break-keep">
                  발송 중에는 진행률이 표시되고, 실패한 분은 따로 모아 보여줍니다
                </span>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {/* ★고른 인원과 실제로 나간 인원이 다른 이유 — 진행 표보다 위에 둔다(놓치면 사고로 읽는다). */}
              {skipped && (
                <StatusBox
                  tone="warning"
                  title={`고른 ${won(selectedCount)}명 중 ${won(skipped.total)}명은 보내지 않았어요`}
                >
                  {skipped.text} — 발송 직전에 서버가 다시 확인해 걸러낸 분들이에요.
                </StatusBox>
              )}

              <div className="rounded-2xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-wedly-sub font-semibold text-wedly-t1">
                    {progressHeadline(progress?.status)}
                  </span>
                  <span className="ml-auto text-wedly-sub tabular-nums text-wedly-t2">
                    {won((progress?.sent ?? 0) + (progress?.failed ?? 0))} / {won(progress?.total ?? 0)}명
                  </span>
                </div>
                <ProgressBar
                  value={progress && progress.total > 0 ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}
                  className="h-2 rounded-full"
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Badge variant="green">보냄 {won(progress?.sent ?? 0)}</Badge>
                  <Badge variant="red">실패 {won(progress?.failed ?? 0)}</Badge>
                  <Badge variant="default">남음 {won(pending)}</Badge>
                </div>
                {/* ★위 상자가 같은 사실을 이미 말한다 — 새 응답에서는 이 두 줄을 그리지 않는다.
                    같은 뜻을 두 모양으로 그리면 담당자가 두 번 빠진 것으로 읽는다.
                    skipped 를 안 주던 옛 응답에서만 이 자리가 산다. */}
                {!skipped && blockedCount > 0 && (
                  <p className="mt-2.5 border-t border-wedly-bd pt-2.5 text-wedly-hint text-wedly-t2 break-keep">
                    수신거부 {won(blockedCount)}명은 서버에서 제외됐습니다 — 목록을 만든 뒤에 수신거부한 분이라 발송 대상에서 빠졌어요.
                  </p>
                )}
                {!skipped && sendOutOfScopeCount > 0 && (
                  <p className="mt-2.5 border-t border-wedly-bd pt-2.5 text-wedly-hint text-wedly-t2 break-keep">
                    범위 밖 {won(sendOutOfScopeCount)}명은 서버에서 제외됐습니다 — 이 앱에서 볼 수 있는 고객이 아니라 발송 대상에서 빠졌어요.
                  </p>
                )}
                {pollError && (
                  <StatusBox tone="warning" title="진행 상황을 불러오지 못하고 있어요" className="mt-3">
                    {pollError} 발송은 서버에서 계속 돌고 있을 수 있어요. 이 화면을 그대로 두면 계속 다시 확인합니다. 새로고침해도 이 작업의 진행 표는 다시 열립니다.
                  </StatusBox>
                )}
              </div>

              {progress?.status === "done" && (
                <StatusBox tone="success" title="발송이 끝났어요">
                  {won(progress.sent)}명에게 보냈어요{progress.failed > 0 ? ` · ${won(progress.failed)}명은 실패했어요` : ""}. 답장은 채널톡에서 보낸 담당자에게 배정됩니다.
                </StatusBox>
              )}
              {progress?.stalled && progress.status === "running" && (
                <StatusBox tone="warning" title="발송이 오래 멈춰 있어요">
                  3분 넘게 진행이 없습니다. 잠시 뒤에도 그대로면 화면을 새로 고쳐 상태를 다시 확인해 주세요.
                </StatusBox>
              )}
              {canResume && (
                // StatusBox 의 actions 칸은 쓰지 않는다 — 그 칸은 카드 폭을 못 채워 단추가
                // 어중간한 자리에 선다(statusbox-actions-trap.test.ts). 단추를 밖에 왼쪽으로 둔다.
                <div className="space-y-2">
                  <StatusBox tone="warning" title="아직 못 보낸 분이 남았어요">
                    {won(pending)}명이 남아 있어요. 이미 보낸 분은 자동으로 건너뜁니다.
                    {progress?.error ? ` (멈춘 이유: ${progress.error})` : ""}
                  </StatusBox>
                  <Button size="sm" onClick={resume}>
                    <RotateCcw className="h-[15px] w-[15px]" />
                    이어보내기
                  </Button>
                </div>
              )}

              {progress && (progress?.recipients ?? []).length > 0 && (
                <>
                  {/* ★알림톡만 실패한 사람은 「보냄」에 섞여 있다 — 요약 숫자만 보면 못 알아챈다. */}
                  {alimtalkFailedCount > 0 && (
                    <StatusBox tone="error" title={`알림톡이 ${won(alimtalkFailedCount)}명에게 가지 못했어요`}>
                      채널톡에는 안내가 남아 있어요. 그분들께는 담당자가 직접 연락해 주세요.
                    </StatusBox>
                  )}
                  {progress.total > (progress?.recipients ?? []).length && (
                    <p className="text-wedly-hint text-wedly-muted break-keep">
                      받는 분 {won(progress.total)}명 중 앞 {won((progress?.recipients ?? []).length)}명만 보여 줍니다.
                    </p>
                  )}
                <div className="overflow-auto rounded-2xl border border-wedly-bd">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead className="text-wedly-tablehead">
                      <tr className="bg-wedly-accent text-left font-semibold text-white">
                        <th scope="col" className="px-3 py-2.5">회사명</th>
                        <th scope="col" className="px-3 py-2.5">대표명</th>
                        <th scope="col" className="px-3 py-2.5">연락처</th>
                        <th scope="col" className="px-3 py-2.5">알림 상태</th>
                        <th scope="col" className="px-3 py-2.5">실패한 이유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.recipients.map((r, i) => {
                        const badge = alimtalkBadgeOf(r.alimtalkStatus, r.viewedAt, r.status);
                        return (
                          <tr key={`${r.phone}-${i}`} className="border-t border-wedly-bd">
                            <td className="min-w-0 px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">{r.companyName || "—"}</td>
                            <td className="px-3 py-2 text-wedly-sub text-wedly-t1 break-keep">{r.representative || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-wedly-sub tabular-nums text-wedly-t1">{r.phone || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {/* 정본 딱지 — 흰 알약 + 뜻을 담은 색 점(Badge 기본형). */}
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </td>
                            <td className="min-w-0 px-3 py-2 text-wedly-sub text-wedly-t2 break-keep">
                              {failureReasonOf(r)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 발송 확인 모달 — 브라우저 confirm 대신 WEDLY 모달 */}
      <Modal
        open={confirmOpen}
        onClose={() => { if (!sending) setConfirmOpen(false); }}
        title="정말 보낼까요?"
        description="보낸 뒤에는 되돌릴 수 없어요."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={sending}>
              취소
            </Button>
            <Button onClick={send} loading={sending} disabled={!sendReady}>
              <Send className="h-[15px] w-[15px]" />
              {won(selectedCount)}명에게 발송
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-wedly-bd">
            {[
              { k: "받는 사람", v: `${won(selectedCount)}명` },
              { k: "예상 비용", v: `최대 약 ${won(selectedCount * COST_MAX)}원 (건당 ${COST_MIN}~${COST_MAX}원)` },
              { k: "보내는 이름", v: "위들리 — 채널톡 공식 채널" },
            ].map((r) => (
              <div key={r.k} className="grid grid-cols-[92px_1fr] border-t border-wedly-bd first:border-t-0">
                <div className="bg-wedly-bg-gray px-3 py-2 text-wedly-tablehead font-semibold text-wedly-t2 break-keep">{r.k}</div>
                <div className="min-w-0 bg-white px-3 py-2 text-wedly-sub tabular-nums text-wedly-t1 break-keep">{r.v}</div>
              </div>
            ))}
          </div>
          <StatusBox tone="warning" title="발송 후에는 취소할 수 없어요">
            이미 나간 알림은 되돌릴 수 없습니다. 이미 받은 분은 다시 실행해도 자동으로 건너뜁니다.
          </StatusBox>
        </div>
      </Modal>

      {/* 시험 발송 모달 */}
      <Modal
        open={testOpen}
        onClose={() => { if (!testSending) setTestOpen(false); }}
        title="내 번호로 시험 발송"
        description="실제로 받아 보는 모습 그대로 한 통만 보냅니다."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTestOpen(false)} disabled={testSending}>
              닫기
            </Button>
            <Button onClick={testSend} loading={testSending} disabled={!testPhone.trim() || !canTestSend}>
              <Smartphone className="h-[15px] w-[15px]" />
              시험 발송
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            id="bm-test-phone"
            label="받을 휴대폰 번호"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="010-0000-0000"
            inputMode="tel"
            className="tabular-nums"
          />
          <p className="text-wedly-hint text-wedly-muted break-keep">
            개인화 값은 {"{대표명}"}=홍길동, {"{회사명}"}=시험회사로 채워 보냅니다. 「확인 필요」 표시가 남아 있어도 시험 발송은 됩니다.
          </p>
          {testError && (
            <StatusBox tone="error" title="시험 발송에 실패했어요">{testError}</StatusBox>
          )}
          {testDone && (
            <StatusBox tone="success" title="시험 발송 완료">{testDone}</StatusBox>
          )}
        </div>
      </Modal>
      </div>

      {/* 사용방법 판 — 떼지 않고 숨긴다(탭을 옮겨도 체크리스트·펼침이 그대로). */}
      <div role="tabpanel" id="bulk-pane-manual" aria-labelledby="bulk-tab-manual" hidden={view !== "manual"}>
        <BulkMessageManual />
      </div>
    </>
  );
}
