import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emailChecklist } from "../step3-helpers";
import type { Progress, RecipientRow } from "../useBulkState";
import { Step3Confirm, type Step3ConfirmProps } from "./Step3Confirm";

// 3단계를 **실제로 그려서** 잰다 — 시안(2026-09-04-email-send-preview.html §3단계)의 자리·문구가
// 살아 있는지, 그리고 알림톡·채팅 전용 발송이 예전 그대로인지 소스 글자 검사보다 강하게 확인한다.

const okChecks = emailChecklist({
  channel: "email",
  subject: "장려금 2차 서류 제출 안내",
  preheader: "4대보험 완납증명서 2종",
  fillMarkers: [],
  fillValues: {},
  factLock: { missing: [], added: [], ok: true },
  adSentences: [],
  attachments: [],
});
const badChecks = emailChecklist({
  channel: "email",
  subject: "무료 상담 안내",
  preheader: "",
  fillMarkers: [],
  fillValues: {},
  factLock: { missing: [], added: [], ok: true },
  adSentences: [],
  attachments: [],
});

function row(over: Partial<RecipientRow> = {}): RecipientRow {
  return {
    companyName: "(주)한빛정밀",
    representative: "김대표",
    phone: "010-2•••-4567",
    error: "",
    status: "sent",
    alimtalkStatus: "sent",
    viewedAt: null,
    ...over,
  };
}

function progress(over: Partial<Progress> = {}): Progress {
  return {
    status: "done",
    total: 3,
    sent: 0,
    failed: 0,
    error: "",
    stalled: false,
    failedRows: [],
    recipients: [row()],
    channelChat: false,
    channelEmail: true,
    emailStatus: "running",
    emailSent: 1,
    emailFailed: 0,
    stopRequested: false,
    chatTotal: 0,
    emailTotal: 3,
    ...over,
  };
}

function props(over: Partial<Step3ConfirmProps> = {}): Step3ConfirmProps {
  return {
    restoredFromStore: false,
    selectedCount: 3,
    myName: "김민수",
    myEmail: "minsu.kim@wedly.kr",
    pricing: { alimtalkWon: 5, smsMaxWon: 28 },
    cost: { alimtalk: 15, smsMax: 84 },
    jobId: "",
    noticeCategory: "서류 준비 안내",
    setNoticeCategory: () => {},
    noticeCategoryOptions: [{ value: "서류 준비 안내", label: "서류 준비 안내" }],
    tooMany: false,
    refundedInSelection: null,
    goStep: () => {},
    sendReady: true,
    loadingTargets: false,
    skipped: null,
    progress: null,
    pending: 0,
    blockedCount: 0,
    sendOutOfScopeCount: 0,
    pollError: "",
    canResume: false,
    resume: () => {},
    alimtalkFailedCount: 0,
    confirmOpen: false,
    setConfirmOpen: () => {},
    sending: false,
    send: () => {},
    channel: "email",
    pickedTotals: { total: 3, email: 3 },
    emailSubject: "장려금 2차 서류 제출 안내",
    emailAttachments: [{ uploadId: "u1", fileName: "임금대장_양식.xlsx", bytes: 12345 }],
    emailChecks: okChecks,
    emailChecksFailed: 0,
    sendWarnings: [],
    sendProgress: { done: 0, total: 3 },
    remaining: 3,
    stopAllowed: false,
    stopOpen: false,
    setStopOpen: () => {},
    stopping: false,
    stopJob: () => {},
    sendStartedAt: null,
    sendFinishedAt: null,
    ...over,
  };
}

const html = (over: Partial<Step3ConfirmProps> = {}) => renderToStaticMarkup(<Step3Confirm {...props(over)} />);

