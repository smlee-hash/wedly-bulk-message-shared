"use client";

// 단체 안내 발송 화면이 단계 파일에서 나눠 쓰는 작은 그림 부품.
// 문구·클래스는 BulkMessageScreen 에서 옮긴 그대로다.

import { type ComponentType, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "../ui/Input";
import { cn } from "../ui/cn";
import { FILL_MAX_LEN, needsFillLabel, clampFillValue } from "./step2-helpers";

/** 서버(checks.ts findNeedsFill)와 같은 규칙 — 담당자가 직접 고친 글도 화면에서 바로 다시 센다. */
export const NEEDS_FILL_RE = /\[확인 필요[^\]]*\]/g;

/**
 * 화면에 쓸 연락처.
 *
 * ★목록 줄(rowId 있음)의 번호는 **서버가 이미 가려서**(010-2•••-4567) 내려 준다 —
 *  화면은 원문을 아예 받지 않는다. 발송할 때 서버가 rowId 로 원문을 다시 찾아 쓴다.
 *  rowId 가 없는 줄은 지금 통로에는 없지만(붙여넣기 폐지), 옛 응답이 섞여 와도 안 깨지게 남겨 둔다.
 */
export function displayPhone(t: { rowId: string; phone: string }): string {
  if (t.rowId) return t.phone || "—";
  const p = t.phone;
  if (!/^01\d{8,9}$/.test(p)) return "—";
  return p.length === 11
    ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
    : `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
}

export function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

export const TOKEN_CHIPS = ["{대표명}", "{회사명}"] as const;

/** 미리보기 — 「[확인 필요…]」 표식만 노란 표시로 도드라지게 그린다. */
export function renderPreview(text: string): ReactNode[] {
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

export function FillForm({
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

export function SectionHead({
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

export function LoadingStat() {
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
