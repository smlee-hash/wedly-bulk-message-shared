import { cn } from "./cn";
import type { HTMLAttributes } from "react";

/**
 * 카드 — **기본이 확정 시안 D(이중 베젤)다** (2026-08-24 사장님 「전면 교체」 결정).
 *
 * 두 겹이다: 바깥 연파랑 셸(`bg-wedly-bg-gray` + 8px 여백) 안에 흰 코어.
 *
 * ★셸에 **테두리와 층 그림자**를 준다 — 확정 시안 그림에는 없던 것이다(2026-08-25 적대적 리뷰).
 *  시안은 `/design-system` 의 **흰 패널 위**에서 그려져 셸이 액자로 보였는데, 그때 셸은 `bg-page`
 *  라서 실제 업무 화면 바닥색과 **완전히 같았다**(대비 1.000, 값으로 확인) — 액자가 아예 안 보이고
 *  「카드 테두리만 사라지고 사방 8px 작아진 흰 상자」가 됐다.
 *  테두리+층 그림자는 CLAUDE.md 「카드 외곽 표준」이 이미 요구하는 것이라 새 값을 지어낸 것이 아니다.
 *
 * ★같은 날 2차 리뷰에서 셸을 `bg-page` → **`bg-gray`(#E6EFFC)** 로 한 단 내렸다.
 *  셸이 바닥과 같은 색이면 액자가 오로지 테두리 하나에만 매달리고, 흰 코어와의 차이도 1.086 이라
 *  이 저장소가 실측한 「1.05~1.15 = 눈으로 구분 안 되는 대역」 안이었다.
 *  지금은 바닥과 1.07, 흰 코어와 1.16 — 테두리(1.39)·그림자와 함께 액자가 세 겹으로 읽힌다.
 *
 * ★`className` 은 **바깥 셸**에 붙는다 — 카드의 자리·크기(위치·칸 차지·최소 높이)를 정하는 곳이라서다.
 *  그래서 아래 셋은 그냥 두면 뜻이 어긋난다. 쓰는 쪽에서 이렇게 푼다:
 *   ① 여백·배경·테두리를 강제로 덮어쓰던 자리(`!p-0`·`!bg-…`) → **`variant="plain"`** 으로 명시한다.
 *      겹이 둘이라 그 조작이 바깥 액자에 걸려, 「빨간 경고 카드」가 「빨간 액자 안 흰 카드」가 된다.
 *      달력 칸·모달 판처럼 「카드처럼 보이면 안 되는 것」도 여기에 해당한다.
 *   ② 자식 사이 간격(`space-y-*`) → 셸의 자식은 코어 하나뿐이라 **아무 일도 안 한다.**
 *      그 클래스는 내용물을 감싸는 상자로 옮긴다.
 *   ③ 테두리를 건드리는 hover(`hover:border-…`) → 셸엔 테두리가 없어 안 보인다. 바탕색 hover 로 바꾼다.
 *
 * 겉옷 두 가지는 이 부품이 미리 맞춰 둔다:
 *   · 셸을 세로 flex 로 두고 코어에 `flex-1` — `min-h-*`·`h-full` 을 주면 흰 코어가 따라 늘어난다.
 *   · 코어에 `relative` — 카드 안에서 `absolute` 로 띄운 것(수정 점 등)이 **흰 코어** 기준으로 붙는다
 *     (안 그러면 회색 액자 모서리로 8px 밀려난다).
 *
 * ★`padding="none"` 은 2026-08-28 신설 — **내용이 카드 끝까지 닿아야 하는 카드**용
 *  (머리에 색 띠를 두른 카드, 칸이 가장자리까지 가는 표).
 *
 *  왜 필요했나: 이 저장소의 화면들은 구역을 「머리줄(색 띠 + 아래 선)」로 가른다 —
 *  전역 [UI-CRAFT] 가 「색만으로 구역을 나누지 마라, 구분은 머리줄이 한다」고 못 박은 그 모양이다.
 *  그런데 이중 베젤의 흰 코어엔 여백(p-4~p-8)이 붙어 있어, 그 띠가 카드 안쪽으로 밀려
 *  **띠가 아니라 그냥 회색 상자**가 된다. 그래서 여백 없는 칸을 한 칸 둔다.
 *  (지금까지는 `variant="plain"` + `!p-0` 로 우회했다 — `calendar/page.tsx:649` 가 그 자국이다.
 *   그 우회는 액자를 통째로 버려야 해서, 띠를 쓰는 화면은 이중 베젤을 못 쓰는 상태였다.)
 *
 *  ★`clip={false}` 로 그 자르기를 끌 수 있다 — **카드 안에 화면을 따라다니는 것(sticky)이 있을 때**다.
 *   `overflow:hidden` 은 스크롤 상자를 만들되 스크롤이 안 되므로, 그 안의 sticky 는 **영영 안 붙는다.**
 *   광고 관리의 소재 기획 카드가 그 자리다 — 되돌리기 알림·비교 담기 띠·상태 고르기 막대 셋이
 *   화면을 따라다녀야 하는데, 자르면 목록 맨 끝에 눌러앉아 6초 뒤 사라지는 되돌리기 단추를
 *   한 번도 못 보게 된다(2026-08-23 적대적 검증이 이미 한 번 막았던 것을 2026-08-28 에 다시 깰 뻔했다).
 *
 *  ★이 칸일 때만 코어에 `overflow-hidden` 을 준다. 여백이 0 이면 내용이 코어의 16px 둥근 모서리를
 *  덮으므로, 안 자르면 띠·표의 **네모난 모서리가 액자 위로 삐져나온다**(띠 색이 액자 색과 같아
 *  「띠가 액자로 새는」 모양이 된다). 다른 여백 칸에는 주지 않는다 — 카드 안에서 밖으로 띄우는
 *  것(메뉴·말풍선)을 잘라 버리기 때문이다.
 * 2026-08-23 확정 회차에서 숫자 카드(StatCard)는 이중 베젤에서 빠져나와 「아이콘 타일」이 됐다 —
 * 즉 **이중 베젤 = 일반 카드**, 아이콘 타일 = 숫자 카드로 역할이 맞바뀌었다.
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "bezel" | "plain";
  /** 여백 0 카드에서 내용을 둥근 모서리에 맞춰 자를지. 안에 sticky 가 있으면 false. */
  clip?: boolean;
}

export function Card({
  className,
  padding = "md",
  variant = "bezel",
  clip = true,
  children,
  ...props
}: CardProps) {
  const paddingStyles = {
    none: "p-0",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  if (variant === "plain") {
    return (
      <div
        className={cn(
          "rounded-[16px] border border-wedly-bd bg-white",
          paddingStyles[padding],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-[20px] border border-wedly-bd bg-wedly-bg-gray p-2",
        "shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative flex-1 rounded-[16px] bg-white shadow-sm",
          // 여백 0 일 때만 자른다 — 위 주석의 이유. 다른 칸에서 자르면 메뉴·말풍선이 잘린다.
          padding === "none" && clip && "overflow-hidden",
          paddingStyles[padding],
        )}
      >
        {children}
      </div>
    </div>
  );
}
