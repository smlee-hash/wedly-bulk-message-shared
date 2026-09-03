"use client";

// 단체 안내 발송 — 사용방법 탭.
// 시각·문구 계약(정본): 사장님 승인 미리보기 preview-bulk-manual-readable.html 의 「바꾼 뒤」 판.
//  - 왼쪽 목차(sticky) + 오른쪽 본문 열(720px). 본문 14px/22px · 보조 13.5px · 각주 13px.
//  - 표 태그는 쓰지 않는다 — 「항목 + 한 줄」 카드 줄(Row)로. 설명은 1~2줄.
//  - 구역 제목은 h2 + text-wedly-section (ERP 글자 층 규칙). 표 머리글 태그는 안 쓴다.
// 금지: raw Tailwind 색 · 11px 층(각주까지 최소 13px). 숫자(500·10·3)는 limits.ts 한 곳에서.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Braces,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  HelpCircle,
  LayoutGrid,
  ListFilter,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Smartphone,
  Tag,
  Users,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import { MAX_RECIPIENTS, TEST_SEND_CAP_PARTNER, TEST_SEND_CAP_STAFF } from "./limits";

// ────────────────────────────────────────────────────────────── 목차

const NAV = [
  { id: "overview", chip: "★", label: "한눈에 보기" },
  { id: "step1", chip: "1", label: "받을 분 고르기" },
  { id: "step2", chip: "2", label: "안내문 만들기" },
  { id: "step3", chip: "3", label: "발송 확인" },
  { id: "after", chip: "4", label: "보낸 뒤" },
  { id: "faq", chip: "?", label: "자주 묻는 질문" },
  { id: "check", chip: "✓", label: "보내기 전 체크" },
] as const;

type NavId = (typeof NAV)[number]["id"];

/** 화면 안 다른 요소와 겹치지 않게 앞머리를 붙인다. */
const domId = (id: NavId) => `bulk-manual-${id}`;

// ────────────────────────────────────────────────────────────── 작은 조각

type TileTone = "blue" | "purple" | "green" | "gold" | "red" | "gray";

/** 아이콘 타일 — 상태 박스 v3 규격(채운 사각 + 심볼). */
const TILE_TONE: Record<TileTone, string> = {
  blue: "bg-wedly-accent text-white",
  purple: "bg-wedly-purple text-white",
  green: "bg-wedly-green text-white",
  // 금색 타일만 남색 심볼 — 금색 위 흰 글리프는 대비 2.1 미달(정본: 상태 박스 v3)
  gold: "bg-wedly-gold text-wedly-navy",
  red: "bg-wedly-red text-white",
  gray: "bg-wedly-bg-gray text-wedly-t2",
};

function Tile({
  tone,
  icon: Icon,
  size = "sm",
}: {
  tone: TileTone;
  icon: ComponentType<{ className?: string }>;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg shadow-sm",
        size === "lg" ? "h-9 w-9" : "h-[30px] w-[30px]",
        TILE_TONE[tone],
      )}
      aria-hidden
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

/** 구역 머리 — 번호 타일 + 제목 + 회색 설명 + 굵은 밑선. 구역 구분은 색이 아니라 이 머리가 한다. */
function SectionHead({ chip, title, desc }: { chip: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 border-b-2 border-wedly-bd pb-2.5">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wedly-accent text-[15px] font-bold text-white"
        aria-hidden
      >
        {chip}
      </span>
      <div className="min-w-0">
        <h2 className="text-wedly-section font-bold text-wedly-t1 break-keep">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-[18px] text-wedly-muted break-keep">{desc}</p>
      </div>
    </div>
  );
}

