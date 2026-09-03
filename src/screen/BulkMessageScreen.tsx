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
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
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
import {
  PASTE_DEBOUNCE_MS,
  LOADING_TARGETS_HINT,
  MANAGER_MINE,
  PICK_TAB_HINT,
  STATUS_PLACEHOLDER,
  canProceedWithTargets,
  checkedKeysOnLoad,
  listFetchDelayMs,
  managerQueryOf,
  managerSelectOptions,
  mergeManagerNames,
  multiSelectOptionKey,
  multiSelectTriggerKey,
  statusTriggerLabel,
  step1ListPhase,
  uniqueManagers,
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
  NOTICE_CATEGORIES,
  alimtalkBadgeOf,
  alimtalkFailedCountOf,
  canConfirmSend,
  failureReasonOf,
} from "./step3-helpers";

// ────────────────────────────────────────────────────────────── 타입·상수

interface Target {
  rowId: string;
  companyName: string;
  representative: string;
  phone: string;
  statuses: string[];
  manager: string;
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
type TabMode = "filter" | "pick" | "paste";

const TABS: Array<{ id: TabMode; label: string }> = [
  { id: "filter", label: "조건으로 찾기" },
  { id: "pick", label: "목록에서 고르기" },
  { id: "paste", label: "번호 붙여넣기" },
];

/** 서버(checks.ts findNeedsFill)와 같은 규칙 — 담당자가 직접 고친 글도 화면에서 바로 다시 센다. */
const NEEDS_FILL_RE = /\[확인 필요[^\]]*\]/g;

/** 채널톡 알림 1건 단가(원) — 시안의 「7~28원/건」 안내와 같은 값. */
const COST_MIN = 7;
const COST_MAX = 28;

const MAX_RECIPIENTS = 500;

// ────────────────────────────────────────────────────────────── 작은 도구

/**
 * 화면에 쓸 연락처.
 *
 * ★목록에서 고른 줄(rowId 있음)의 번호는 **서버가 이미 가려서**(010-2•••-4567) 내려 준다 —
 *  화면은 원문을 아예 받지 않는다. 발송할 때 서버가 rowId 로 원문을 다시 찾아 쓴다.
 *  붙여넣기 줄은 사용자가 방금 직접 적은 번호라 그대로 보여 준다(안 그러면 확인이 안 된다).
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

/** 진행상태 멀티선택 — CustomSelect 는 단일이라 이 화면에만 둔다. 브라우저 <select> 금지. */
/** 진행상태 → 점 색. 표의 진행상태 배지와 같은 뜻을 같은 색으로 준다(정본: 색 3톤 절제). */
function statusDotClass(status: string): string {
  if (/계약완료|입금완료|정산완료|완료/.test(status)) return "bg-wedly-green";
  if (/불가|취하|보류|환불|중단/.test(status)) return "bg-wedly-red";
  if (/대기|예정/.test(status)) return "bg-wedly-gold-ink";
  return "bg-wedly-accent";
}

