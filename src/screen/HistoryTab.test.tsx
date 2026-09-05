import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryTab, type HistoryTabProps } from "./HistoryTab";
import type {
  HistoryCompanyDetail,
  HistoryCompanyItem,
  HistoryCompanyRow,
  HistoryJobRecipient,
  HistoryJobRow,
  HistoryMailState,
} from "./history-helpers";

// 발송 기록 탭을 **실제로 그려서** 잰다 — 시안(2026-09-04-email-send-preview.html 「발송 기록」)의
// 자리·문구가 살아 있는지, 그리고 안 쓴 통로에 「0」이 서지 않는지 소스 글자 검사보다 강하게 본다.

function job(over: Partial<HistoryJobRow> = {}): HistoryJobRow {
  return {
    id: "j1",
    createdAt: "2026-09-04T01:12:00.000Z",
    finishedAt: null,
    senderName: "김민수",
    senderEmail: "minsu@wedly.kr",
    sourceApp: "erp",
    channel: "email",
    title: "장려금 2차 서류 제출 안내",
    status: "done",
    total: 31,
    sent: 0,
    chatViewed: 0,
    emailSent: 30,
    delivered: 30,
    viewed: 12,
    bounced: 1,
    ...over,
  };
}

function companyRow(over: Partial<HistoryCompanyRow> = {}): HistoryCompanyRow {
  return {
    key: "b:1234567890",
    companyName: "(주)한빛정밀",
    representative: "김대표",
    phone: "010-2•••-4567",
    email: "ha***@hanbit.kr",
    count: 3,
    lastReceivedAt: "2026-09-04T01:43:00.000Z",
    lastSignal: "확인함",
    ...over,
  };
}

function recipient(over: Partial<HistoryJobRecipient> = {}): HistoryJobRecipient {
  return {
    id: "r1",
    companyName: "(주)한빛정밀",
    representative: "김대표",
    phone: "010-2•••-4567",
    email: "ha***@hanbit.kr",
    companyKey: "b:1234567890",
    chatSignal: "",
    emailSignal: "도착",
    viewedAt: null,
    emailSentAt: "2026-09-04T01:12:00.000Z",
    emailDeliveredAt: "2026-09-04T01:13:00.000Z",
    emailViewedAt: null,
    hasMail: true,
    ...over,
  };
}

function companyItem(over: Partial<HistoryCompanyItem> = {}): HistoryCompanyItem {
  return {
    jobId: "j1",
    createdAt: "2026-09-04T01:43:00.000Z",
    title: "장려금 2차 서류 제출 안내",
    channel: "email",
    senderName: "김민수",
    emailSignal: "확인함",
    chatSignal: "",
    emailSource: "basic",
    emailError: "",
    status: "sent",
    error: "",
    recipientId: "cr1",
    hasMail: true,
    ...over,
  };
}

function mailState(over: Partial<HistoryMailState> = {}): HistoryMailState {
  return {
    recipientId: "r1",
    companyName: "(주)한빛정밀",
    representative: "김대표",
    phone: "010-2•••-4567",
    email: "ha***@hanbit.kr",
    subject: "장려금 2차 서류 제출 안내",
    html: "",
    loading: false,
    error: "",
    expired: false,
    ...over,
  };
}

function props(over: Partial<HistoryTabProps> = {}): HistoryTabProps {
  return {
    mode: "jobs",
    setMode: () => {},
    q: "",
    setQ: () => {},
    loadedQ: "",
    loadedMode: "jobs",
    jobs: [job()],
    companies: [companyRow()],
    view: "list",
    job: null,
    jobRecipients: [],
    company: null,
    loading: false,
    error: "",
    openJob: () => {},
    openCompany: () => {},
    closeDetail: () => {},
    retry: () => {},
    mail: null,
    openMail: () => {},
    openCompanyMail: () => {},
    closeMail: () => {},
    retryMail: () => {},
    ...over,
  };
}

const draw = (over: Partial<HistoryTabProps> = {}) => renderToStaticMarkup(<HistoryTab {...props(over)} />);

