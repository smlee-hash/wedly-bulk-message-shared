import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALIMTALK_REASON_MISSING,
  DEFAULT_PRICING,
  NOTICE_CATEGORIES,
  alimtalkBadgeOf,
  alimtalkFailedCountOf,
  canConfirmSend,
  estimateCost,
  failureReasonOf,
  parsePricing,
  progressHeadline,
  refundedNotice,
  restoredJobFromStore,
  skippedNotice,
} from "./step3-helpers";
import { droppedSummary } from "./step1-helpers";

describe("새로고침 뒤 되살리기", () => {
  it("보관값이 있으면 되살리고, 진행을 못 받은 동안 머리글은 「불러오는 중」", () => {
    expect(restoredJobFromStore("job_1")).toEqual({ jobId: "job_1" });
    expect(restoredJobFromStore("  ")).toBeNull();
    expect(restoredJobFromStore(null)).toBeNull();
    // ★되살린 직후엔 진행을 아직 못 받았다 — 여기서 「발송이 멈췄어요」가 뜨면 담당자가 사고로 읽는다.
    expect(progressHeadline(undefined)).toBe("진행 상황을 불러오는 중…");
    expect(progressHeadline("running")).toBe("보내는 중이에요");
    expect(progressHeadline("done")).toBe("발송이 끝났어요");
    expect(progressHeadline("interrupted")).toBe("발송이 멈췄어요");
    // 배선까지 본다 — 판단만 맞고 화면이 안 쓰면 옛 문구가 그대로 뜬다.
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain("progressHeadline(progress?.status)");
    expect(src).toContain("restoredJobFromStore(saved)");
    expect(src).toContain("setRestoredFromStore(true)");
    expect(src).toContain("alertError(JOB_GONE_NOTICE)");
    expect(src).toContain("{!restoredFromStore && (");
  });
});

describe("NOTICE_CATEGORIES", () => {
  it("담당자가 고르는 안내 내용 네 가지다", () => {
    expect(NOTICE_CATEGORIES).toEqual([
      "서류 준비 안내",
      "심사 일정 안내",
      "결과 통보",
      "기타 안내",
    ]);
  });
});

describe("canConfirmSend", () => {
  it("안내 내용을 안 고르면 발송할 수 없다", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "" })).toBe(false);
  });
  it("목록에 없는 값을 넣어도 발송할 수 없다", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "진행 상황 안내" })).toBe(false);
  });
  it("대상이 없거나 너무 많으면 안내 내용을 골라도 못 보낸다", () => {
    expect(canConfirmSend({ targetsOk: false, tooMany: false, noticeCategory: "서류 준비 안내" })).toBe(false);
    expect(canConfirmSend({ targetsOk: true, tooMany: true, noticeCategory: "서류 준비 안내" })).toBe(false);
  });
  it("대상이 있고 안내 내용을 고르면 발송할 수 있다", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "결과 통보" })).toBe(true);
  });
});

describe("alimtalkBadgeOf", () => {
  it("열어 본 시각이 있으면 「열어 봄」이 「보냄」보다 앞선다", () => {
    expect(alimtalkBadgeOf("sent", "2026-09-02T00:00:00.000Z")).toEqual({
      label: "열어 봄",
      variant: "blue",
    });
  });
  it("보낸 기록만 있으면 「알림 보냄」 — 도착까지는 모른다", () => {
    expect(alimtalkBadgeOf("sent", null)).toEqual({
      label: "알림 보냄",
      variant: "green",
    });
  });
  it("실패면 「알림 실패」", () => {
    expect(alimtalkBadgeOf("failed", null)).toEqual({
      label: "알림 실패",
      variant: "red",
    });
  });
  it("값이 비면 「모름」 — 성공으로 위장하지 않는다", () => {
    expect(alimtalkBadgeOf("", null)).toEqual({
      label: "모름",
      variant: "default",
    });
  });
  it("딱지 글에 「도착」을 쓰지 않는다", () => {
    for (const status of ["sent", "failed", ""]) {
      expect(alimtalkBadgeOf(status, null).label).not.toMatch(/도착/);
    }
  });
});

describe("alimtalkFailedCountOf", () => {
  it("실패한 사람만 센다", () => {
    expect(alimtalkFailedCountOf([
      { alimtalkStatus: "sent" },
      { alimtalkStatus: "failed" },
      { alimtalkStatus: "" },
      { alimtalkStatus: "failed" },
    ])).toBe(2);
  });
  it("없으면 0", () => {
    expect(alimtalkFailedCountOf([])).toBe(0);
  });
});