function MultiCheckSelect({
  id,
  values,
  onChange,
  options,
  placeholder,
  "aria-label": ariaLabel,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const optId = (i: number) => `${id ?? "bm-ms"}-opt-${i}`;

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback((v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }, [onChange, values]);

  const focusOption = (index: number) => {
    const i = Math.max(0, Math.min(index, Math.max(0, options.length - 1)));
    setHighlight(i);
    optionRefs.current[i]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHighlight(-1);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        setOpen(false);
        setHighlight(-1);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const applyAction = (action: ReturnType<typeof multiSelectTriggerKey>, currentValue?: string) => {
    if (action.type === "none") return;
    if (action.type === "open") {
      setOpen(true);
      const i = action.index;
      setHighlight(i);
      requestAnimationFrame(() => optionRefs.current[i]?.focus());
      return;
    }
    if (action.type === "close") {
      close();
      return;
    }
    if (action.type === "move") {
      if (!open) setOpen(true);
      focusOption(action.index);
      return;
    }
    const v = currentValue ?? options[highlight]?.value;
    if (v) toggle(v);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const action = multiSelectTriggerKey(e.key, open, highlight, options.length);
    if (action.type === "none") return;
    e.preventDefault();
    applyAction(action);
  };

  const onOptionKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number, value: string) => {
    const action = multiSelectOptionKey(e.key, index, options.length);
    if (action.type === "none") return;
    e.preventDefault();
    e.stopPropagation();
    applyAction(action, value);
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-[220px] shrink-0 sm:w-[280px]">
      <div
        ref={triggerRef}
        id={id}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id ?? "bm-ms"}-list` : undefined}
        aria-activedescendant={open && highlight >= 0 ? optId(highlight) : undefined}
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            setHighlight(next ? 0 : -1);
            return next;
          });
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          // 알약(rounded-full) — 같은 줄의 탭·칩·배지와 한 언어로 맞춘다(2026-09-02 사장님 지시).
          "flex min-h-[42px] w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-full border border-wedly-bd bg-white py-2 pl-4 pr-8 text-left text-sm",
          "transition-colors duration-150 ease-out",
          "hover:border-wedly-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
        )}
      >
        <span className="sr-only">{values.length ? `선택됨: ${statusTriggerLabel(values)}` : placeholder}</span>
        {values.length === 0 ? (
          <span aria-hidden className="text-wedly-muted">{placeholder}</span>
        ) : (
          values.map((v) => (
            <span
              key={v}
              aria-hidden
              className="inline-flex items-center gap-1 rounded-full border border-wedly-bd bg-white py-0.5 pl-2 pr-1 text-wedly-hint font-medium text-wedly-t1 shadow-sm"
            >
              {/* 정본 딱지 문법 — 흰 칩 + 뜻을 담은 색 점(표의 진행상태 배지와 같은 모양). */}
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(v))} aria-hidden="true" />
              <span className="break-keep">{v}</span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); toggle(v); }}
                onMouseDown={(e) => e.stopPropagation()}
                aria-label={`${v} 빼기`}
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded-full text-wedly-muted",
                  "transition-colors duration-150 ease-out hover:bg-wedly-bg-gray hover:text-wedly-t1",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent",
                )}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))
        )}
      </div>
      <ChevronDown
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 text-wedly-muted transition-transform duration-150 ease-out",
          open && "rotate-180",
        )}
      />
      {open && (
        <ul
          id={`${id ?? "bm-ms"}-list`}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-[100] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-wedly-bd bg-white py-1 shadow-lg"
        >
          {options.map((o, i) => {
            const on = values.includes(o.value);
            return (
              <li
                key={o.value}
                id={optId(i)}
                ref={(el) => { optionRefs.current[i] = el; }}
                role="option"
                aria-selected={on}
                tabIndex={highlight === i ? 0 : -1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(o.value)}
                onMouseEnter={() => setHighlight(i)}
                onKeyDown={(e) => onOptionKeyDown(e, i, o.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:bg-wedly-bg-page",
                  on
                    ? "bg-wedly-bg-blue font-medium text-wedly-accent-ink"
                    : "text-wedly-t1 hover:bg-wedly-bg-page",
                  highlight === i && !on && "bg-wedly-bg-page",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-wedly-accent bg-wedly-accent text-white" : "border-wedly-bd bg-white",
                  )}
                  aria-hidden
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 truncate break-keep">{o.label}</span>
              </li>
            );
          })}
        </ul>
      )}
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

export default function BulkMessageScreen() {
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
  const [tab, setTab] = useState<TabMode>("filter");
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const [statuses, setStatuses] = useState<string[]>(["계약완료"]);
  /** 진행상태 선택지 — 앱마다 분야 정의가 다를 수 있어 서버(대상 조회 응답)가 알려 준다. */
  const [statusOptions, setStatusOptions] = useState<string[]>(["계약완료"]);
  const [managerFilter, setManagerFilter] = useState(MANAGER_MINE);
  const [knownManagers, setKnownManagers] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set()); // keyOf(줄) 기준
  const [loadingTargets, setLoadingTargets] = useState(true); // 첫 화면부터 자동 조회
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [truncatedCount, setTruncatedCount] = useState(0);
  /** 붙여넣은 번호 중 볼 수 있는 고객 범위 밖이라 서버가 뺀 수(파트너 앱에서만 0 이 아니다). */
  const [outOfScopeCount, setOutOfScopeCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const fetchSeq = useRef(0);

  const loadListNow = useCallback(async () => {
    if (statuses.length === 0) {
      fetchSeq.current += 1;
      setTargets([]);
      setChecked(new Set());
      setTruncatedCount(0);
      setOutOfScopeCount(0);
      setLoadedOnce(true);
      setLoadingTargets(false);
      setLoadError("");
      return;
    }
    const seq = ++fetchSeq.current;
    setLoadingTargets(true);
    setLoadError("");
    try {
      const res = await fetch("/api/bulk-message/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses, ...managerQueryOf(managerFilter) }),
      });
      const j = await res.json();
      if (seq !== fetchSeq.current) return;
      if (!j.success) throw new Error(loadErrorText(j.error, "대상을 불러오지 못했어요."));
      const t = (j.data?.targets ?? []) as Target[];
      const incoming = Array.isArray(j.data?.managers)
        ? (j.data.managers as unknown[]).filter((x): x is string => typeof x === "string")
        : uniqueManagers(t);
      setKnownManagers((prev) => mergeManagerNames(prev, incoming));
      const opts = Array.isArray(j.data?.statusOptions) ? (j.data.statusOptions as unknown[]).filter((x): x is string => typeof x === "string") : [];
      if (opts.length) setStatusOptions(opts);
      setTargets(t);
      // 「조건으로 찾기」는 보낼 수 있는 사람을 전부 골라 둔다.
      // 「목록에서 고르기」는 사람이 직접 고르도록 비워 둔다.
      setChecked(new Set(checkedKeysOnLoad(tabRef.current, t.map((x) => ({ key: keyOf(x), sendable: x.sendable })))));
      setTruncatedCount(0);
      setOutOfScopeCount(0);
      setLoadedOnce(true);
    } catch (e) {
      if (seq !== fetchSeq.current) return;
      setTargets([]);
      setChecked(new Set());
      setTruncatedCount(0);
      setOutOfScopeCount(0);
      setLoadedOnce(true);
      setLoadError(`대상을 불러오지 못했어요: ${loadErrorText(e, "잠시 후 다시 시도해 주세요.")}`);
    } finally {
      if (seq === fetchSeq.current) setLoadingTargets(false);
    }
  }, [statuses, managerFilter]);

  const loadPasteNow = useCallback(async () => {
    if (!pasted.trim()) {
      fetchSeq.current += 1;
      setTargets([]);
      setChecked(new Set());
      setTruncatedCount(0);
      setOutOfScopeCount(0);
      setLoadedOnce(false);
      setLoadingTargets(false);
      setLoadError("");
      return;
    }
    const seq = ++fetchSeq.current;
    setLoadingTargets(true);
    setLoadError("");
    try {
      const res = await fetch("/api/bulk-message/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pasted }),
      });
      const j = await res.json();
      if (seq !== fetchSeq.current) return;
      if (!j.success) throw new Error(loadErrorText(j.error, "번호를 확인하지 못했어요."));
      const t: Target[] = ((j.data?.phones ?? []) as string[]).map((p) => ({
        rowId: "",
        companyName: "",
        representative: "",
        phone: p,
        statuses: [],
        manager: "",
        sendable: true,
        excludeReason: "",
      }));
      setTargets(t);
      setChecked(new Set(t.map(keyOf)));
      setTruncatedCount(Number(j.data.truncatedCount ?? 0));
      setOutOfScopeCount(Number(j.data.outOfScopeCount ?? 0));
      setLoadedOnce(true);
    } catch (e) {
      if (seq !== fetchSeq.current) return;
      setTargets([]);
      setChecked(new Set());
      setTruncatedCount(0);
      setOutOfScopeCount(0);
      setLoadedOnce(true);
      setLoadError(`번호를 확인하지 못했어요: ${loadErrorText(e, "잠시 후 다시 시도해 주세요.")}`);
    } finally {
      if (seq === fetchSeq.current) setLoadingTargets(false);
    }
  }, [pasted]);

  const retryLoad = useCallback(() => {
    if (tabRef.current === "paste") void loadPasteNow();
    else void loadListNow();
  }, [loadPasteNow, loadListNow]);

  const statusesKey = statuses.join("\0");
  const listQueryKeyRef = useRef<string | null>(null);
  const listStatusesRef = useRef<string | null>(null);
  const listManagerRef = useRef<string | null>(null);

  const selectTab = useCallback((id: TabMode) => {
    setTab(id);
    // 직접 고르는 탭은 조회 응답을 기다리지 않고 바로 체크를 비운다.
    if (id === "pick") setChecked(new Set());
    if (id !== "paste") setLoadingTargets(true);
  }, []);

  const onStatusesChange = useCallback((next: string[]) => {
    setStatuses(next);
    setLoadingTargets(true);
  }, []);

  const onManagerChange = useCallback((value: string) => {
    setManagerFilter(value);
    setLoadingTargets(true);
  }, []);

  useEffect(() => {
    if (tab === "paste") return;
    fetchSeq.current += 1; // 탭 전환·조건 변경 시 이전 조회 응답은 버린다
    if (tab === "pick") setChecked(new Set());
    const delay = listFetchDelayMs({
      hadListQuery: listQueryKeyRef.current !== null,
      statusesChanged: listStatusesRef.current !== null && listStatusesRef.current !== statusesKey,
      managerChanged: listManagerRef.current !== null && listManagerRef.current !== managerFilter,
    });
    listQueryKeyRef.current = `${tab}\0${statusesKey}\0${managerFilter}`;
    listStatusesRef.current = statusesKey;
    listManagerRef.current = managerFilter;
    if (statuses.length === 0) {
      void loadListNow();
      return;
    }
    if (delay === 0) {
      void loadListNow();
      return;
    }
    setLoadingTargets(true);
    const timer = setTimeout(() => { void loadListNow(); }, delay);
    return () => clearTimeout(timer);
  }, [tab, loadListNow, statuses.length, statusesKey, managerFilter]);

  useEffect(() => {
    if (tab !== "paste") return;
    fetchSeq.current += 1;
    if (!pasted.trim()) {
      void loadPasteNow();
      return;
    }
    setLoadingTargets(true);
    const timer = setTimeout(() => { void loadPasteNow(); }, PASTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tab, pasted, loadPasteNow]);

  // 담당 필터는 서버 조회 파라미터 — 화면에서 한 번 더 거르지 않는다.
  const visibleTargets = targets;
  const sendableTargets = useMemo(() => visibleTargets.filter((t) => t.sendable), [visibleTargets]);
  const excluded = useMemo(() => visibleTargets.filter((t) => !t.sendable), [visibleTargets]);
  const excludeSummary = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of excluded) by.set(t.excludeReason || "제외", (by.get(t.excludeReason || "제외") ?? 0) + 1);
    return [...by.entries()].map(([k, v]) => `${k} ${v}`).join(" / ");
  }, [excluded]);

  const selected = useMemo(
    () => visibleTargets.filter((t) => t.sendable && checked.has(keyOf(t))),
    [visibleTargets, checked],
  );
  const selectedCount = selected.length;
  const tooMany = selectedCount > MAX_RECIPIENTS;
  const allChecked = sendableTargets.length > 0 && sendableTargets.every((t) => checked.has(keyOf(t)));
  const managerOptions = useMemo(() => managerSelectOptions(knownManagers), [knownManagers]);

  const toggleOne = useCallback((key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setChecked((prev) => {
      const keys = sendableTargets.map(keyOf);
      const allOn = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allOn) {
        for (const k of keys) next.delete(k);
      } else {
        for (const k of keys) next.add(k);
      }
      return next;
    });
  }, [sendableTargets]);

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
  /** 서버가 발송 직전에 한 번 더 걸러낸 수신거부 인원 — 화면 목록을 만든 뒤에 차단된 분이 있을 수 있다. */
  const [blockedCount, setBlockedCount] = useState(0);
  /** 발송 직전 서버가 범위 밖으로 뺀 수(파트너 앱). */
  const [sendOutOfScopeCount, setSendOutOfScopeCount] = useState(0);
  /** 진행 조회가 연달아 실패했을 때의 안내 — 「보내는 중」이 굳어 보이지 않게. */
  const [pollError, setPollError] = useState("");
  /**
   * 알림톡 문안의 `#{안내구분}` 에 그대로 들어가는 값.
   * ★기본값을 두지 않는다 — 담당자가 이번 안내가 무엇인지 직접 고르게 한다.
   */
  const [noticeCategory, setNoticeCategory] = useState("");

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
        // 서버가 rowId 로 자료에서 원문을 다시 찾는다. 붙여넣기 줄만 번호를 그대로 보낸다.
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
  }, [jobId, pollKey]);

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
  const statusSelectOptions = useMemo(
    () => statusOptions.map((s) => ({ value: s, label: s })),
    [statusOptions],
  );
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

      <Stepper step={step} canGo={canGo} onGo={goStep} />

      {/* ══════════ 01 받을 분 고르기 ══════════ */}
      {step === 1 && (
        <Card>
          <SectionHead
            no="01"
            tone="accent"
            icon={Users}
            title="받을 분 고르기"
            desc="조건을 고르면 대상이 자동으로 올라와요. 빼고 싶은 분만 체크를 끄세요"
          />

          <div className="mb-4 inline-flex gap-1 rounded-full bg-wedly-bg-gray p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-pressed={tab === t.id}
                className={cn(
                  "rounded-full px-4 py-1.5 text-wedly-tablehead transition-colors duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
                  tab === t.id
                    ? "bg-white font-semibold text-wedly-accent-ink shadow-sm"
                    : "font-medium text-wedly-t2 hover:bg-white/60",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "pick" && (
            <p className="-mt-2 mb-4 text-wedly-hint text-wedly-muted break-keep">{PICK_TAB_HINT}</p>
          )}

          {tab === "paste" ? (
            <div className="mb-4">
              <label htmlFor="bm-paste" className="mb-1 block text-wedly-label font-semibold text-wedly-muted">
                휴대폰 번호 붙여넣기
              </label>
              <Textarea
                id="bm-paste"
                autosize={false}
                rows={6}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"엑셀에서 복사한 번호를 그대로 붙여넣어 주세요.\n예) 010-1234-5678, 01098765432 …"}
                className="min-h-[120px] w-full"
              />
              <p className="mt-1.5 text-wedly-hint text-wedly-muted break-keep">
                붙여넣으면 자동으로 휴대폰 번호만 골라내고 중복은 지웁니다(최대 {MAX_RECIPIENTS}개). 줄바꿈·쉼표·공백 어떤 형태든 됩니다.
              </p>
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap items-start gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="bm-status" className="text-wedly-label font-semibold text-wedly-muted">
                  진행상태
                </label>
                <MultiCheckSelect
                  id="bm-status"
                  aria-label="진행상태"
                  values={statuses}
                  onChange={onStatusesChange}
                  options={statusSelectOptions}
                  placeholder={STATUS_PLACEHOLDER}
                />
              </div>

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
                  // 알약 — 옆의 진행상태 상자와 같은 모양으로(공용 부품은 안 건드리고 이 화면만).
                  className="w-[180px] [&>button]:rounded-full [&>button]:pl-4"
                />
              </div>
            </div>
          )}

          {outOfScopeCount > 0 && (
            <StatusBox tone="warning" title={`번호 ${won(outOfScopeCount)}개는 볼 수 있는 고객 범위 밖이라 뺐어요`} className="mb-4">
              이 앱에서 볼 수 있는 정부지원금 고객의 번호만 보낼 수 있어요. 나머지 번호는 담당자에게 문의해 주세요.
            </StatusBox>
          )}

          {truncatedCount > 0 && (
            <StatusBox tone="warning" title={`번호 ${won(truncatedCount)}개는 목록에서 잘렸어요`} className="mb-4">
              한 번에 {won(MAX_RECIPIENTS)}개까지만 다룰 수 있어서 앞 {won(MAX_RECIPIENTS)}개만 남겼습니다. 나머지는 이번 발송이 끝난 뒤 따로 보내 주세요.
            </StatusBox>
          )}

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
                  label={tab === "paste" ? "붙여넣은 번호" : "조건에 잡힌 고객"}
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
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">진행상태</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">담당</th>
                  <th scope="col" className="sticky top-0 z-10 bg-wedly-accent px-3 py-2.5">발송</th>
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted">
                      불러오는 중…
                    </td>
                  </tr>
                ) : visibleTargets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-wedly-sub text-wedly-muted break-keep">
                      {tab === "paste"
                        ? (pasted.trim()
                          ? (outOfScopeCount > 0
                            ? "붙여넣은 번호가 모두 볼 수 있는 고객 범위 밖이에요."
                            : "번호로 알아볼 수 있는 고객이 없어요.")
                          : "번호를 붙여넣으면 자동으로 골라냅니다.")
                        : statuses.length === 0
                          ? "진행상태를 한 개 이상 골라 주세요."
                          : loadedOnce
                            ? "조건에 맞는 고객이 없어요. 진행상태나 담당 조건을 바꿔 보세요."
                            : "조건을 고르면 대상이 자동으로 올라와요."}
                    </td>
                  </tr>
                ) : (
                  visibleTargets.map((t, i) => (
                    <tr
                      key={`${keyOf(t)}-${i}`}
                      className={cn(
                        "border-t border-wedly-bd transition-colors duration-150 ease-out",
                        // 제외 줄은 회색 층 위라 글자를 t2 까지만 낮춘다(muted 는 색 바탕에서 안 읽힌다)
                        t.sendable ? "hover:bg-wedly-bg-page" : "bg-wedly-bg-gray/50 text-wedly-t2",
                      )}
                    >
                      <td className="px-3 py-2 align-middle">
                        <Checkbox
                          checked={t.sendable && checked.has(keyOf(t))}
                          disabled={!t.sendable}
                          onChange={() => toggleOne(keyOf(t))}
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
                      <td className="px-3 py-2">
                        {t.statuses.length > 0 ? (
                          <Badge variant="green">{t.statuses[0]}</Badge>
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
                  ))
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

          <div className="mb-4 overflow-hidden rounded-2xl border border-wedly-bd">
            {[
              {
                k: "받는 사람",
                v: (
                  <>
                    <b className="font-semibold tabular-nums">{won(selectedCount)}명</b>
                    {excluded.length > 0 && (
                      <span className="text-wedly-muted"> ({excludeSummary} 자동 제외)</span>
                    )}
                  </>
                ),
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
              <div className="rounded-2xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-wedly-sub font-semibold text-wedly-t1">
                    {progress?.status === "running" ? "보내는 중이에요" : progress?.status === "done" ? "발송이 끝났어요" : "발송이 멈췄어요"}
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
                {blockedCount > 0 && (
                  <p className="mt-2.5 border-t border-wedly-bd pt-2.5 text-wedly-hint text-wedly-t2 break-keep">
                    수신거부 {won(blockedCount)}명은 서버에서 제외됐습니다 — 목록을 만든 뒤에 수신거부한 분이라 발송 대상에서 빠졌어요.
                  </p>
                )}
                {sendOutOfScopeCount > 0 && (
                  <p className="mt-2.5 border-t border-wedly-bd pt-2.5 text-wedly-hint text-wedly-t2 break-keep">
                    범위 밖 {won(sendOutOfScopeCount)}명은 서버에서 제외됐습니다 — 이 앱에서 볼 수 있는 고객이 아니라 발송 대상에서 빠졌어요.
                  </p>
                )}
                {pollError && (
                  <StatusBox tone="warning" title="진행 상황을 불러오지 못하고 있어요" className="mt-3">
                    {pollError} 발송은 서버에서 계속 돌고 있을 수 있어요. 이 화면을 그대로 두면 계속 다시 확인합니다 — 새로고침하면 이 작업의 진행 표를 다시 볼 수 없어요.
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
    </>
  );
}
