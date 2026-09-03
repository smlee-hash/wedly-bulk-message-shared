"use client";

// 단체 안내 발송 — 사용방법 탭.
// 시각·문구 계약(정본): 사장님 승인 미리보기 preview-bulk-message-manual.html
//  - 구역 머리(번호 + 제목 + 오른쪽 안내 + 회색 바탕 + 밑선) · 파란 표 머리 · 아이콘 타일(h-9 w-9)
//  - 흐름 카드 3개는 눌러서 해당 구역으로 이동 · FAQ 는 <details> · 체크리스트는 진행 막대
// 금지: raw Tailwind 색. 숫자(500·10·3)는 limits.ts 한 곳에서 가져온다.

import { useCallback, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
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

// ────────────────────────────────────────────────────────────── 작은 조각

type TileTone = "blue" | "purple" | "green" | "gold" | "red" | "gray";

/** 아이콘 타일 — 상태 박스 v3 규격(h-9 w-9 rounded-lg 채움 + 심볼 h-5 w-5). */
const TILE_TONE: Record<TileTone, string> = {
  blue: "bg-wedly-accent text-white",
  purple: "bg-wedly-purple text-white",
  green: "bg-wedly-green text-white",
  // 금색 타일만 남색 심볼 — 금색 위 흰 글리프는 대비 2.1 미달(정본: 상태 박스 v3)
  gold: "bg-wedly-gold text-wedly-navy",
  red: "bg-wedly-red text-white",
  gray: "bg-wedly-bg-gray text-wedly-t2",
};

function Tile({ tone, icon: Icon }: { tone: TileTone; icon: ComponentType<{ className?: string }> }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm",
        TILE_TONE[tone],
      )}
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** 구역 머리줄 — 번호 + 제목 + 오른쪽 작은 안내. 구역 구분은 색이 아니라 이 머리줄이 한다. */
function SectionHead({ no, title, desc }: { no: string; title: string; desc: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-wedly-bd bg-wedly-bg-gray px-4 py-3 lg:pr-16">
      <span className="text-wedly-tablehead font-bold tabular-nums text-wedly-accent-ink">{no}</span>
      <h3 className="min-w-0 text-wedly-sub font-semibold text-wedly-t1 break-keep">{title}</h3>
      <span className="ml-auto text-wedly-hint text-wedly-muted break-keep">{desc}</span>
    </div>
  );
}

function Section({
  no,
  title,
  desc,
  innerRef,
  children,
}: {
  no: string;
  title: string;
  desc: ReactNode;
  innerRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <section
      ref={innerRef}
      className="scroll-mt-4 overflow-hidden rounded-2xl border border-wedly-bd bg-white shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]"
    >
      <SectionHead no={no} title={title} desc={desc} />
      <div className="grid gap-3 px-4 py-4">{children}</div>
    </section>
  );
}

/** 설명 상자 — 아이콘 타일 + 굵은 한 줄 + 그 밑 설명(카드 안쪽 위계). */
function InfoBox({
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
        "flex items-start gap-2.5 rounded-xl p-3.5",
        soft ? "bg-wedly-bg-gray" : "border border-wedly-bd bg-white",
      )}
    >
      <Tile tone={tone} icon={icon} />
      <div className="min-w-0">
        <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{title}</p>
        <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{children}</p>
      </div>
    </div>
  );
}

/** 안내 카드 — 상자보다 한 단 도드라지게(층 그림자). */
function NoteBox({
  tone,
  icon,
  title,
  children,
}: {
  tone: TileTone;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-wedly-bd bg-white p-3.5 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
      <Tile tone={tone} icon={icon} />
      <div className="min-w-0">
        <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{title}</p>
        <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{children}</p>
      </div>
    </div>
  );
}

