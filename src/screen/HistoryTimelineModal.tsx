"use client";

// 수신자 「기록」 — 그 사람에게 찍힌 이메일 신호를 **시간순으로** 펼치는 모달.
// 시각 계약(정본): docs/superpowers/specs/2026-09-07-email-stage2-preview.html §타임라인
//   세로 선 + 아이콘 타일 + 제목 + 설명 + 시각.
//
// ★골격은 「서식 보기」 모달(HistoryMailModal)과 같다 — 같은 표에서 나란히 열리는 두 모달이
//  다른 모양이면 담당자는 다른 기능으로 읽는다.
// ★네 갈래를 전부 그린다 — 불러오는 중 / 빈 기록 / 오류 / 목록. 어느 갈래에도 「없음」을
//  성공처럼 보이게 두지 않고, 다음에 무엇을 할 수 있는지 한 줄로 적는다.
// ★글자는 서버가 정본이다(title·detail) — 화면은 색·아이콘·자리만 정한다.

import {
  BellOff,
  CheckCheck,
  Clock,
  Eye,
  MailX,
  MessageCircle,
  Paperclip,
  PencilLine,
  Send,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Skeleton, StatusBox } from "@wedly/ui-shared/ui";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { cn } from "../ui/cn";
import {
  TIMELINE_EMPTY_HINT,
  TIMELINE_EMPTY_TITLE,
  TIMELINE_ERROR_TITLE,
  TIMELINE_VIEWED_NOTE,
  formatHistoryTime,
  formatTimelineTime,
  timelineAddressLine,
  timelineModalTitle,
  timelineTone,
  type HistoryTimelineItem,
  type HistoryTimelineState,
  type TimelineTone,
} from "./history-helpers";

/** 타일 바탕 — 의미색 채움 + 흰 글리프(상태 박스 v3 의 아이콘 타일과 같은 규격). */
const TONE_TILE: Record<TimelineTone, string> = {
  blue: "bg-wedly-accent",
  green: "bg-wedly-green",
  red: "bg-wedly-red",
  purple: "bg-wedly-purple",
  muted: "bg-wedly-t2",
};

/**
 * 갈래마다 **뜻이 있는 모양**을 준다 — 색만으로는 나란히 선 항목이 안 갈린다(WEDLY 옅은 색
 * 대비 실측 1.05~1.15). 모르는 갈래는 시계(「언제 있었던 일」)로 두고 죽지 않는다.
 */
function timelineIcon(kind: string): LucideIcon {
  switch (String(kind ?? "").trim()) {
    case "sent":
      return Send;
    case "delivered":
      return CheckCheck;
    case "viewed":
      return Eye;
    case "attachment":
      return Paperclip;
    case "chat_viewed":
      return MessageCircle;
    case "bounced":
      return MailX;
    case "failed":
      return XCircle;
    case "complained":
      return ShieldAlert;
    case "unsubscribed":
      return BellOff;
    case "manual_email_entered":
      return PencilLine;
    default:
      return Clock;
  }
}

/** 불러오는 동안 — 실제 항목이 설 자리와 같은 모양으로 자리를 지킨다. */
function TimelineSkeleton() {
  return (
    <div className="space-y-3.5" aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton variant="block" className="h-6 w-6 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton variant="line" className="mb-1.5 h-3 w-1/4" />
            <Skeleton variant="line" className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 머리 카드 한 줄 — 라벨(회색) + 값. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-wedly-hint text-wedly-muted break-keep">{label}</dt>
      <dd className="m-0 min-w-0 text-wedly-hint text-wedly-t1 break-keep">{value || "—"}</dd>
    </>
  );
}

/** 항목 한 줄 — 타일·제목·설명·시각. */
function TimelineRow({ item }: { item: HistoryTimelineItem }) {
  const Icon = timelineIcon(item.kind);
  return (
    <li className="relative pb-3.5 pl-[34px] last:pb-0">
      <span
        className={cn(
          "absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center rounded-lg",
          TONE_TILE[timelineTone(item.kind)],
        )}
      >
        <Icon className="h-3.5 w-3.5 text-white" aria-hidden />
      </span>
      <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{item.title || "—"}</p>
      {item.detail ? (
        <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{item.detail}</p>
      ) : null}
      <time className="mt-0.5 block text-wedly-label text-wedly-muted tabular-nums">
        {formatTimelineTime(item.at)}
      </time>
    </li>
  );
}

export function HistoryTimelineModal({
  timeline,
  onClose,
  onRetry,
}: {
  /** `null` 이면 닫힘. */
  timeline: HistoryTimelineState | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal
      open={!!timeline}
      onClose={onClose}
      title={timelineModalTitle(timeline?.companyName)}
      widthClass="max-w-xl"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      }
    >
      {timeline ? (
        <div className="space-y-3.5">
          {/* 누구에게 간 안내인지 — 표에서 어느 줄을 눌렀는지 모달 안에서도 알아야 한다. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-wedly-bd/60 bg-wedly-bg-gray px-3 py-2.5">
            <MetaRow label="받는 주소" value={timelineAddressLine(timeline)} />
            <MetaRow label="안내" value={timeline.subject} />
            <MetaRow
              label="보낸 사람"
              value={[timeline.senderName, formatHistoryTime(timeline.jobCreatedAt)]
                .filter((v) => v && v !== "—")
                .join(" · ")}
            />
          </dl>

          {timeline.error ? (
            <StatusBox
              tone="error"
              title={TIMELINE_ERROR_TITLE}
              actions={
                <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                  다시 시도
                </Button>
              }
            >
              <span className="break-keep">{timeline.error}</span>
            </StatusBox>
          ) : timeline.loading ? (
            <TimelineSkeleton />
          ) : timeline.items.length === 0 ? (
            <StatusBox tone="info" title={TIMELINE_EMPTY_TITLE}>
              <span className="break-keep">{TIMELINE_EMPTY_HINT}</span>
            </StatusBox>
          ) : (
            <>
              {/* 세로 선은 가상 요소가 아니라 실제 조각으로 그린다 — 꾸러미를 무는 앱마다
                  Tailwind 훑는 범위가 달라, 가상 요소 유틸리티는 조용히 빠질 수 있다. */}
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute bottom-1.5 left-[11px] top-1.5 w-0.5 rounded-full bg-wedly-bd"
                />
                <ol className="relative m-0 list-none p-0">
                  {timeline.items.map((it, i) => (
                    <TimelineRow key={`${it.at}-${it.kind}-${i}`} item={it} />
                  ))}
                </ol>
              </div>
              <p className="rounded-xl bg-wedly-bg-blue px-3 py-2.5 text-wedly-hint text-wedly-t1 break-keep">
                {TIMELINE_VIEWED_NOTE}
              </p>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