describe("3단계 이메일 — 시안의 자리가 다 있다", () => {
  const markup = html();

  it("발송 전 점검 카드에 아홉 줄이 그대로 있다", () => {
    expect(markup).toContain("발송 전 점검");
    expect(markup).toContain("9건 모두 통과");
    for (const label of okChecks.map((c) => c.label)) {
      expect(markup, `점검 항목 「${label}」`).toContain(label);
    }
  });

  it("요약 kv 일곱 줄 — 시안의 라벨 그대로", () => {
    for (const k of ["받는 사람", "보내는 이름", "회신 주소", "제목", "안내 종류", "첨부", "예상 비용"]) {
      expect(markup, `요약 칸 「${k}」`).toContain(`>${k}<`);
    }
  });

  it("보내는 이름은 담당자 이름 + 고정 발신 주소, 회신은 담당자 메일", () => {
    expect(markup).toContain("WEDLY 김민수 &lt;consulting@wedly.kr&gt;");
    expect(markup).toContain("발신 주소는 고정, 이름만 담당자");
    expect(markup).toContain("minsu.kim@wedly.kr");
  });

  it("제목 앞에 [WEDLY] 칩이 고정으로 붙는다", () => {
    expect(markup).toContain("[WEDLY]");
    expect(markup).toContain("장려금 2차 서류 제출 안내");
  });

  it("안내 종류는 고정이고 수신 설정 링크가 자동으로 붙는다고 적는다", () => {
    expect(markup).toContain("정보성 안내(고정)");
    expect(markup).toContain("수신 설정 링크가 자동으로 붙어요");
  });

  it("첨부는 파일 이름과 보관함 링크 기한을 함께 적는다", () => {
    expect(markup).toContain("임금대장_양식.xlsx");
    expect(markup).toContain("보관함 링크(14일)");
  });

  it("★이메일만 보낼 때는 알림톡·문자 금액을 안 그린다 — 안 무는 돈이 보이면 안 된다", () => {
    expect(markup).toContain("Resend 월 한도 안");
    expect(markup).not.toContain("카카오 알림톡");
    expect(markup).not.toContain("건당 최대 28원");
    // 알림톡 문안의 칸인 「안내 내용」 고르개도 이메일 전용 발송에는 없다
    expect(markup).not.toContain('id="bm-notice-category"');
  });

  it("「둘 다」면 이메일·알림톡·문자 세 줄과 안내 내용 고르개가 함께 있다", () => {
    const both = html({ channel: "both" });
    expect(both).toContain("Resend 월 한도 안");
    expect(both).toContain("카카오 알림톡");
    expect(both).toContain("건당 최대 28원");
    expect(both).toContain('id="bm-notice-category"');
    // 받는 사람 줄이 두 통로를 함께 말한다
    expect(both).toContain("명 (이메일)");
    expect(both).toContain("알림톡 ");
  });
});

describe("3단계 보내기 잠금", () => {
  it("점검을 다 통과하면 「보내기」가 열리고 통과 안내가 뜬다", () => {
    const markup = html();
    expect(markup).toContain("모두 통과 — 보내기를 누르면 바로 나갑니다");
    expect(markup).not.toContain("disabled=\"\"><svg");
  });

  it("★빨간 항목이 있으면 보내기가 잠기고, 줄마다 「2단계에서 고치기 ›」가 선다", () => {
    const markup = html({ emailChecks: badChecks, emailChecksFailed: 2, sendReady: false });
    expect(markup).toContain("미통과 2건 — 고치면 보내기가 열려요");
    expect((markup.match(/2단계에서 고치기 ›/g) ?? []).length).toBe(2);
    // 통과/미통과를 색만으로 알리지 않는다 — 읽어 주는 도구에도 말이 남는다
    expect(markup).toContain(">미통과</span>");
    expect(markup).toContain(">통과</span>");
  });
});