/** 표 — 파란 머리 + 첫 칸 회색 층. 좁은 화면에서는 표만 옆으로 굴린다. */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-wedly-bd">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead className="text-wedly-tablehead">
          <tr className="bg-wedly-accent font-semibold text-white">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("px-3 py-2.5", i === 0 && "w-[150px]")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-wedly-sub">
          {rows.map((cells, r) => (
            <tr key={r} className="border-t border-wedly-bd">
              {cells.map((c, i) =>
                i === 0 ? (
                  <th
                    key={i}
                    scope="row"
                    className="whitespace-nowrap bg-wedly-bg-gray px-3 py-2.5 text-left align-top font-semibold text-wedly-t1"
                  >
                    {c}
                  </th>
                ) : (
                  <td key={i} className="min-w-0 px-3 py-2.5 align-top text-wedly-t2 break-keep">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 화면 속 버튼 이름을 글 안에서 가리킬 때. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-wedly-bd bg-white px-1.5 py-0.5 text-wedly-hint font-semibold text-wedly-t1">
      {children}
    </span>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-xl border border-wedly-bd bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-wedly-sub font-semibold text-wedly-t1 break-keep transition-colors duration-150 ease-out hover:bg-wedly-bg-gray focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-wedly-accent [&::-webkit-details-marker]:hidden">
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-wedly-bg-blue text-wedly-accent-ink"
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
      <p className="px-3.5 pb-3 pl-[42px] text-wedly-hint text-wedly-t2 break-keep">{children}</p>
    </details>
  );
}

// ────────────────────────────────────────────────────────────── 체크리스트

const CHECKLIST = [
  "받는 분 수와 자동 제외 수를 확인했다(체크 잠긴 분은 이유가 있다)",
  "원문에 무엇을·언제까지·어디로가 들어 있다",
  "미리보기 둘째 줄이 내 이름이고, {대표명}·{회사명}이 제대로 바뀐다",
  "내 번호로 시험 발송해 카카오톡에서 실제 모양을 봤다",
  "안내 내용(서류·일정·결과·기타)을 골랐고 취소가 안 된다는 것을 안다",
] as const;

// ────────────────────────────────────────────────────────────── 본체

export function BulkMessageManual() {
  const s1 = useRef<HTMLElement | null>(null);
  const s2 = useRef<HTMLElement | null>(null);
  const s3 = useRef<HTMLElement | null>(null);

  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false));
  const doneCount = useMemo(() => checked.filter(Boolean).length, [checked]);
  const progressText =
    doneCount === CHECKLIST.length ? "보내도 좋아요" : doneCount > 0 ? "확인 중…" : "아직 확인 전";

  const toggle = useCallback((i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }, []);

  const goTo = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const flow: Array<{ tone: TileTone; icon: ComponentType<{ className?: string }>; title: string; desc: string; ref: React.RefObject<HTMLElement | null> }> = [
    {
      tone: "blue",
      icon: Users,
      title: "① 받을 분 고르기",
      desc: "조건·목록·번호 붙여넣기 중 하나로 대상을 만듭니다",
      ref: s1,
    },
    {
      tone: "purple",
      icon: MessageSquare,
      title: "② 안내문 만들기",
      desc: "원문을 적으면 AI가 다듬고, 내 번호로 먼저 받아 봅니다",
      ref: s2,
    },
    {
      tone: "green",
      icon: Send,
      title: "③ 발송 확인",
      desc: "안내 종류를 고르고 한 번 더 확인한 뒤 보냅니다",
      ref: s3,
    },
  ];

  return (
    <div className="grid gap-3.5">
      {/* ══════════ 머리 — 한 줄 요약 + 숫자 칩 ══════════ */}
      <div className="grid grid-cols-1 items-center gap-3.5 rounded-2xl border border-wedly-bd bg-wedly-bg-gray px-4 py-4 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h2 className="text-wedly-section font-bold text-wedly-t1 break-keep">
            계약완료 고객에게 안내를 한 번에 — 3단계, 약 3분
          </h2>
          <p className="mt-1 text-wedly-sub text-wedly-t2 break-keep">
            받을 분을 고르고, 원문을 적으면 AI가 위들리 형식으로 다듬고, 확인 뒤 보냅니다. 고객은 카카오톡 알림을 받고
            채팅방에서 안내문을 읽으며, 답장은 보낸 담당자에게 연결됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            `한 번에 최대 ${MAX_RECIPIENTS}명`,
            `시험 발송 하루 ${TEST_SEND_CAP_STAFF}건 · 파트너 앱 ${TEST_SEND_CAP_PARTNER}건`,
            "카카오 알림 + 채팅방 안내문",
          ].map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-wedly-bd bg-white px-2.5 py-1 text-wedly-hint text-wedly-t2 shadow-sm"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-wedly-accent" aria-hidden />
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════ 흐름 카드 3개 — 누르면 그 구역으로 ══════════ */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {flow.map((f, i) => (
          <div key={f.title} className="contents">
            {i > 0 && (
              <span className="hidden self-center text-wedly-section text-wedly-muted md:inline" aria-hidden>
                ›
              </span>
            )}
            <div
              role="button"
              tabIndex={0}
              onClick={() => goTo(f.ref)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goTo(f.ref);
                }
              }}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-wedly-bd bg-white p-3.5 transition-colors duration-150 ease-out hover:bg-wedly-bg-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedly-accent"
            >
              <Tile tone={f.tone} icon={f.icon} />
              <div className="min-w-0">
                <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{f.title}</p>
                <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{f.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════ 01 받을 분 고르기 ══════════ */}
      <Section
        no="01"
        title="받을 분 고르기"
        desc="조건을 고르면 대상이 자동으로 올라와요. 빼고 싶은 분만 체크를 끄세요"
        innerRef={s1}
      >
        <Table
          head={["방법", "언제 쓰나", "이렇게"]}
          rows={[
            [
              "조건으로 찾기",
              "진행상태 기준으로 여럿에게 보낼 때(가장 빠름)",
              <>
                진행상태(기본 <Badge variant="green">계약완료</Badge>, 여러 개 가능)와 담당 컨설턴트를 고르면 표가
                채워집니다.
              </>,
            ],
            [
              "목록에서 고르기",
              "몇 분만 골라 보낼 때",
              "회사 목록에서 직접 체크합니다. 표 머리의 체크박스는 「보낼 수 있는 사람 전체 고르기」입니다.",
            ],
            [
              "번호 붙여넣기",
              "엑셀 등 다른 자료의 번호로 보낼 때",
              `번호를 복사해 붙여넣으면 고객이 자동으로 짝지어집니다. 등록되지 않은 번호도 그대로 올라와 보낼 수 있어요(회사명·대표명은 「—」, 개인화 값은 「확인 필요」). 파트너 앱에서는 볼 수 있는 고객 범위 밖 번호가 빠집니다. 한 번에 ${MAX_RECIPIENTS}개까지, 넘치면 앞 ${MAX_RECIPIENTS}개만 남고 안내가 뜹니다.`,
            ],
          ]}
        />

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <InfoBox tone="gray" icon={ListFilter} title="담당 컨설턴트 필터">
            <b className="font-semibold text-wedly-t1">내 고객</b>(기본) · <b className="font-semibold text-wedly-t1">전체</b> ·
            특정 이름. 「내 고객」은 로그인한 내 이름이 담당인 고객만 잡습니다. 프로필에 이름이 없으면 「내 고객」을 고를
            수 없어요.
          </InfoBox>
          <InfoBox tone="gray" icon={LayoutGrid} title="숫자 타일 3개">
            <b className="font-semibold text-wedly-t1">조건에 잡힌 고객</b> = 표에 올라온 전부 ·{" "}
            <b className="font-semibold text-wedly-t1">발송 가능</b> = 실제로 보낼 수 있는 분 ·{" "}
            <b className="font-semibold text-wedly-t1">자동 제외</b> = 아래 사유로 빠진 분(표에는 남아 있지만 체크가
            잠깁니다).
          </InfoBox>
        </div>

        <Table
          head={["자동 제외 표시", "뜻", "할 수 있는 것"]}
          rows={[
            [
              <Badge variant="red">수신거부</Badge>,
              "이 번호가 안내를 받지 않겠다고 한 분",
              "보낼 수 없습니다. 체크가 잠깁니다.",
            ],
            [
              <Badge variant="yellow">번호 없음</Badge>,
              "휴대폰 번호가 비었거나 휴대폰 모양이 아님(02-… 등)",
              "고객 정보의 연락처를 먼저 고치세요.",
            ],
            [
              <Badge variant="yellow">중복 번호</Badge>,
              "같은 번호가 두 번 잡힘",
              "한 분에게만 갑니다. 손댈 것 없어요.",
            ],
            [
              <Badge variant="blue">범위 밖</Badge>,
              "이 앱에서 볼 수 있는 정부지원금 고객이 아님(일루아 등 파트너 앱)",
              "붙여넣은 번호가 전부 범위 밖이면 「볼 수 있는 고객 범위 밖」 안내가 뜹니다. 담당자에게 문의하세요.",
            ],
          ]}
        />
      </Section>

      {/* ══════════ 02 안내문 만들기 ══════════ */}
      <Section
        no="02"
        title="안내문 만들기"
        desc="적고 잠시 멈추면 AI가 위들리 형식으로 바꿔 줘요"
        innerRef={s2}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <h4 className="mb-1.5 text-wedly-sub font-semibold uppercase tracking-wider text-wedly-muted">
              원문 — 평소 쓰던 대로
            </h4>
            <div className="whitespace-pre-wrap rounded-xl border border-wedly-bd bg-wedly-bg-gray px-3.5 py-3 text-wedly-sub text-wedly-t1 break-keep">
              지원금 신청 서류 제출 안내입니다. 사업자등록증과 최근 3개월 급여대장을 9월 10일까지 담당자에게 보내주세요.
              기한 내 미제출 시 심사가 지연될 수 있습니다.
            </div>
            <p className="mt-2 text-wedly-hint text-wedly-t2 break-keep">
              잘 되는 원문의 네 가지: <b className="font-semibold text-wedly-t1">무엇을</b> ·{" "}
              <b className="font-semibold text-wedly-t1">언제까지</b> ·{" "}
              <b className="font-semibold text-wedly-t1">어디로(누구에게)</b> ·{" "}
              <b className="font-semibold text-wedly-t1">안 하면 어떻게 되는지</b>. 인사말·이름은 적지 않아도 AI가
              붙입니다.
            </p>
          </div>
          <div className="min-w-0">
            <h4 className="mb-1.5 text-wedly-sub font-semibold uppercase tracking-wider text-wedly-muted">
              변환 결과 미리보기
            </h4>
            <div className="rounded-xl border border-wedly-bd bg-white px-3.5 py-3 text-wedly-sub text-wedly-t1 break-keep">
              <div className="mb-1.5 flex items-center gap-1.5 text-wedly-hint font-semibold text-wedly-t1">
                <span
                  className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-wedly-accent text-[10px] font-bold text-white"
                  aria-hidden
                >
                  W
                </span>
                위들리
              </div>
              안녕하세요, <span className="rounded bg-wedly-bg-blue px-1 font-semibold text-wedly-accent-ink">{"{대표명}"}</span> 대표님 😊
              <br />
              위들리 담당 컨설턴트 <b className="font-semibold">홍길동</b>입니다.
              <br />
              <br />
              지원금 신청을 위해 필요한 서류를 제출해 주셔야 합니다.
              <br />
              <br />
              📋 제출하실 서류
              <br />- 사업자등록증
              <br />- 최근 3개월 급여대장
              <br />
              <br />⏰ 제출 기한 · 9월 10일까지
            </div>
            <p className="mt-2 text-wedly-hint text-wedly-t2 break-keep">
              둘째 줄의 이름은 <b className="font-semibold text-wedly-t1">로그인한 내 이름</b>이 자동으로 들어갑니다(팀
              이름을 지어내지 않아요).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <InfoBox tone="purple" icon={RefreshCw} title="다시 변환" soft>
            원문을 고쳤거나 결과가 마음에 안 들면 <Kbd>다시 변환</Kbd>. 결과가 비어 있으면
            「먼저 안내문 변환이 끝나야 해요」가 뜨고 발송으로 못 넘어갑니다.
          </InfoBox>
          <InfoBox tone="blue" icon={Braces} title="{대표명} · {회사명}" soft>
            「눌러서 넣기」 버튼으로 원문에 넣으면 <b className="font-semibold text-wedly-t1">받는 분마다 실제 이름·회사명</b>
            으로 바뀌어 나갑니다. 값이 없는 분은 미리보기에 「확인 필요」가 붙어요.
          </InfoBox>
          <InfoBox tone="green" icon={Pencil} title="직접 고치기" soft>
            미리보기 오른쪽 위 <Kbd>직접 고치기</Kbd>를 누르면 결과 글을 바로 수정할 수 있습니다. 나가는 문구는{" "}
            <b className="font-semibold text-wedly-t1">미리보기 그대로</b>입니다.
          </InfoBox>
        </div>

        <NoteBox tone="blue" icon={Smartphone} title="내 번호로 시험 발송 — 보내기 전에 꼭 한 번">
          휴대폰 번호를 넣으면 지금 미리보기 그대로 내 카카오톡·채팅방에 옵니다. 문구 앞에{" "}
          <b className="font-semibold text-wedly-t1">[시험 발송]</b>이 붙고, 개인화 값은 홍길동·시험회사로 채워집니다.
          하루 <b className="font-semibold text-wedly-t1">{`${TEST_SEND_CAP_STAFF}건`}</b>(파트너 앱은{" "}
          <b className="font-semibold text-wedly-t1">{`${TEST_SEND_CAP_PARTNER}건`}</b>)까지이며, 수신거부 번호로는 안
          갑니다.
        </NoteBox>
      </Section>

      {/* ══════════ 03 발송 확인 ══════════ */}
      <Section no="03" title="발송 확인" desc="마지막으로 한 번 더 확인하고 보냅니다" innerRef={s3}>
        <Table
          head={["확인 표 항목", "보는 법"]}
          rows={[
            ["받는 사람", "1단계에서 체크된 인원. 자동 제외된 분은 빠진 숫자입니다."],
            [
              "보내는 이름",
              <>
                항상 <b className="font-semibold text-wedly-t1">위들리</b>(채널톡 공식 채널). 개인 번호로 나가지 않습니다.
              </>,
            ],
            [
              "고객이 받는 방법",
              "카카오톡 알림 「새로운 메시지가 도착했어요」 → 누르면 채팅방에서 안내문을 봅니다.",
            ],
            [
              "답장 오면",
              "보낸 담당자에게 자동 배정(채널톡 담당자로 등록된 경우). 등록이 없으면 기존 담당 컨설턴트 규칙으로 갑니다.",
            ],
            ["예상 비용", "알림 건당 7~28원. 이번 발송의 최대 금액이 함께 보입니다."],
          ]}
        />

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <InfoBox tone="gold" icon={Tag} title="안내 내용(필수)">
            <b className="font-semibold text-wedly-t1">서류 준비 안내 · 심사 일정 안내 · 결과 통보 · 기타 안내</b> 중 하나.
            이 값이 카카오 알림톡 문구에 그대로 들어가며, 비어 있으면 발송 단추가 잠깁니다.
          </InfoBox>
          <InfoBox tone="red" icon={AlertTriangle} title="발송 후에는 취소할 수 없어요">
            <Kbd>N명에게 발송하기</Kbd> → 「정말 보낼까요?」 창에서 한 번 더 확인합니다. 같은 안내를 실수로 두 번 실행해도
            이미 받은 분은 자동으로 건너뛰고, 10분 안에 같은 내용은 다시 보낼 수 없습니다.
          </InfoBox>
        </div>
      </Section>

      {/* ══════════ 04 보낸 뒤 — 진행 표 읽기 ══════════ */}
      <Section
        no="04"
        title="보낸 뒤 — 진행 표 읽기"
        desc="발송 중에는 진행률이 표시되고, 실패한 분은 따로 모아 보여줍니다"
      >
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <InfoBox tone="green" icon={Check} title="보냄 · 실패 · 남음" soft>
            2초마다 새로 셉니다. 「남음 0」이 되면 끝. 「N명에게 보냈어요」 뒤에 답장 배정 안내가 나옵니다.
          </InfoBox>
          <InfoBox tone="gold" icon={AlertTriangle} title="「알림톡이 N명에게 가지 못했어요」" soft>
            채팅방 안내문은 들어갔고 <b className="font-semibold text-wedly-t1">카카오 알림만</b> 못 간 경우입니다. 표의
            「실패한 이유」를 보세요. 예) <i>비즈톡 문구가 승인 상태가 아닙니다</i> = 카카오 문구 승인 전.
          </InfoBox>
          <InfoBox tone="blue" icon={RotateCcw} title="이어보내기" soft>
            발송이 서버 재시작(배포)으로 끊기면 「중단」, 오류로 끝나면 「실패」 상태가 되고, 남은 분이 있으면{" "}
            <Kbd>이어보내기</Kbd>가 나타납니다. 이미 받은 분은 빼고 남은 분만 이어갑니다. 진행이 3분 넘게 안 올라가면
            「발송이 오래 멈춰 있어요」 안내가 뜨니 잠시 뒤 새로 고쳐 상태를 다시 확인하세요. 파트너 앱은 이어보낼 때 볼
            수 있는 고객 범위를 다시 확인합니다.
          </InfoBox>
        </div>

        <NoteBox tone="gray" icon={Clock} title="진행 상황을 못 불러오고 있어요 — 라고 뜨면">
          발송은 서버에서 계속 돌고 있습니다. 화면을 그대로 두면 계속 다시 확인합니다.{" "}
          <b className="font-semibold text-wedly-t1">새로고침해도 이 작업의 진행 표는 다시 열립니다.</b>
        </NoteBox>
      </Section>

      {/* ══════════ 05 자주 묻는 질문 ══════════ */}
      <Section no="05" title="자주 묻는 질문" desc="눌러서 펼치기">
        <div className="grid gap-2">
          <Faq q="번호를 붙여넣었는데 표가 비어 있어요">
            표가 비는 경우는 두 가지예요. 휴대폰 모양 번호가 하나도 없을 때(02로 시작하는 유선번호는 잡히지 않아요 —
            「번호로 알아볼 수 있는 고객이 없어요」가 뜹니다)와, 파트너 앱에서 붙여넣은 번호가 전부 볼 수 있는 고객 범위
            밖일 때(「붙여넣은 번호가 모두 볼 수 있는 고객 범위 밖이에요」)입니다. 하이픈·공백은 있어도 됩니다. 등록되지
            않은 번호는 빈 회사명으로 올라오니 보내기 전에 한 번 더 확인하세요.
          </Faq>
          <Faq q="「시험 발송은 하루 N건까지예요」가 떠요">
            {`내 번호로 보내는 시험 발송은 하루 ${TEST_SEND_CAP_STAFF}건(파트너 앱 ${TEST_SEND_CAP_PARTNER}건)입니다. 내일 다시 할 수 있어요. 발송이 실패한 건은 횟수에서 돌려줍니다.`}
          </Faq>
          <Faq q="「프로필에 이름이 없어 보낼 수 없어요」가 떠요">
            안내문 둘째 줄(위들리 담당 컨설턴트 ○○○입니다)에 내 이름이 들어가야 해서 이름이 비어 있으면 막습니다.
            관리자에게 이름 등록을 요청하세요.
          </Faq>
          <Faq q="보냈는데 고객이 카카오 알림을 못 받았대요">
            진행 표의 「실패한 이유」를 보세요. 채팅방엔 안내문이 들어가 있고 카카오 알림만 못 간 경우가 대부분입니다(문구
            승인 전, 수신거부 등). 고객이 위들리 채널톡을 열면 안내문이 보입니다.
          </Faq>
          <Faq q="실수로 같은 안내를 두 번 눌렀어요">
            10분 안에 같은 내용은 「같은 내용을 방금 보냈습니다. 10분 뒤에 다시 시도해 주세요.」로 막히고, 시간이 지나
            다시 보내도 이미 받은 분은 자동으로 건너뜁니다.
          </Faq>
          <Faq q="답장은 누가 받나요">
            보낸 담당자가 채널톡 담당자로 등록돼 있으면 그 사람에게, 아니면 기존 담당 컨설턴트 규칙대로 배정됩니다.
            3단계 확인 표의 「답장 오면」 줄에 이번 발송의 배정 결과가 미리 보입니다.
          </Faq>
        </div>
      </Section>

      {/* ══════════ 06 보내기 전 체크리스트 ══════════ */}
      <Section no="06" title="보내기 전 체크리스트" desc={`${doneCount} / ${CHECKLIST.length} 확인`}>
        <div className="flex items-center gap-2.5 text-wedly-hint text-wedly-t2">
          <ClipboardCheck
            className={cn("h-4 w-4 shrink-0", doneCount === CHECKLIST.length ? "text-wedly-green" : "text-wedly-muted")}
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

        <div className="grid gap-1.5">
          {CHECKLIST.map((label, i) => (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-wedly-bd bg-white px-3 py-2.5 text-wedly-sub text-wedly-t1 break-keep transition-colors duration-150 ease-out hover:bg-wedly-bg-gray focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wedly-accent"
            >
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => toggle(i)}
                className="h-4 w-4 shrink-0 accent-wedly-accent"
              />
              <span className="min-w-0">{label}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}

export default BulkMessageManual;
