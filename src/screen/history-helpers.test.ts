import { describe, expect, it } from "vitest";
import {
  HISTORY_DEBOUNCE_MS,
  HISTORY_MODE_OPTIONS,
  channelBadges,
  companyMetaLine,
  emailSourceLabel,
  fallbackSignalLabel,
  filterJobs,
  formatHistoryTime,
  historyCountLine,
  historyEmptyText,
  historyModeLabel,
  jobMetaLine,
  lastSignalAt,
  normalizeHistoryQuery,
  recipientSignalBadge,
  rowSignalBadge,
  signalBadge,
  type HistoryJobRow,
} from "./history-helpers";

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
    sent: 30,
    chatViewed: 0,
    emailSent: 30,
    delivered: 30,
    viewed: 12,
    bounced: 1,
    ...over,
  };
}

describe("normalizeHistoryQuery — 가림표·띄어쓰기를 지우고 비교한다", () => {
  it("대소문자·공백·가림표·하이픈을 지운다", () => {
    expect(normalizeHistoryQuery(" Ho***@Wedly.kr ")).toBe("ho***@wedlykr");
    // 가림표까지 지운다 — 사람이 「4567」만 쳐도 가려진 번호에 걸려야 한다.
    expect(normalizeHistoryQuery("010-2•••-4567")).toBe("01024567");
    expect(normalizeHistoryQuery("(주) 한빛 정밀")).toBe("(주)한빛정밀");
  });

  it("null·undefined 도 빈 글자로 받는다", () => {
    expect(normalizeHistoryQuery(undefined as unknown as string)).toBe("");
  });
});

describe("filterJobs — 응답이 오기 전 옛 목록을 즉시 좁힌다", () => {
  const rows = [
    job({ id: "j1", title: "장려금 2차 서류 제출 안내", senderName: "김민수" }),
    job({ id: "j2", title: "현장 점검 일정 안내", senderName: "이세훈", senderEmail: "sehun@wedly.kr", channel: "chat" }),
    job({ id: "j3", title: "서류 보완 요청", senderName: "박지연", senderEmail: "jiyeon@wedly.kr", sourceApp: "illua" }),
  ];

  it("검색어가 비면 전부 그대로", () => {
    expect(filterJobs(rows, "")).toHaveLength(3);
    expect(filterJobs(rows, "   ")).toHaveLength(3);
  });

  it("제목으로 찾는다", () => {
    expect(filterJobs(rows, "장려금").map((j) => j.id)).toEqual(["j1"]);
  });

  it("보낸 사람 이름·주소로 찾는다", () => {
    expect(filterJobs(rows, "이세훈").map((j) => j.id)).toEqual(["j2"]);
    expect(filterJobs(rows, "minsu@wedly.kr").map((j) => j.id)).toEqual(["j1"]);
  });

  it("앱 이름으로도 찾는다", () => {
    expect(filterJobs(rows, "illua").map((j) => j.id)).toEqual(["j3"]);
  });

  it("띄어쓰기를 무시한다 — 「서류보완」으로도 「서류 보완 요청」이 걸린다", () => {
    expect(filterJobs(rows, "서류보완").map((j) => j.id)).toEqual(["j3"]);
  });

  it("맞는 것이 없으면 빈 배열 — 원본을 그대로 돌려주지 않는다", () => {
    expect(filterJobs(rows, "없는말")).toEqual([]);
  });
});

