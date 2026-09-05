"use client";

// 위들리 서식 미리보기 — **서버가 그린 HTML** 을 iframe 에 그대로 띄운다.
// ★렌더러는 서버 한 곳이다(설계서 §4-5). 화면이 서식을 따로 그리면 실제 나가는 메일과 달라진다.
// ★sandbox 에 allow-scripts 를 주지 않는다 — 안에서 아무 스크립트도 못 돈다.
//  allow-same-origin 만 켜는 이유는 높이를 재기 위해서다(스크립트가 못 도니 부모를 건드릴 수 없다).

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton, StatusBox } from "@wedly/ui-shared/ui";
import { cn } from "../ui/cn";

/** 컴퓨터 600 · 휴대폰 375 — 시안 `.pv` / `.pv.mobile` 과 같은 폭. */
export const PREVIEW_WIDTH = { desktop: 600, mobile: 375 } as const;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 2400;

export function EmailPreview({
  html,
  device,
  loading,
  error,
}: {
  html: string;
  device: "desktop" | "mobile";
  loading: boolean;
  error: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return; // 못 재면 지금 높이를 그대로 둔다 — 0 으로 만들지 않는다
    const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
    if (h > 0) setHeight(Math.min(Math.max(h + 8, MIN_HEIGHT), MAX_HEIGHT));
  }, []);

  // 글꼴·그림이 늦게 오면 높이가 자란다 — 그린 직후 한 번 더 잰다.
  useEffect(() => {
    if (!html) return;
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [html, measure]);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex justify-center rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4",
          "transition-[padding] duration-200 ease-out",
        )}
      >
        {html ? (
          <iframe
            ref={frameRef}
            title="위들리 서식 미리보기"
            srcDoc={html}
            sandbox="allow-same-origin"
            onLoad={measure}
            style={{ height, maxWidth: PREVIEW_WIDTH[device] }}
            className={cn(
              "w-full rounded-xl border border-wedly-bd bg-white shadow-sm",
              "transition-[max-width] duration-200 ease-out",
            )}
          />
        ) : loading ? (
          <div
            className="w-full max-w-[600px] rounded-xl border border-wedly-bd bg-white p-5"
            aria-busy="true"
            aria-live="polite"
          >
            <Skeleton variant="line" className="mb-3 w-2/3" />
            <Skeleton variant="line" className="mb-2" />
            <Skeleton variant="line" className="mb-2 w-5/6" />
            <Skeleton variant="line" className="w-3/5" />
          </div>
        ) : (
          <div className="w-full max-w-[600px] rounded-xl border border-wedly-bd bg-white p-6 text-center">
            <p className="text-wedly-sub text-wedly-muted break-keep">
              왼쪽 칸에 내용을 적으면 여기에 위들리 서식이 나와요.
            </p>
          </div>
        )}
      </div>
      {error && (
        <StatusBox tone="error" title="미리보기를 불러오지 못했어요">
          {error}
        </StatusBox>
      )}
    </div>
  );
}