describe("failureReasonOf", () => {
  it("안내(채널톡) 실패면 그 이유, 없으면 「알 수 없음」", () => {
    expect(failureReasonOf({ status: "failed", error: "유저 upsert 실패 429", alimtalkStatus: "" })).toBe("유저 upsert 실패 429");
    expect(failureReasonOf({ status: "failed", error: "", alimtalkStatus: "" })).toBe("알 수 없음");
  });
  it("알림톡만 실패하면 알림톡 사유를 보여 준다 — 「—」로 숨기지 않는다", () => {
    expect(
      failureReasonOf({ status: "sent", error: "", alimtalkStatus: "failed", alimtalkError: "비즈톡 문구가 승인 상태가 아닙니다(INS)" }),
    ).toBe("비즈톡 문구가 승인 상태가 아닙니다(INS)");
    expect(failureReasonOf({ status: "sent", error: "", alimtalkStatus: "failed" })).toBe(ALIMTALK_REASON_MISSING);
    expect(failureReasonOf({ status: "sent", error: "", alimtalkStatus: "failed", alimtalkError: "  " })).toBe(ALIMTALK_REASON_MISSING);
  });
  it("성공·대기는 「—」", () => {
    expect(failureReasonOf({ status: "sent", error: "", alimtalkStatus: "sent" })).toBe("—");
    expect(failureReasonOf({ status: "pending", error: "", alimtalkStatus: "" })).toBe("—");
  });
});

describe("skippedNotice — 발송이 걸러낸 사람 알리기", () => {
  it("사유별 건수를 합계와 한 줄로 만든다", () => {
    expect(
      skippedNotice([
        { reason: "수신거부", count: 1 },
        { reason: "중복 번호", count: 1 },
      ]),
    ).toEqual({ total: 2, text: "수신거부 1 · 중복 번호 1" });
  });

  it("서버가 준 사유 순서를 그대로 지킨다 — 여기서 다시 정렬하면 앱마다 순서가 달라진다", () => {
    expect(
      skippedNotice([
        { reason: "대상 아님", count: 3 },
        { reason: "번호 없음", count: 2 },
        { reason: "범위 밖", count: 1 },
      ]),
    ).toEqual({ total: 6, text: "대상 아님 3 · 번호 없음 2 · 범위 밖 1" });
  });

  it("1단계의 「빠진 사람」 문구와 같은 문법이다 — 같은 뜻을 두 모양으로 그리지 않는다", () => {
    const step1 = droppedSummary([
      { key: "a", reason: "수신거부" },
      { key: "b", reason: "중복 번호" },
    ]);
    expect(skippedNotice([
      { reason: "수신거부", count: 1 },
      { reason: "중복 번호", count: 1 },
    ])?.text).toBe(step1);
  });

  it("옛 응답(값 없음·배열 아님)은 아무것도 안 그린다", () => {
    expect(skippedNotice(undefined)).toBeNull();
    expect(skippedNotice(null)).toBeNull();
    expect(skippedNotice("수신거부 1")).toBeNull();
    expect(skippedNotice({ reason: "수신거부", count: 1 })).toBeNull();
  });

  it("걸러진 사람이 없으면 안 그린다 — 0건 사유가 섞여 와도", () => {
    expect(skippedNotice([])).toBeNull();
    expect(skippedNotice([{ reason: "수신거부", count: 0 }])).toBeNull();
    expect(skippedNotice([
      { reason: "수신거부", count: 0 },
      { reason: "중복 번호", count: 2 },
    ])).toEqual({ total: 2, text: "중복 번호 2" });
  });

  it("건수가 글자로 와도 살린다 — 경고가 통째로 사라지면 안 된다", () => {
    // 같은 응답의 blockedCount·outOfScopeCount 도 화면이 Number(...) 로 받는다(동작을 맞춘다).
    expect(skippedNotice([{ reason: "수신거부", count: "2" }])).toEqual({
      total: 2,
      text: "수신거부 2",
    });
    expect(skippedNotice([
      { reason: "번호 없음", count: "1" },
      { reason: "중복 번호", count: 2 },
    ])).toEqual({ total: 3, text: "번호 없음 1 · 중복 번호 2" });
    // 숫자로 못 읽는 값만 버린다
    expect(skippedNotice([{ reason: "수신거부", count: "많음" }])).toBeNull();
    expect(skippedNotice([{ reason: "수신거부", count: "-3" }])).toBeNull();
  });

  it("★숫자·글자가 아닌 값은 안 받는다 — Number(true)=1 이 「1명」이라는 거짓 경고가 된다", () => {
    // 거짓 경고 하나가 뜨면 그것 때문에 진짜 blockedCount 안내까지 숨는다.
    expect(skippedNotice([{ reason: "수신거부", count: true }])).toBeNull();
    expect(skippedNotice([{ reason: "수신거부", count: [] }])).toBeNull();
    expect(skippedNotice([{ reason: "수신거부", count: {} }])).toBeNull();
    expect(skippedNotice([{ reason: "수신거부", count: null }])).toBeNull();
    // 망가진 줄만 버리고 멀쩡한 줄은 살린다
    expect(skippedNotice([
      { reason: "수신거부", count: true },
      { reason: "중복 번호", count: 2 },
    ])).toEqual({ total: 2, text: "중복 번호 2" });
  });

  it("망가진 줄은 건너뛰고 나머지는 살린다", () => {
    expect(
      skippedNotice([
        { reason: "", count: 5 },
        { reason: "수신거부" },
        { count: 3 },
        null,
        "수신거부",
        { reason: "  범위 밖  ", count: 2 },
      ]),
    ).toEqual({ total: 2, text: "범위 밖 2" });
  });
});