/** 카드 줄 — 왼쪽 굵은 항목 + 오른쪽 한 줄짜리 항목들. 표를 대신한다. */
function Row({ label, items }: { label: ReactNode; items: ReactNode[] }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 rounded-xl border border-wedly-bd bg-white px-3.5 py-3">
      <div className="min-w-0 text-sm font-semibold text-wedly-t1 break-keep">{label}</div>
      <ul className="grid list-disc gap-0.5 pl-4">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-[22px] text-wedly-t2 break-keep">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 항목 앞 굵은 라벨(언제 / 어떻게 / 주의). */
function K({ children }: { children: ReactNode }) {
  return <b className="font-semibold text-wedly-t1">{children}</b>;
}

/** 설명 카드 — 아이콘 타일 + 굵은 한 줄 + 그 밑 설명(카드 안쪽 위계). */
function InfoCard({
  tone,
  icon,
  title,
  children,
  soft = false,
}: {
  tone: TileTone;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  children: ReactNode;
  soft?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr] gap-3 rounded-xl px-3.5 py-3",
        soft ? "border border-transparent bg-wedly-bg-gray" : "border border-wedly-bd bg-white",
      )}
    >
      <Tile tone={tone} icon={icon} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-wedly-t1 break-keep">{title}</p>
        <p className="mt-0.5 text-[13.5px] leading-[21px] text-wedly-t2 break-keep">{children}</p>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-xl border border-wedly-bd bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 text-sm font-semibold text-wedly-t1 break-keep transition-colors duration-150 ease-out hover:bg-wedly-bg-gray focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-wedly-accent [&::-webkit-details-marker]:hidden">
        <span
          className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-wedly-bg-blue text-wedly-accent-ink"
          aria-hidden
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">{q}</span>
        <ChevronDown
          className="ml-auto h-4 w-4 shrink-0 text-wedly-muted transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <p className="px-3.5 pb-3.5 pl-[46px] text-sm leading-[22px] text-wedly-t2 break-keep">
        {children}
      </p>
    </details>
  );
}

// ────────────────────────────────────────────────────────────── 체크리스트

const CHECKLIST = [
  "받는 분 수와 자동 제외 수를 봤다",
  "원문에 무엇을·언제까지·어디로가 있다",
  "미리보기 둘째 줄이 내 이름이다",
  "내 번호로 시험 발송해 봤다",
  "안내 내용을 골랐고, 취소가 안 된다는 것을 안다",
] as const;

// ────────────────────────────────────────────────────────────── 본체