describe("3단계 발송 현황 — 이메일", () => {
  const markup = html({
    jobId: "job_1",
    progress: progress(),
    sendProgress: { done: 1, total: 3 },
    remaining: 2,
    stopAllowed: true,
    sendStartedAt: new Date("2026-09-05T01:12:03Z"),
  });

  it("보낸 사람과 시작 시각이 머리에 있다", () => {
    expect(markup).toContain("발송 현황");
    expect(markup).toContain("보낸 사람 김민수");
    expect(markup).toContain("시작 ");
  });

  it("★이메일 작업은 status 가 done 이어도 「보내는 중」으로 읽는다", () => {
    expect(markup).toContain("보내는 중이에요");
    expect(markup).not.toContain("발송이 끝났어요");
  });

  it("진행 막대는 이메일 칸으로 센다 — 1 / 3명", () => {
    expect(markup).toContain("1 / 3명");
    expect(markup).toContain("이메일 보냄 1");
    expect(markup).toContain("이메일 실패 0");
    expect(markup).toContain("남음 2");
  });

  it("「발송 중단」 단추와 신호 설명 줄이 있다", () => {
    expect(markup).toContain("발송 중단");
    expect(markup).toContain("메일 안 링크·버튼을 눌렀어요");
    expect(markup).toContain("받는 서버까지 갔어요");
    expect(markup).toContain("못 갔거나 받지 않겠다고 했어요");
    // 픽셀 추적을 안 쓰기로 했으므로 시안의 열람·자동 검사 등급은 그리지 않는다
    expect(markup).not.toContain("열람 신호");
    expect(markup).not.toContain("자동 검사 추정");
  });

  it("표에 이메일·이메일 신호 열이 서고, 안 쓰는 알림톡 열은 안 선다", () => {
    expect(markup).toContain(">이메일</th>");
    expect(markup).toContain(">이메일 신호</th>");
    expect(markup).not.toContain(">알림 상태</th>");
    expect(markup).not.toContain(">연락처</th>");
  });

  it("신호 딱지와 「직접 입력」 칩, 실패 이유가 줄에 그려진다", () => {
    const one = html({
      jobId: "job_1",
      progress: progress({
        recipients: [
          row({
            email: "ho***@wedly.kr",
            emailSource: "manual",
            emailStatus: "bounced",
            emailError: "수신 서버가 되돌림",
            emailSentAt: "2026-09-05T01:12:05Z",
          }),
        ],
      }),
    });
    expect(one).toContain("ho***@wedly.kr");
    expect(one).toContain("직접 입력");
    expect(one).toContain(">반송<");
    expect(one).toContain("수신 서버가 되돌림");
  });

  it("제외된 줄은 사유가 딱지에도 실패 이유 칸에도 그대로 보인다", () => {
    const one = html({
      jobId: "job_1",
      progress: progress({
        recipients: [row({ email: "", emailStatus: "skipped", emailSkipReason: "수신거부 확인 불가" })],
      }),
    });
    expect((one.match(/수신거부 확인 불가/g) ?? []).length).toBe(2);
  });

  it("중단을 누른 뒤에는 그 사실을 상자로 알린다", () => {
    const stopped = html({ jobId: "job_1", progress: progress({ stopRequested: true, emailStatus: "done" }) });
    expect(stopped).toContain("발송을 중단했어요");
    expect(stopped).toContain("아직 안 나간 메일은 나가지 않습니다");
  });

  it("발송은 됐지만 알려 둘 일은 조용히 버리지 않는다", () => {
    const warned = html({ jobId: "job_1", progress: progress(), sendWarnings: ["직접 입력한 주소 1건을 고객 자료에 저장하지 못했어요"] });
    expect(warned).toContain("발송은 됐지만 알려 드릴 일이 있어요");
    expect(warned).toContain("직접 입력한 주소 1건을 고객 자료에 저장하지 못했어요");
  });
});

describe("★알림톡·채팅 전용 발송은 예전 그대로다(회귀 0)", () => {
  const markup = html({ channel: "chat" });

  it("점검 카드·이메일 요약이 아예 안 뜬다", () => {
    expect(markup).not.toContain("발송 전 점검");
    expect(markup).not.toContain("회신 주소");
    expect(markup).not.toContain("Resend 월 한도 안");
  });

  it("기존 요약 다섯 줄과 발송 단추 문구가 그대로다", () => {
    for (const k of ["받는 사람", "보내는 이름", "고객이 받는 방법", "답장 오면", "예상 비용"]) {
      expect(markup, `요약 칸 「${k}」`).toContain(`>${k}<`);
    }
    expect(markup).toContain("위들리 ");
    expect(markup).toContain("채널톡 공식 채널");
    expect(markup).toContain("3명에게 발송하기");
    expect(markup).toContain("발송 중에는 진행률이 표시되고, 실패한 분은 따로 모아 보여줍니다");
  });

  it("★채팅 전용 작업에는 「발송 중단」을 안 그린다 — 채팅 러너는 중단 표식을 안 읽는다", () => {
    const running = html({
      channel: "chat",
      jobId: "job_1",
      progress: progress({ status: "running", channelChat: true, channelEmail: false, emailStatus: "", sent: 2, failed: 0, chatTotal: 3, emailTotal: null }),
      sendProgress: { done: 2, total: 3 },
      remaining: 1,
    });
    expect(running).not.toContain("발송 중단");
    expect(running).toContain("보내는 중이에요");
    expect(running).toContain("2 / 3명");
    expect(running).toContain("보냄 2");
    expect(running).toContain(">알림 상태</th>");
    expect(running).not.toContain(">이메일 신호</th>");
  });
});

describe("확인 모달 — 브라우저 confirm 을 쓰지 않는다", () => {
  it("보내기 확인은 이메일 인원과 0원을 적는다", () => {
    const markup = html({ confirmOpen: true });
    expect(markup).toContain("정말 보낼까요?");
    expect(markup).toContain("이메일 3명");
    expect(markup).toContain("이메일 0원 (Resend 월 한도 안)");
  });

  it("발송 중단 확인은 이미 나간 분과 남은 분을 갈라 말한다", () => {
    const markup = html({
      jobId: "job_1",
      progress: progress(),
      stopOpen: true,
      sendProgress: { done: 1, total: 3 },
      remaining: 2,
    });
    expect(markup).toContain("발송을 중단할까요?");
    expect(markup).toContain("지금까지 나간 1명분은 그대로 갑니다");
    expect(markup).toContain("남은 2명에게는 보내지 않아요");
    expect(markup).toContain("계속 보내기");
  });
});