describe("signalBadge — 서버가 준 한 마디를 딱지로만 바꾼다", () => {
  it("고객이 실제로 반응한 신호만 굵게 그린다", () => {
    expect(signalBadge("확인함")).toEqual({ label: "확인함", variant: "green", strong: true });
    expect(signalBadge("열어 봄")).toEqual({ label: "열어 봄", variant: "green", strong: true });
  });

  it("도착·알림 보냄은 파랑, 보냄은 점 없는 기본형", () => {
    expect(signalBadge("도착")).toEqual({ label: "도착", variant: "blue" });
    expect(signalBadge("알림 보냄")).toEqual({ label: "알림 보냄", variant: "blue" });
    // 딱지 정본이 「뜻 없는 회색 점」을 없앴다 — 3단계 발송 현황과 같은 모양이어야 한다.
    expect(signalBadge("보냄")).toEqual({ label: "보냄", variant: "default" });
  });

  it("나쁜 소식은 빨강", () => {
    expect(signalBadge("반송·거부")).toEqual({ label: "반송·거부", variant: "red" });
    expect(signalBadge("보내지 못함")).toEqual({ label: "보내지 못함", variant: "red" });
  });

  it("발송 대기·중단됨을 그린다", () => {
    expect(signalBadge("발송 대기")).toEqual({ label: "발송 대기", variant: "default" });
    expect(signalBadge("중단됨")).toEqual({ label: "중단됨", variant: "yellow" });
  });

  it("아무 신호도 없으면 null — 없는 상태를 성공으로 위장하지 않는다", () => {
    expect(signalBadge("")).toBeNull();
    expect(signalBadge("   ")).toBeNull();
  });

  it("서버가 자유롭게 적는 제외 사유는 글자 그대로 남긴다", () => {
    // 「—」로 지우면 왜 안 갔는지가 화면에서 사라진다.
    expect(signalBadge("수신거부한 주소")).toEqual({ label: "수신거부한 주소", variant: "yellow" });
  });
});

describe("fallbackSignalLabel — 빈 신호를 원본 상태로 가른다", () => {
  it("pending 은 「발송 대기」, revoked 는 「중단됨」", () => {
    expect(fallbackSignalLabel("pending")).toBe("발송 대기");
    expect(fallbackSignalLabel("revoked")).toBe("중단됨");
  });

  it("failed 는 「보내지 못함」 — 실패를 「—」로 숨기지 않는다", () => {
    expect(fallbackSignalLabel("failed")).toBe("보내지 못함");
  });

  it("모르는 상태에는 글자를 지어내지 않는다", () => {
    expect(fallbackSignalLabel("")).toBe("");
    expect(fallbackSignalLabel(null)).toBe("");
    expect(fallbackSignalLabel("weird")).toBe("");
  });
});

describe("rowSignalBadge — 이메일 신호가 채팅 신호보다 먼저다", () => {
  it("둘 다 있으면 이메일 쪽을 그린다(나쁜 소식이 안 가려지게)", () => {
    expect(rowSignalBadge({ emailSignal: "반송·거부", chatSignal: "열어 봄" })).toEqual({
      label: "반송·거부",
      variant: "red",
    });
  });

  it("이메일 신호가 없으면 채팅 신호", () => {
    expect(rowSignalBadge({ emailSignal: "", chatSignal: "알림 보냄" })).toEqual({
      label: "알림 보냄",
      variant: "blue",
    });
  });

  it("둘 다 비면 원본 emailStatus 로 발송 대기·중단됨을 가른다", () => {
    expect(rowSignalBadge({ emailSignal: "", chatSignal: "", emailStatus: "pending" })?.label).toBe("발송 대기");
    expect(rowSignalBadge({ emailSignal: "", chatSignal: "", emailStatus: "revoked" })?.label).toBe("중단됨");
  });

  it("아무것도 없으면 null", () => {
    expect(rowSignalBadge({ emailSignal: "", chatSignal: "", emailStatus: "" })).toBeNull();
    expect(rowSignalBadge({})).toBeNull();
  });
});

describe("channelBadges — 「둘 다」는 두 장", () => {
  it("통로마다 딱지가 다르다", () => {
    expect(channelBadges("chat")).toEqual([{ label: "알림톡·채팅", variant: "blue" }]);
    expect(channelBadges("email")).toEqual([{ label: "이메일", variant: "purple" }]);
  });

  it("both 는 두 장으로 나눠 그린다", () => {
    expect(channelBadges("both").map((b) => b.label)).toEqual(["알림톡·채팅", "이메일"]);
  });

  it("통로를 모르는 옛 작업은 딱지가 없다 — 없는 통로를 지어내지 않는다", () => {
    expect(channelBadges("")).toEqual([]);
  });
});