describe("머리·구간 단추·검색창", () => {
  const html = draw();

  it("머리와 설명이 시안 그대로다", () => {
    expect(html).toContain("발송 기록");
    expect(html).toContain("발송별로도, 사업장별로도 봅니다");
  });

  it("구간 단추 두 개가 있고 발송별이 눌려 있다", () => {
    expect(html).toContain('aria-label="어떻게 볼까요"');
    expect(html).toContain("발송별");
    expect(html).toContain("사업장별");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(1);
  });

  it("검색창 안내 문구가 시안 그대로다", () => {
    expect(html).toContain("회사명 · 대표자명 · 연락처 뒷자리 · 이메일 · 제목 · 보낸 사람으로 검색");
  });

  it("1단계 검색 칸과 같은 이유로 type=search 를 안 쓴다(지우개가 둘로 보인다)", () => {
    const tag = html.match(/<input[^>]*id="bm-hist-q"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('type="text"');
    expect(tag).not.toContain('type="search"');
    expect(tag).toContain('role="searchbox"');
  });

  it("검색어가 없으면 지우개도 없다", () => {
    expect(html).not.toContain('aria-label="검색어 지우기"');
    expect(draw({ q: "한빛" })).toContain('aria-label="검색어 지우기"');
  });

  it("건수는 지금 보는 보기의 것만 적는다", () => {
    expect(html).toContain("발송 1건");
    expect(html).not.toContain("사업장 1곳");
    expect(draw({ mode: "companies", loadedMode: "companies" })).toContain("사업장 1곳");
  });

  it("그 보기의 목록을 아직 안 읽었으면 건수를 안 적는다 — 「사업장 0곳」이 뜨면 안 된다", () => {
    // 배포본 실측(2026-09-06): 발송 상세에서 「이 회사의 다른 발송 ›」로 뛰면 보기만 사업장별로
    // 바뀌고 목록은 안 읽는다 — 그때 머리줄이 「사업장 0곳」이라고 거짓말했다.
    const jumped = draw({ mode: "companies", companies: [], view: "company", loadedMode: "jobs" });
    expect(jumped).not.toContain("사업장 0곳");
    // 아예 「N곳」이라는 건수 문구 자체가 없어야 한다(「사업장 목록으로」 단추 글자는 건수가 아니다)
    expect(jumped).not.toMatch(/사업장 [\d,]+곳/);
    // 옛 보기의 숫자를 대신 적지도 않는다
    expect(jumped).not.toContain("발송 1건");
    // 목록을 읽기 전 보기를 바꾼 순간(사업장별 · 아직 응답 전)도 같다
    expect(draw({ mode: "companies", companies: [], loadedMode: "jobs" })).not.toContain("사업장 0곳");
  });
});

describe("발송별 표", () => {
  it("시안의 열이 다 있다", () => {
    const html = draw();
    for (const th of ["보낸 시각", "보낸 사람", "채널", "제목 / 안내", "받는 사람", "도착", "확인", "열어 봄", "반송·거부", "앱"]) {
      expect(html, `열 「${th}」`).toContain(th);
    }
  });

  it("표 머리는 파랑이다(WEDLY 표 표준)", () => {
    expect(draw()).toContain("bg-wedly-accent");
  });

  it("이메일 발송 줄에는 이메일 숫자가, 채팅 숫자 자리에는 「—」가 선다", () => {
    // 안 쓴 통로에 「0」이 서면 「하나도 안 갔다」로 읽힌다.
    const html = draw({ jobs: [job({ channel: "email", delivered: 30, viewed: 12, chatViewed: 0 })] });
    expect(html).toContain(">30<");
    expect(html).toContain(">12<");
    expect(html).toContain("—");
  });

  it("알림톡 전용 발송에는 이메일 숫자를 안 그린다", () => {
    const html = draw({
      jobs: [job({ channel: "chat", title: "현장 점검 일정 안내", total: 42, chatViewed: 28, delivered: 0, viewed: 0, bounced: 0 })],
    });
    expect(html).toContain("알림톡·채팅");
    expect(html).toContain(">28<");
    // 도착·확인·반송 자리가 「0」이 아니라 「—」여야 한다
    expect(html).not.toContain(">0<");
  });

  it("줄이 눌리고 글쇠로도 열린다", () => {
    const html = draw();
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });

  it("응답이 온 뒤에는 서버 결과를 그대로 믿는다(화면이 다시 거르지 않는다)", () => {
    // 수신자 이름으로 걸린 발송은 목록 줄에 회사 이름이 없다 — 다시 거르면 맞는 결과가 사라진다.
    const html = draw({ q: "한빛정밀", loadedQ: "한빛정밀" });
    expect(html).toContain("장려금 2차 서류 제출 안내");
  });

  it("응답 전에는 옛 목록을 스스로 좁힌다", () => {
    const html = draw({ q: "없는말", loadedQ: "" });
    expect(html).not.toContain("장려금 2차 서류 제출 안내");
    expect(html).toContain("검색어와 맞는 기록이 없어요");
  });
});

describe("빈 상태·불러오는 중·오류", () => {
  it("빈 상태는 한 줄 + 다음 행동을 함께 그린다", () => {
    const html = draw({ jobs: [] });
    expect(html).toContain("아직 보낸 안내가 없어요");
    expect(html).toContain("발송하기");
  });

  it("불러오는 동안 자리지킴을 그린다(표 칸이 안 흔들리게)", () => {
    const html = draw({ jobs: [], loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
    // 아직 결과가 없는데 「없어요」로 단정하지 않는다
    expect(html).not.toContain("아직 보낸 안내가 없어요");
  });

  it("오류는 한 줄로 뜨고 다시 시도가 붙는다", () => {
    const html = draw({ error: "발송 기록을 불러오지 못했어요: 잠시 후 다시 시도해 주세요." });
    expect(html).toContain("기록을 불러오지 못했어요");
    expect(html).toContain("다시 시도");
  });
});

describe("사업장별 표", () => {
  const html = draw({ mode: "companies" });

  it("시안의 열이 다 있다", () => {
    for (const th of ["회사명", "대표명", "연락처", "이메일", "받은 안내", "마지막 수신", "마지막 신호"]) {
      expect(html, `열 「${th}」`).toContain(th);
    }
  });

  it("가려진 연락처·주소를 서버 값 그대로 그린다", () => {
    expect(html).toContain("010-2•••-4567");
    expect(html).toContain("ha***@hanbit.kr");
  });

  it("마지막 신호는 딱지로 그린다", () => {
    expect(html).toContain("확인함");
  });
});

describe("발송 상세", () => {
  const html = draw({
    view: "job",
    job: job(),
    jobRecipients: [
      recipient(),
      recipient({ id: "r2", companyName: "미래테크(주)", emailSignal: "반송·거부", companyKey: "b:2222222222" }),
    ],
  });

  it("머리 카드에 제목·시각·보낸 사람·통로·인원·앱이 있다", () => {
    expect(html).toContain("장려금 2차 서류 제출 안내");
    expect(html).toContain("김민수");
    expect(html).toContain("받는 사람 31명");
  });

  it("「엑셀로 받기」 준비 중 표시는 없다 — 눌러도 안 되는 자리를 배포본에 두지 않는다", () => {
    expect(html).not.toContain("엑셀로 받기");
    expect(html).not.toContain("준비 중");
  });

  it("수신자 표에 신호와 마지막 신호 시각이 있다", () => {
    expect(html).toContain("도착");
    expect(html).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it("반송된 줄은 빨간 딱지로 선다", () => {
    expect(html).toContain("반송");
    expect(html).toContain("bg-wedly-red");
  });

  it("줄마다 「서식 보기」와 「이 회사의 다른 발송 ›」이 있다", () => {
    expect(html).toContain("서식 보기");
    expect(html).toContain("이 회사의 다른 발송 ›");
  });

  it("남의 발송도 열린다 — 「다른 담당자」 안내를 더는 그리지 않는다", () => {
    const other = draw({
      view: "job",
      job: job({ senderName: "이세훈", senderEmail: "sehun@wedly.kr" }),
      jobRecipients: [recipient()],
    });
    expect(other).toContain("(주)한빛정밀");
    expect(other).not.toContain("다른 담당자");
  });

  it("「서식 보기」는 남아 있는 줄에서만 눌린다", () => {
    const one = draw({ view: "job", job: job(), jobRecipients: [recipient({ hasMail: true })] });
    expect(one).toContain("서식 보기");
    const none = draw({ view: "job", job: job(), jobRecipients: [recipient({ hasMail: false })] });
    // 서식이 없는 줄의 단추만 잠긴다 — 이유는 표 밑 한 줄이 따로 밝힌다.
    expect((none.match(/disabled/g) ?? []).length).toBeGreaterThan((one.match(/disabled/g) ?? []).length);
  });

  it("「이 회사의 다른 발송」은 회사 열쇠가 있는 줄에서만 눌린다", () => {
    const keyed = draw({ view: "job", job: job(), jobRecipients: [recipient({ companyKey: "b:1234567890" })] });
    const keyless = draw({ view: "job", job: job(), jobRecipients: [recipient({ companyKey: "" })] });
    expect((keyless.match(/disabled/g) ?? []).length).toBeGreaterThan((keyed.match(/disabled/g) ?? []).length);
  });

  it("수신자별 열쇠가 없다는 옛 사유 줄은 사라졌다", () => {
    expect(html).not.toContain("수신자별 열쇠");
  });

  it("「목록으로」로 돌아간다", () => {
    expect(html).toContain("발송 목록으로");
  });

  it("수신자를 못 불러오면 빈 표에 이유를 가리키고 다시 시도를 준다", () => {
    const bad = draw({
      view: "job",
      job: job(),
      jobRecipients: [],
      error: "발송 상세를 불러오지 못했어요.",
    });
    expect(bad).toContain("발송 상세를 불러오지 못했어요");
    expect(bad).toContain("보여 줄 수신자가 없어요");
    // 이제 막힘이 아니라 일시적 실패다 — 다시 눌러 볼 자리를 준다.
    expect(bad).toContain("다시 시도");
  });
});

describe("서식 보기 모달", () => {
  const base: Partial<HistoryTabProps> = { view: "job", job: job(), jobRecipients: [recipient()] };

  it("안 열었으면 모달이 없다", () => {
    expect(draw(base)).not.toContain('role="dialog"');
  });

  it("제목과 받는 사람을 머리에 적고 닫기를 준다", () => {
    const html = draw({ ...base, mail: mailState({ loading: true }) });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("장려금 2차 서류 제출 안내");
    expect(html).toContain("ha***@hanbit.kr");
    expect(html).toContain("닫기");
  });

  it("불러오는 동안 자리지킴을 그린다", () => {
    const html = draw({ ...base, mail: mailState({ loading: true }) });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
  });

  it("서식이 오면 iframe 으로 그대로 띄운다", () => {
    const html = draw({ ...base, mail: mailState({ html: "<p>안녕하세요 대표님</p>" }) });
    expect(html).toContain("<iframe");
    expect(html).toContain("srcDoc=");
    expect(html).toContain("안녕하세요 대표님");
    // 서버가 그린 서식만 띄운다 — 안에서 스크립트가 돌지 않게 잠근다.
    expect(html).toContain('sandbox="allow-same-origin"');
  });

  it("오류면 이유와 다시 시도를 준다", () => {
    const html = draw({ ...base, mail: mailState({ error: "잠시 후 다시 시도해 주세요." }) });
    expect(html).toContain("서식을 불러오지 못했어요");
    expect(html).toContain("잠시 후 다시 시도해 주세요.");
    expect(html).toContain("다시 시도");
  });

  it("보관 기간이 지났으면 그 이유와 남는 것을 밝힌다", () => {
    const html = draw({ ...base, mail: mailState({ expired: true }) });
    expect(html).toContain("보관 기간(90일)이 지나 서식이 지워졌어요");
    expect(html).toContain("제목");
    expect(html).not.toContain("<iframe");
  });
});

describe("회사 상세", () => {
  const detail: HistoryCompanyDetail = {
    key: "b:1234567890",
    companyName: "(주)한빛정밀",
    representative: "김대표",
    phone: "010-2•••-4567",
    email: "ha***@hanbit.kr",
    bizNo: "1234567890",
    sourceRowId: "gov-42",
    items: [
      {
        jobId: "j1",
        createdAt: "2026-09-04T01:43:00.000Z",
        title: "장려금 2차 서류 제출 안내",
        channel: "email",
        senderName: "김민수",
        emailSignal: "확인함",
        chatSignal: "",
        emailSource: "basic",
        emailError: "",
        status: "sent",
        error: "",
      },
      {
        jobId: "j2",
        createdAt: "2026-09-02T07:02:00.000Z",
        title: "현장 점검 일정 안내",
        channel: "chat",
        senderName: "이세훈",
        emailSignal: "",
        chatSignal: "열어 봄",
        emailSource: "",
        emailError: "",
        status: "sent",
        error: "",
      },
    ],
  };
  const html = draw({ view: "company", company: detail });

  it("머리 카드에 대표·연락처·이메일·사업자번호가 있다", () => {
    expect(html).toContain("(주)한빛정밀");
    expect(html).toContain("김대표 대표");
    expect(html).toContain("사업자번호 1234567890");
  });

  it("담당·계약일은 서버가 안 주므로 지어내지 않는다", () => {
    expect(html).not.toContain("담당 ");
    expect(html).not.toContain("계약일");
  });

  it("「상세창에서 보기」 준비 중 표시는 없다 — 눌러도 안 되는 자리를 배포본에 두지 않는다", () => {
    expect(html).not.toContain("상세창에서 보기");
    expect(html).not.toContain("준비 중");
  });

  it("이력 표에 시각·채널·제목·보낸 사람·신호·주소 출처가 있다", () => {
    for (const th of ["받은 시각", "채널", "제목 / 안내", "보낸 사람", "신호", "주소 출처"]) {
      expect(html, `열 「${th}」`).toContain(th);
    }
    expect(html).toContain("기본정보 이메일");
    // 채팅만 나간 줄의 주소 출처는 「대표연락처」
    expect(html).toContain("대표연락처");
  });

  it("무엇으로 묶은 이력인지 근거를 밝힌다", () => {
    expect(html).toContain("사업자번호 1234567890 로 묶은 이력입니다");
  });

  it("「목록으로」로 돌아간다", () => {
    expect(html).toContain("사업장 목록으로");
  });

  it("「서식 보기」는 hasMail 과 수신자 열쇠가 함께 있는 줄에서만 눌린다", () => {
    const unlocked = draw({
      view: "company",
      company: { ...detail, items: [companyItem({ hasMail: true, recipientId: "cr1" })] },
    });
    const noMail = draw({
      view: "company",
      company: { ...detail, items: [companyItem({ hasMail: false, recipientId: "cr1" })] },
    });
    const noKey = draw({
      view: "company",
      company: { ...detail, items: [companyItem({ hasMail: true, recipientId: undefined })] },
    });
    expect(unlocked).toContain("서식 보기");
    expect((noMail.match(/disabled/g) ?? []).length).toBeGreaterThan(
      (unlocked.match(/disabled/g) ?? []).length,
    );
    expect((noKey.match(/disabled/g) ?? []).length).toBeGreaterThan(
      (unlocked.match(/disabled/g) ?? []).length,
    );
  });

  it("서버가 열쇠를 안 줘서 잠긴다는 옛 사유 줄은 사라졌다", () => {
    expect(html).not.toContain("수신자 열쇠가 실려 오지 않습니다");
  });
});