describe("refundedNotice — 고른 명단에 섞인 환불 고객", () => {
  const row = (companyName: string, refundedAt = "") => ({ companyName, refundedAt });

  it("환불일이 있는 사람만 센다 — 진행상태 글자로 세지 않는다", () => {
    const out = refundedNotice([
      row("가나다", "2026-06-02"),
      { companyName: "라마바", refundedAt: "", statuses: ["환불"] } as never,
      row("사아자"),
    ]);
    expect(out).toEqual({ count: 1, text: "가나다" });
  });

  it("여럿이면 이름 몇 개만 보이고 나머지는 「외 N곳」", () => {
    const out = refundedNotice([
      row("가나다", "2026-06-02"),
      row("라마바", "2026-06-03"),
      row("사아자", "2026-06-04"),
      row("차카타", "2026-06-05"),
    ]);
    expect(out).toEqual({ count: 4, text: "가나다 · 라마바 외 2곳" });
  });

  it("보여 줄 이름 수는 부를 때 정할 수 있다", () => {
    const rows = [row("가", "d"), row("나", "d"), row("다", "d")];
    expect(refundedNotice(rows, 1)?.text).toBe("가 외 2곳");
    expect(refundedNotice(rows, 3)?.text).toBe("가 · 나 · 다");
  });

  it("한 명이면 이름만", () => {
    expect(refundedNotice([row("가나다", "2026-06-02")])).toEqual({ count: 1, text: "가나다" });
  });

  it("회사명이 없어도 인원수는 알린다 — 조용히 넘어가면 안 된다", () => {
    expect(refundedNotice([row("", "2026-06-02"), row("  ", "2026-06-03")])).toEqual({
      count: 2,
      text: "",
    });
    // 이름이 있는 줄만 골라 보여 준다
    expect(refundedNotice([row("", "d"), row("라마바", "d")])).toEqual({
      count: 2,
      text: "라마바 외 1곳",
    });
  });

  it("환불 고객이 없으면 아무것도 안 그린다", () => {
    expect(refundedNotice([])).toBeNull();
    expect(refundedNotice([row("가나다"), row("라마바", "   ")])).toBeNull();
  });
});