describe("emailSourceLabel — 주소 출처", () => {
  it("서버가 쓰는 네 값을 사람 말로 바꾼다", () => {
    expect(emailSourceLabel("basic", "email")).toBe("기본정보 이메일");
    expect(emailSourceLabel("tax53", "email")).toBe("경정청구 53이메일");
    expect(emailSourceLabel("applicant", "email")).toBe("신청자이메일");
    expect(emailSourceLabel("manual", "email")).toBe("직접 입력");
  });

  it("채팅만 나간 줄은 「대표연락처」", () => {
    expect(emailSourceLabel("", "chat")).toBe("대표연락처");
  });

  it("이메일 줄인데 출처가 비면 「—」 — 없는 출처를 지어내지 않는다", () => {
    expect(emailSourceLabel("", "email")).toBe("—");
    expect(emailSourceLabel(null, "both")).toBe("—");
  });

  it("모르는 값은 글자 그대로 보여 준다", () => {
    expect(emailSourceLabel("newsource", "email")).toBe("newsource");
  });
});

describe("companyMetaLine — 있는 값만 적는다", () => {
  it("대표·연락처·주소·사업자번호를 가운뎃점으로 잇는다", () => {
    expect(
      companyMetaLine({ representative: "홍길동", phone: "010-2•••-4567", email: "ho***@wedly.kr", bizNo: "1234567890" }),
    ).toBe("홍길동 대표 · 010-2•••-4567 · ho***@wedly.kr · 사업자번호 1234567890");
  });

  it("주소가 없으면 「이메일 없음」으로 정직하게 적는다", () => {
    expect(companyMetaLine({ representative: "홍길동", phone: "010-2•••-4567", email: "" })).toBe(
      "홍길동 대표 · 010-2•••-4567 · 이메일 없음",
    );
  });

  it("담당·계약일은 서버가 안 주므로 이 줄에 없다", () => {
    const line = companyMetaLine({ representative: "홍길동", phone: "010-1•••-2222", email: "a***@b.kr" });
    expect(line).not.toContain("담당");
    expect(line).not.toContain("계약일");
  });

  it("빈 칸은 통째로 빠진다 — 「 ·  · 」 가 남지 않는다", () => {
    expect(companyMetaLine({})).toBe("이메일 없음");
  });
});

describe("historyCountLine — 지금 보는 보기의 숫자만 적는다", () => {
  it("발송별·사업장별의 단위가 다르다", () => {
    expect(historyCountLine("jobs", 12, "")).toBe("발송 12건");
    expect(historyCountLine("companies", 8, "")).toBe("사업장 8곳");
  });

  it("검색 중이면 「검색 결과 —」를 앞에 붙인다", () => {
    expect(historyCountLine("jobs", 3, "한빛")).toBe("검색 결과 — 발송 3건");
  });

  it("천 단위를 끊어 읽는다", () => {
    expect(historyCountLine("companies", 1234, "")).toBe("사업장 1,234곳");
  });
});

describe("historyEmptyText — 빈 상태는 다음 행동까지 말한다", () => {
  it("검색 결과가 없을 때는 다시 찾는 법을 말한다", () => {
    const t = historyEmptyText("jobs", "없는회사");
    expect(t.title).toContain("검색어");
    expect(t.hint).toContain("다시 찾아");
  });

  it("보기마다 안내가 다르다", () => {
    expect(historyEmptyText("jobs", "").title).toContain("보낸 안내가 없어요");
    expect(historyEmptyText("companies", "").title).toContain("사업장이 없어요");
    expect(historyEmptyText("companies", "").hint).toContain("발송하기");
  });
});

