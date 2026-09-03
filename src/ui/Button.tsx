"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * ★`link` 는 2026-08-28 신설 — **글 안에 섞여 들어가는 누를 거리**용(표 칸의 숫자,
 * 문장 끝의 「지금 채우기」 같은 자리).
 *
 * 왜 필요했나: 그 자리들을 `ghost` 로 바꿨더니 글자가 `text-wedly-t2`(연한 회색)가 되어,
 * 바로 옆의 **못 누르는** 숫자(칸에서 물려받은 진한 t1)보다 흐려졌다. 누를 수 있는 쪽이
 * 더 안 보이는 뒤집힘이라, 어느 숫자를 눌러야 하는지 화면에서 알 방법이 사라졌다
 * (2026-08-28 적대적 리뷰 지적 6). 게다가 알약 규격(h-7·px-2·둥근 모서리)이 글 사이에
 * 끼어들어 표 칸 폭까지 늘렸다.
 * 그래서 색은 **누를 수 있음을 알리는 파랑**, 모양은 **글자 그대로**(높이·여백 없음)인
 * 변형을 둔다. 크기(size)는 무시된다 — 글에 얹히는 것이라 자기 높이를 갖지 않는다.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
/**
 * ★`xs` 는 2026-08-28 신설 — 표 칸·카드 머리에 들어가는 **빽빽한 자리**용.
 *
 * 왜 필요했나: 광고 관리 화면 하나에만 손으로 그린 단추가 94개 있었고, 그 대부분이
 * `px-2 py-1 text-wedly-hint`(높이 ~28px) 짜리 작은 단추였다. 가장 작은 `sm`(h-8·14px·굵기 700)
 * 으로 바꾸면 표 줄 높이가 통째로 늘고 굵은 글자가 표를 뒤덮는다 — 업무 도구는 한 화면에
 * 표·숫자를 많이 담아야 한다는 정본 결정과 부딪힌다.
 * 정본 확장 규칙이 「비슷한 부품이 있으면 **변형으로 추가**(새 파일 금지)」라고 정해 둔 그대로,
 * 새 규격을 손으로 만들지 않고 이 부품의 크기 한 칸으로 넣었다.
 */
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-wedly-accent text-white hover:bg-[#0055CC] active:bg-[#004AB5]",
  secondary:
    "bg-white text-wedly-t1 border border-wedly-bd hover:bg-wedly-bg-gray active:bg-wedly-bg-sidebar",
  ghost: "text-wedly-t2 hover:bg-wedly-bg-gray active:bg-wedly-bg-sidebar",
  danger: "bg-wedly-red text-white hover:bg-[#C92A2A] active:bg-[#B02525]",
  // 글에 얹히는 링크 — 흰 바탕에서 대비 6.3 으로 t1(16.4) 옆에서도 「누를 수 있음」이 읽힌다.
  link: "text-wedly-accent-ink underline-offset-2 hover:underline",
};

// ★굵기를 크기별로 둔다 — 작은 단추까지 700 이면 표가 굵은 글자로 뒤덮인다.
const sizeStyles: Record<Size, string> = {
  xs: "h-7 px-2 text-xs font-medium gap-1",
  sm: "h-8 px-3 text-sm font-bold gap-1.5",
  md: "h-9 px-4 text-sm font-bold gap-2",
  lg: "h-10 px-5 text-base font-bold gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-[14px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantStyles[variant],
        // ★link 는 글자 그대로여야 하므로 알약 규격(높이·좌우 여백)을 붙이지 않는다.
        variant === "link" ? "h-auto p-0 font-medium" : sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
);

Button.displayName = "Button";