describe("parsePricing", () => {
  it("서버가 준 단가를 그대로 쓴다", () => {
    expect(parsePricing({ alimtalkWon: 5, smsMaxWon: 28 })).toEqual({ alimtalkWon: 5, smsMaxWon: 28 });
    expect(parsePricing({ alimtalkWon: 6.5, smsMaxWon: 30 })).toEqual({ alimtalkWon: 6.5, smsMaxWon: 30 });
  });

  it("칸이 아예 없어도(옛 서버) 기본값으로 돈다", () => {
    expect(parsePricing(undefined)).toEqual(DEFAULT_PRICING);
    expect(parsePricing(null)).toEqual(DEFAULT_PRICING);
    expect(parsePricing({})).toEqual(DEFAULT_PRICING);
    expect(parsePricing("5원")).toEqual(DEFAULT_PRICING);
    expect(parsePricing(5)).toEqual(DEFAULT_PRICING);
    expect(parsePricing([])).toEqual(DEFAULT_PRICING);
  });

  it("이상한 값은 그 칸만 접는다 — 멀쩡한 칸까지 되돌리지 않는다", () => {
    // 글자·음수·0·NaN·Infinity 는 단가가 될 수 없다
    expect(parsePricing({ alimtalkWon: "5", smsMaxWon: 30 })).toEqual({ alimtalkWon: 5, smsMaxWon: 30 });
    expect(parsePricing({ alimtalkWon: -1, smsMaxWon: 30 })).toEqual({ alimtalkWon: 5, smsMaxWon: 30 });
    expect(parsePricing({ alimtalkWon: 0, smsMaxWon: 30 })).toEqual({ alimtalkWon: 5, smsMaxWon: 30 });
    expect(parsePricing({ alimtalkWon: Number.NaN, smsMaxWon: 30 })).toEqual({ alimtalkWon: 5, smsMaxWon: 30 });
    expect(parsePricing({ alimtalkWon: Number.POSITIVE_INFINITY, smsMaxWon: 30 })).toEqual({
      alimtalkWon: 5,
      smsMaxWon: 30,
    });
    expect(parsePricing({ alimtalkWon: 7, smsMaxWon: null })).toEqual({ alimtalkWon: 7, smsMaxWon: 28 });
    expect(parsePricing({ alimtalkWon: 7, smsMaxWon: true })).toEqual({ alimtalkWon: 7, smsMaxWon: 28 });
  });

  it("기본값 자체는 오염되지 않는다 — 받은 값을 고쳐도 다음 조회가 멀쩡해야 한다", () => {
    const got = parsePricing(undefined);
    got.alimtalkWon = 999;
    expect(DEFAULT_PRICING.alimtalkWon).toBe(5);
    expect(parsePricing(undefined).alimtalkWon).toBe(5);
  });
});

describe("estimateCost", () => {
  it("인원 × 단가 — 알림톡은 전원, 문자는 최대치", () => {
    expect(estimateCost(1, DEFAULT_PRICING)).toEqual({ alimtalk: 5, smsMax: 28 });
    expect(estimateCost(500, DEFAULT_PRICING)).toEqual({ alimtalk: 2500, smsMax: 14000 });
    expect(estimateCost(3, { alimtalkWon: 5, smsMaxWon: 28 })).toEqual({ alimtalk: 15, smsMax: 84 });
  });

  it("아직 아무도 안 골랐거나 인원이 이상하면 0 — 「약 NaN원」을 그리지 않는다", () => {
    expect(estimateCost(0, DEFAULT_PRICING)).toEqual({ alimtalk: 0, smsMax: 0 });
    expect(estimateCost(-5, DEFAULT_PRICING)).toEqual({ alimtalk: 0, smsMax: 0 });
    expect(estimateCost(1.5, DEFAULT_PRICING)).toEqual({ alimtalk: 0, smsMax: 0 });
    expect(estimateCost(Number.NaN, DEFAULT_PRICING)).toEqual({ alimtalk: 0, smsMax: 0 });
    expect(estimateCost(Number.POSITIVE_INFINITY, DEFAULT_PRICING)).toEqual({ alimtalk: 0, smsMax: 0 });
  });

  it("소수 단가는 반올림해서 보여 준다", () => {
    expect(estimateCost(3, { alimtalkWon: 5.5, smsMaxWon: 27.4 })).toEqual({ alimtalk: 17, smsMax: 82 });
  });

  it("화면 배선까지 본다 — 판단만 맞고 화면이 옛 상수를 쓰면 금액이 그대로다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    // 단가는 응답에 **객체로 실려 있을 때만** 갱신한다 — 없으면 직전 값을 그대로 둔다.
    // (배포 교체 중 옛 서버에 걸린 재조회 한 번에 화면 단가가 기본값으로 되돌아가면 안 된다.)
    expect(src).toContain('if (rawPricing && typeof rawPricing === "object") setPricing(parsePricing(rawPricing));');
    expect(src).not.toContain("setPricing(parsePricing(j.data?.pricing))");
    expect(src).toContain("estimateCost(selectedCount, pricing)");
    // 옛 단가 상수는 남아 있으면 안 된다
    expect(src).not.toContain("COST_MAX");
    expect(src).not.toContain("COST_MIN");
    // 3단계 표와 발송 확인 모달이 같은 값을 쓴다
    expect(src).toContain("won(cost.alimtalk)");
    expect(src).toContain("won(cost.smsMax)");
    // 시험 발송은 알림톡 기준 문구 + 안내 내용을 함께 보낸다
    expect(src).toContain("phone: testPhone, noticeCategory");
    expect(src).toContain("보냈어요. 카카오톡 알림톡을 확인해 주세요.");
  });
});