describe("formatHistoryTime — 없는 시각을 지어내지 않는다", () => {
  it("모양이 아니거나 비면 「—」", () => {
    expect(formatHistoryTime("")).toBe("—");
    expect(formatHistoryTime(null)).toBe("—");
    expect(formatHistoryTime("어제")).toBe("—");
  });

  it("연-월-일 시:분 으로 접는다(0을 채워 자리가 안 흔들린다)", () => {
    // 보는 사람의 시간대로 그린다 — 값이 아니라 **모양**을 잰다.
    const out = formatHistoryTime("2026-09-04T01:12:00.000Z");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe("jobMetaLine — 발송 상세 머리 한 줄", () => {
  it("시각·보낸 사람·통로·인원·앱을 잇는다", () => {
    const line = jobMetaLine(job({ total: 31, sourceApp: "erp" }));
    expect(line).toContain("김민수");
    expect(line).toContain("이메일");
    expect(line).toContain("받는 사람 31명");
    expect(line).toContain("erp");
  });

  it("「둘 다」는 두 통로를 함께 적는다", () => {
    expect(jobMetaLine(job({ channel: "both" }))).toContain("알림톡·채팅 + 이메일");
  });

  it("보낸 사람을 모르면 「—」 — 빈 자리를 남기지 않는다", () => {
    expect(jobMetaLine(job({ senderName: "" }))).toContain("· — ·");
  });
});

describe("보기 이름·상수", () => {
  it("구간 단추 글자는 한 곳에서만 온다", () => {
    expect(historyModeLabel("jobs")).toBe("발송별");
    expect(historyModeLabel("companies")).toBe("사업장별");
    expect(HISTORY_MODE_OPTIONS.map((o) => o.label)).toEqual(["발송별", "사업장별"]);
  });

  it("검색은 300ms 기다렸다 묻는다", () => {
    expect(HISTORY_DEBOUNCE_MS).toBe(300);
  });
});

describe("recipientSignalBadge — 3단계 발송 현황과 같은 글자를 쓴다", () => {
  it("이메일 신호가 있으면 그것을 그린다(확인함만 굵게)", () => {
    expect(recipientSignalBadge({ emailViewedAt: "2026-09-04T02:00:00Z" })).toEqual({
      label: "확인함",
      variant: "green",
      strong: true,
    });
    expect(recipientSignalBadge({ emailDeliveredAt: "2026-09-04T02:00:00Z" })).toEqual({
      label: "도착",
      variant: "blue",
      strong: false,
    });
  });

  it("이메일 신호가 없으면 채팅 신호를 본다", () => {
    expect(recipientSignalBadge({ viewedAt: "2026-09-04T02:00:00Z" })?.label).toBe("열어 봄");
    expect(recipientSignalBadge({ alimtalkStatus: "sent" })?.label).toBe("알림 보냄");
  });

  it("둘 다 없으면 원본 상태로 발송 대기·중단됨을 가른다", () => {
    expect(recipientSignalBadge({ emailStatus: "pending" })?.label).toBe("발송 대기");
    expect(recipientSignalBadge({ emailStatus: "revoked" })?.label).toBe("중단됨");
    expect(recipientSignalBadge({ emailStatus: "failed" })?.label).toBe("보내지 못함");
  });

  it("아무 신호도 없으면 null — 표는 「—」로 그린다", () => {
    expect(recipientSignalBadge({})).toBeNull();
  });

  it("제외된 줄은 사유를 그대로 보여 준다", () => {
    expect(recipientSignalBadge({ emailStatus: "skipped", emailSkipReason: "수신거부" })?.label).toBe("수신거부");
  });
});

describe("lastSignalAt — 가장 늦게 찍힌 시각", () => {
  it("여러 시각 중 가장 늦은 것을 고른다", () => {
    expect(
      lastSignalAt({
        emailSentAt: "2026-09-04T01:00:00.000Z",
        emailDeliveredAt: "2026-09-04T01:05:00.000Z",
        emailViewedAt: "2026-09-04T02:30:00.000Z",
      }),
    ).toBe("2026-09-04T02:30:00.000Z");
  });

  it("모양이 아닌 시각은 아예 안 센다 — 그 값이 최댓값으로 뽑히지 않게", () => {
    expect(lastSignalAt({ emailSentAt: "어제", emailDeliveredAt: "2026-09-04T01:05:00.000Z" })).toBe(
      "2026-09-04T01:05:00.000Z",
    );
  });

  it("아무 시각도 없으면 빈 글자", () => {
    expect(lastSignalAt({})).toBe("");
    expect(lastSignalAt({ emailSentAt: null, viewedAt: null })).toBe("");
  });
});
