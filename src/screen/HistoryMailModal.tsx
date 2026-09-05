"use client";

// 발송 기록 「서식 보기」 — 그 사람에게 **실제로 나간 본문**을 그대로 띄우는 모달.
//
// ★서식은 화면이 다시 그리지 않는다 — 서버가 보관해 둔 HTML 을 iframe 에 그대로 얹는다
//  (2단계 미리보기와 같은 부품·같은 잠금: 스크립트가 안 도는 sandbox).
// ★네 갈래를 전부 그린다 — 불러오는 중 / 서식 / 보관 기간 지남 / 오류. 어느 갈래에도
//  「없음」을 성공처럼 보이게 두지 않고, 다음에 무엇을 할 수 있는지 한 줄로 적는다.

import { Skeleton, StatusBox } from "@wedly/ui-shared/ui";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { EmailPreview } from "./EmailPreview";
import {
  MAIL_EMPTY_HINT,
  MAIL_EMPTY_TITLE,
  MAIL_EXPIRED_HINT,
  MAIL_EXPIRED_TITLE,
  companyMetaLine,
  mailModalTitle,
  type HistoryMailState,
} from "./history-helpers";

/** 불러오는 동안 — 실제 서식이 설 자리와 같은 폭·같은 상자로 자리를 지킨다. */
function MailSkeleton() {
  return (
    <div
      className="flex justify-center rounded-2xl border border-wedly-bd bg-wedly-bg-gray p-4"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-[600px] rounded-xl border border-wedly-bd bg-white p-5">
        <Skeleton variant="line" className="mb-4 w-2/5" />
        <Skeleton variant="line" className="mb-2" />
        <Skeleton variant="line" className="mb-2 w-5/6" />
        <Skeleton variant="line" className="mb-4 w-3/5" />
        <Skeleton variant="block" />
      </div>
    </div>
  );
}

export function HistoryMailModal({
  mail,
  onClose,
  onRetry,
}: {
  /** `null` 이면 닫힘. */
  mail: HistoryMailState | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal
      open={!!mail}
      onClose={onClose}
      title={mailModalTitle(mail?.subject)}
      // 누가 받은 서식인지 제목 밑에 밝힌다 — 표에서 어느 줄을 눌렀는지 모달 안에서도 알아야 한다.
      description={mail ? companyMetaLine(mail) : undefined}
      widthClass="max-w-3xl"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      }
    >
      {mail ? (
        mail.error ? (
          <StatusBox
            tone="error"
            title="서식을 불러오지 못했어요"
            actions={
              <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                다시 시도
              </Button>
            }
          >
            <span className="break-keep">{mail.error}</span>
          </StatusBox>
        ) : mail.expired ? (
          <StatusBox tone="info" title={MAIL_EXPIRED_TITLE}>
            <span className="break-keep">{MAIL_EXPIRED_HINT}</span>
          </StatusBox>
        ) : mail.loading ? (
          <MailSkeleton />
        ) : mail.html ? (
          // 폭 600 = 메일 프로그램이 실제로 그리는 폭. 모달 안에서도 같은 폭으로 본다.
          <EmailPreview html={mail.html} device="desktop" loading={false} error="" />
        ) : (
          <StatusBox tone="info" title={MAIL_EMPTY_TITLE}>
            <span className="break-keep">{MAIL_EMPTY_HINT}</span>
          </StatusBox>
        )
      ) : null}
    </Modal>
  );
}