export function BulkMessageManual() {
  const sections = useRef<Partial<Record<NavId, HTMLElement | null>>>({});
  const [active, setActive] = useState<NavId>("overview");

  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false));
  const doneCount = useMemo(() => checked.filter(Boolean).length, [checked]);
  const progressText =
    doneCount === CHECKLIST.length ? "보내도 좋아요" : doneCount > 0 ? "확인 중…" : "아직 확인 전";

  const toggle = useCallback((i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }, []);

  const goTo = useCallback((id: NavId) => {
    sections.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // 지금 읽고 있는 구역을 목차에서 강조한다. 서버 그리기에는 없는 물건이라 가드를 둔다.
  useEffect(() => {
    // 서버 그리기(SSR)에는 IntersectionObserver 가 없다 — 없으면 강조만 안 하고 넘어간다.
    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const hit = NAV.find((n) => domId(n.id) === entry.target.id);
            if (hit) setActive(hit.id);
          }
        },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      for (const n of NAV) {
        const el = sections.current[n.id];
        if (el) io.observe(el);
      }
      return () => io.disconnect();
    }
    return undefined;
  }, []);

  const bindSection = (id: NavId) => (el: HTMLElement | null) => {
    sections.current[id] = el;
  };

  const flow: Array<{
    tone: TileTone;
    icon: ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    go: NavId;
  }> = [
    { tone: "blue", icon: Users, title: "1. 받을 분 고르기", desc: "조건·목록·번호 붙여넣기 중 하나", go: "step1" },
    {
      tone: "purple",
      icon: MessageSquare,
      title: "2. 안내문 만들기",
      desc: "원문을 적으면 AI가 다듬고, 내 번호로 먼저 받아 봅니다",
      go: "step2",
    },
    {
      tone: "green",
      icon: Send,
      title: "3. 발송 확인",
      desc: "안내 종류를 고르고 한 번 더 확인한 뒤 보냅니다",
      go: "step3",
    },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
      {/* ══════════ 목차 ══════════ */}
      <nav className="grid gap-1 self-start md:sticky md:top-3" aria-label="사용방법 목차">
        <div className="px-2.5 py-1 text-[13px] font-semibold tracking-wide text-wedly-muted">
          사용방법
        </div>
        {NAV.map((n) => {
          const on = active === n.id;
          return (
            <a
              key={n.id}
              href={`#${domId(n.id)}`}
              aria-current={on ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                setActive(n.id);
                goTo(n.id);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] leading-[21px] break-keep transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent",
                on
                  ? "bg-wedly-bg-blue font-semibold text-wedly-accent"
                  : "font-medium text-wedly-t2 hover:bg-wedly-bg-gray",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[13px] font-bold",
                  on ? "bg-wedly-accent text-white" : "bg-wedly-bg-gray text-wedly-t2",
                )}
                aria-hidden
              >
                {n.chip}
              </span>
              <span className="min-w-0">{n.label}</span>
            </a>
          );
        })}
      </nav>

      {/* ══════════ 본문 열 ══════════ */}
      <div className="grid max-w-[720px] gap-7 text-sm leading-[22px] text-wedly-t2">
        {/* ── 한눈에 보기 ── */}
        <section ref={bindSection("overview")} id={domId("overview")} className="grid gap-3.5 scroll-mt-4">
          <div className="grid gap-2.5 rounded-2xl border border-wedly-bd bg-wedly-bg-gray px-5 py-5">
            <p className="text-wedly-page font-bold text-wedly-t1 break-keep">
              계약완료 고객에게 안내를 한 번에 보냅니다
            </p>
            <p className="text-sm leading-[22px] text-wedly-t2 break-keep">
              받을 분 고르기 → 안내문 만들기 → 발송 확인. 3단계, 약 3분이면 끝납니다. 고객은 카카오톡 알림을 받고
              채팅방에서 안내문을 읽습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                `한 번에 최대 ${MAX_RECIPIENTS}명`,
                `시험 발송 하루 ${TEST_SEND_CAP_STAFF}건(파트너 앱 ${TEST_SEND_CAP_PARTNER}건)`,
                "답장은 보낸 담당자에게",
              ].map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-wedly-bd bg-white px-2.5 py-1 text-[13px] font-medium text-wedly-t1 shadow-sm"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-wedly-accent" aria-hidden />
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            {flow.map((f) => (
              <div
                key={f.title}
                role="button"
                tabIndex={0}
                onClick={() => goTo(f.go)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goTo(f.go);
                  }
                }}
                className="grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-wedly-bd bg-white px-3.5 py-3 transition-[background-color,box-shadow] duration-200 ease-out hover:bg-wedly-bg-gray hover:shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent motion-reduce:transition-none"
              >
                <Tile tone={f.tone} icon={f.icon} size="lg" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-[22px] text-wedly-t1 break-keep">{f.title}</p>
                  <p className="text-[13.5px] leading-[21px] text-wedly-t2 break-keep">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 1 받을 분 고르기 ── */}
        <section ref={bindSection("step1")} id={domId("step1")} className="grid gap-3.5 scroll-mt-4">
          <SectionHead
            chip="1"
            title="받을 분 고르기"
            desc="조건을 고르면 대상이 자동으로 올라와요. 빼고 싶은 분만 체크를 끄세요."
          />
          <p className="text-sm font-medium leading-[22px] text-wedly-t1 break-keep">
            세 가지 방법 중 하나를 고릅니다.
          </p>
          <div className="grid gap-2">
            <Row
              label="조건으로 찾기"
              items={[
                <>
                  <K>언제</K> 진행상태 기준으로 여럿에게 보낼 때 (가장 빠름)
                </>,
                <>
                  <K>어떻게</K> 진행상태(기본 계약완료)와 담당 컨설턴트를 고르면 표가 채워집니다
                </>,
              ]}
            />
            <Row
              label="목록에서 고르기"
              items={[
                <>
                  <K>언제</K> 몇 분만 골라 보낼 때
                </>,
                <>
                  <K>어떻게</K> 회사 목록에서 직접 체크. 표 머리 체크박스는 전체 선택
                </>,
              ]}
            />
            <Row
              label="번호 붙여넣기"
              items={[
                <>
                  <K>언제</K> 엑셀 등 다른 자료의 번호로 보낼 때
                </>,
                <>
                  <K>어떻게</K> 번호를 붙여넣으면 고객이 자동으로 짝지어집니다 (최대 {MAX_RECIPIENTS}개)
                </>,
                <>
                  <K>주의</K> 등록되지 않은 번호도 「가능」으로 올라옵니다. 파트너 앱은 범위 밖 번호가 빠집니다
                </>,
              ]}
            />
          </div>

          <div className="grid gap-2.5 md:grid-cols-2">
            <InfoCard tone="gray" icon={ListFilter} title="담당 컨설턴트" soft>
              내 고객(기본) · 전체 · 특정 이름. 프로필에 이름이 없으면 「내 고객」을 고를 수 없어요.
            </InfoCard>
            <InfoCard tone="gray" icon={LayoutGrid} title="숫자 타일 3개" soft>
              조건에 잡힌 고객 · 발송 가능 · 자동 제외. 제외된 분은 표에 남지만 체크가 잠깁니다.
            </InfoCard>
          </div>

          <p className="text-sm font-medium leading-[22px] text-wedly-t1 break-keep">
            자동 제외 표시 — 이런 뜻입니다.
          </p>
          <div className="grid gap-2">
            <Row label={<Badge variant="red">수신거부</Badge>} items={["안내를 받지 않겠다고 한 분. 보낼 수 없습니다"]} />
            <Row
              label={<Badge variant="yellow">번호 없음</Badge>}
              items={["번호가 비었거나 휴대폰 모양이 아님 (02-…). 고객 정보의 연락처를 고치세요"]}
            />
            <Row
              label={<Badge variant="yellow">중복 번호</Badge>}
              items={["같은 번호가 두 번 잡힘. 한 분에게만 갑니다"]}
            />
            <Row
              label={<Badge variant="blue">범위 밖</Badge>}
              items={["이 앱에서 볼 수 있는 정부지원금 고객이 아님 (파트너 앱). 담당자에게 문의"]}
            />
          </div>
        </section>

        {/* ── 2 안내문 만들기 ── */}
        <section ref={bindSection("step2")} id={domId("step2")} className="grid gap-3.5 scroll-mt-4">
          <SectionHead chip="2" title="안내문 만들기" desc="적고 잠시 멈추면 AI가 위들리 형식으로 바꿔 줘요." />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-wedly-muted">
                원문 — 평소 쓰던 대로
              </p>
              <div className="rounded-xl border border-wedly-bd bg-wedly-bg-gray px-3.5 py-3 text-sm leading-[22px] text-wedly-t1 break-keep">
                지원금 신청 서류 제출 안내입니다. 사업자등록증과 최근 3개월 급여대장을 9월 10일까지 담당자에게
                보내주세요. 기한 내 미제출 시 심사가 지연될 수 있습니다.
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-wedly-muted">변환 결과</p>
              <div className="rounded-xl border border-wedly-bd bg-white px-3.5 py-3 text-sm leading-[22px] text-wedly-t1 break-keep">
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-wedly-t1">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-wedly-accent text-[13px] font-bold text-white"
                    aria-hidden
                  >
                    W
                  </span>
                  위들리
                </div>
                안녕하세요,{" "}
                <span className="rounded bg-wedly-bg-blue px-1 font-semibold text-wedly-accent-ink">
                  {"{대표명}"}
                </span>{" "}
                대표님 😊
                <br />
                위들리 담당 컨설턴트 <b className="font-semibold">홍길동</b>입니다.
                <br />
                <br />
                📋 제출하실 서류
                <br />- 사업자등록증
                <br />- 최근 3개월 급여대장
                <br />
                <br />⏰ 제출 기한 · 9월 10일까지
              </div>
            </div>
          </div>
          <p className="text-sm font-medium leading-[22px] text-wedly-t1 break-keep">
            잘 되는 원문의 네 가지: 무엇을 · 언제까지 · 어디로 · 안 하면 어떻게 되는지. 인사말과 내 이름은 AI가
            붙입니다.
          </p>
          <div className="grid gap-2.5 md:grid-cols-2">
            <InfoCard tone="purple" icon={RefreshCw} title="다시 변환">
              원문을 고쳤거나 결과가 마음에 안 들면 누르세요. 결과가 비면 「먼저 안내문 변환이 끝나야 해요」로
              막힙니다.
            </InfoCard>
            <InfoCard tone="blue" icon={Braces} title={"{대표명} · {회사명}"}>
              원문에 넣으면 받는 분마다 실제 이름·회사명으로 바뀝니다. 값이 없는 분은 「확인 필요」.
            </InfoCard>
            <InfoCard tone="green" icon={Pencil} title="직접 고치기">
              미리보기 글을 바로 수정합니다. 나가는 문구는 미리보기 그대로예요.
            </InfoCard>
            <InfoCard tone="blue" icon={Smartphone} title="내 번호로 시험 발송">
              보내기 전에 꼭 한 번. 문구 앞에 [시험 발송]이 붙고 하루 {TEST_SEND_CAP_STAFF}건(파트너 앱{" "}
              {TEST_SEND_CAP_PARTNER}건)까지.
            </InfoCard>
          </div>
        </section>

        {/* ── 3 발송 확인 ── */}
        <section ref={bindSection("step3")} id={domId("step3")} className="grid gap-3.5 scroll-mt-4">
          <SectionHead chip="3" title="발송 확인" desc="마지막으로 한 번 더 확인하고 보냅니다." />
          <div className="grid gap-2">
            <Row label="받는 사람" items={["1단계에서 체크된 인원. 자동 제외된 분은 빠진 숫자"]} />
            <Row label="보내는 이름" items={["항상 위들리(채널톡 공식 채널). 개인 번호로 나가지 않습니다"]} />
            <Row label="고객이 받는 방법" items={["카카오톡 알림 → 누르면 채팅방에서 안내문 확인"]} />
            <Row label="답장 오면" items={["보낸 담당자에게 자동 배정(채널톡 담당자로 등록된 경우)"]} />
            <Row label="예상 비용" items={["알림 건당 7~28원. 이번 발송의 최대 금액이 함께 보입니다"]} />
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            <InfoCard tone="gold" icon={Tag} title="안내 내용은 필수">
              서류 준비 안내 · 심사 일정 안내 · 결과 통보 · 기타 안내 중 하나. 카카오 알림톡 문구에 그대로 들어갑니다.
            </InfoCard>
            <InfoCard tone="red" icon={AlertTriangle} title="발송 후에는 취소할 수 없어요">
              「정말 보낼까요?」에서 한 번 더 확인합니다. 10분 안에 같은 내용은 다시 보낼 수 없고, 이미 받은 분은
              자동으로 건너뜁니다.
            </InfoCard>
          </div>
        </section>

        {/* ── 4 보낸 뒤 ── */}
        <section ref={bindSection("after")} id={domId("after")} className="grid gap-3.5 scroll-mt-4">
          <SectionHead
            chip="4"
            title="보낸 뒤 — 진행 표 읽기"
            desc="발송 중에는 진행률이, 끝나면 실패한 분이 따로 보입니다."
          />
          <div className="grid gap-2.5 md:grid-cols-2">
            <InfoCard tone="green" icon={Check} title="보냄 · 실패 · 남음" soft>
              2초마다 새로 셉니다. 「남음 0」이면 끝.
            </InfoCard>
            <InfoCard tone="gold" icon={AlertTriangle} title="알림톡이 못 갔어요" soft>
              채팅방 안내문은 들어갔고 카카오 알림만 못 간 경우. 「실패한 이유」를 보세요.
            </InfoCard>
            <InfoCard tone="blue" icon={RotateCcw} title="이어보내기" soft>
              중단·실패로 끝났고 남은 분이 있으면 단추가 나타납니다. 이미 받은 분은 빼고 이어갑니다.
            </InfoCard>
            <InfoCard tone="gray" icon={Clock} title="3분 넘게 멈춰 있으면" soft>
              「발송이 오래 멈춰 있어요」가 뜹니다. 잠시 뒤 새로 고쳐도 진행 표는 다시 열립니다.
            </InfoCard>
          </div>
        </section>

        {/* ── ? 자주 묻는 질문 ── */}
        <section ref={bindSection("faq")} id={domId("faq")} className="grid gap-3.5 scroll-mt-4">
          <SectionHead chip="?" title="자주 묻는 질문" desc="눌러서 펼치기" />
          <div className="grid gap-2">
            <Faq q="번호를 붙여넣었는데 표가 비어 있어요">
              휴대폰 모양 번호가 하나도 없거나(02 유선번호는 안 잡혀요), 파트너 앱에서 전부 범위 밖일 때입니다.
              하이픈·공백은 있어도 됩니다.
            </Faq>
            <Faq q="「시험 발송은 하루 N건까지예요」가 떠요">
              {`하루 ${TEST_SEND_CAP_STAFF}건(파트너 앱 ${TEST_SEND_CAP_PARTNER}건)입니다. 내일 다시 할 수 있고, 실패한 건은 횟수를 돌려줍니다.`}
            </Faq>
            <Faq q="「프로필에 이름이 없어 보낼 수 없어요」가 떠요">
              안내문 둘째 줄에 내 이름이 들어가야 해서 막습니다. 관리자에게 이름 등록을 요청하세요.
            </Faq>
            <Faq q="고객이 카카오 알림을 못 받았대요">
              「실패한 이유」를 보세요. 채팅방엔 안내문이 들어가 있고 알림만 못 간 경우가 대부분입니다.
            </Faq>
            <Faq q="같은 안내를 두 번 눌렀어요">
              10분 안에는 「같은 내용을 방금 보냈습니다」로 막히고, 그 뒤에도 이미 받은 분은 자동으로 건너뜁니다.
            </Faq>
            <Faq q="답장은 누가 받나요">
              보낸 담당자가 채널톡 담당자로 등록돼 있으면 그 사람, 아니면 기존 담당 컨설턴트 규칙대로 갑니다.
            </Faq>
          </div>
        </section>

        {/* ── ✓ 보내기 전 체크 ── */}
        <section ref={bindSection("check")} id={domId("check")} className="grid gap-3.5 scroll-mt-4">
          <SectionHead chip="✓" title="보내기 전 체크" desc={`${doneCount} / ${CHECKLIST.length} 확인`} />
          <div className="flex items-center gap-3 text-[13.5px] leading-[21px] text-wedly-t2">
            <ClipboardCheck
              className={cn(
                "h-4 w-4 shrink-0",
                doneCount === CHECKLIST.length ? "text-wedly-green" : "text-wedly-muted",
              )}
              aria-hidden
            />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-wedly-bg-gray">
              <span
                className="block h-full rounded-full bg-wedly-green transition-[width] duration-250 ease-out motion-reduce:transition-none"
                style={{ width: `${(doneCount / CHECKLIST.length) * 100}%` }}
              />
            </div>
            <span className="shrink-0 break-keep">{progressText}</span>
          </div>
          <div className="grid gap-2">
            {CHECKLIST.map((label, i) => (
              <label
                key={label}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-wedly-bd bg-white px-3.5 py-3 text-sm leading-[22px] text-wedly-t1 break-keep transition-colors duration-150 ease-out hover:bg-wedly-bg-gray focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wedly-accent"
              >
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={() => toggle(i)}
                  className="h-[18px] w-[18px] shrink-0 accent-wedly-accent"
                />
                <span className="min-w-0">{label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default BulkMessageManual;
