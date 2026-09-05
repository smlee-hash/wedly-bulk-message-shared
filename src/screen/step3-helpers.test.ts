import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALIMTALK_REASON_MISSING,
  DEFAULT_PRICING,
  EMAIL_REASON_MISSING,
  NOTICE_CATEGORIES,
  alimtalkBadgeOf,
  alimtalkFailedCountOf,
  canConfirmSend,
  canRestartSend,
  canStopSend,
  emailChecklist,
  emailChecklistFailedCount,
  emailSignalOf,
  estimateCost,
  failureReasonOf,
  parsePricing,
  progressHeadline,
  progressOf,
  progressPercent,
  refundedNotice,
  restoredJobFromStore,
  sendHeadline,
  sendRunning,
  skippedNotice,
  subjectRuleOk,
  type EmailChecklistState,
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
    // 화면을 쪼갠 뒤로 상태는 useBulkState, 그림은 steps/Step3Confirm 이 들고 있다.
    const hookSrc = readFileSync(join(__dirname, "useBulkState.ts"), "utf8");
    const step3Src = readFileSync(join(__dirname, "steps/Step3Confirm.tsx"), "utf8");
    expect(step3Src).toContain("progressHeadline(progress?.status)");
    expect(hookSrc).toContain("restoredJobFromStore(saved)");
    expect(hookSrc).toContain("setRestoredFromStore(true)");
    expect(hookSrc).toContain("alertError(JOB_GONE_NOTICE)");
    expect(step3Src).toContain("{!restoredFromStore && (");
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
    // 화면을 쪼갠 뒤로 상태는 useBulkState, 그림은 steps/Step3Confirm 이 들고 있다.
    const hookSrc = readFileSync(join(__dirname, "useBulkState.ts"), "utf8");
    const step3Src = readFileSync(join(__dirname, "steps/Step3Confirm.tsx"), "utf8");
    const allSrc = `${hookSrc}\n${step3Src}`;
    // 단가는 응답에 **객체로 실려 있을 때만** 갱신한다 — 없으면 직전 값을 그대로 둔다.
    // (배포 교체 중 옛 서버에 걸린 재조회 한 번에 화면 단가가 기본값으로 되돌아가면 안 된다.)
    expect(hookSrc).toContain('if (rawPricing && typeof rawPricing === "object") setPricing(parsePricing(rawPricing));');
    expect(hookSrc).not.toContain("setPricing(parsePricing(j.data?.pricing))");
    expect(hookSrc).toContain("estimateCost(selectedCount, pricing)");
    // 옛 단가 상수는 남아 있으면 안 된다
    expect(allSrc).not.toContain("COST_MAX");
    expect(allSrc).not.toContain("COST_MIN");
    // 3단계 표와 발송 확인 모달이 같은 값을 쓴다
    expect(step3Src).toContain("won(cost.alimtalk)");
    expect(step3Src).toContain("won(cost.smsMax)");
    // 시험 발송은 알림톡 기준 문구 + 안내 내용을 함께 보낸다
    expect(hookSrc).toContain("phone: testPhone, noticeCategory");
    expect(hookSrc).toContain("보냈어요. 카카오톡 알림톡을 확인해 주세요.");
  });
});

/* ══════════════════ 이메일 3단계 (2026-09-05) ══════════════════ */

function checkState(over: Partial<EmailChecklistState> = {}): EmailChecklistState {
  return {
    channel: "email",
    subject: "장려금 2차 서류 제출 안내",
    preheader: "4대보험 완납증명서·8월 임금대장 2종",
    fillMarkers: [],
    fillValues: {},
    factLock: { missing: [], added: [], ok: true },
    adSentences: [],
    attachments: [],
    ...over,
  };
}
const labels = (over: Partial<EmailChecklistState> = {}) => emailChecklist(checkState(over)).map((i) => i.label);
const bad = (over: Partial<EmailChecklistState> = {}) =>
  emailChecklist(checkState(over)).filter((i) => !i.ok).map((i) => i.label);

describe("subjectRuleOk — 제목 규칙은 2단계 노란 줄과 같은 사전을 쓴다", () => {
  it("빈 제목은 통과가 아니다", () => {
    expect(subjectRuleOk("")).toBe(false);
    expect(subjectRuleOk("   ")).toBe(false);
  });
  it("금지 표현·이모지가 있으면 막힌다", () => {
    expect(subjectRuleOk("무료 상담 안내")).toBe(false);
    expect(subjectRuleOk("긴급 서류 요청")).toBe(false);
    expect(subjectRuleOk("서류 제출 안내 🎉")).toBe(false);
  });
  it("서버 상한 30자를 넘어야 막힌다 — 다만 {회사명} 은 세지 않는다(수신자 이름으로 바뀐다)", () => {
    // 22자는 권장일 뿐이다(2026-09-06) — 23~30자는 통과시키고 노란 경고만 붙인다.
    expect(subjectRuleOk("가".repeat(23))).toBe(true);
    expect(subjectRuleOk("가".repeat(30))).toBe(true);
    expect(subjectRuleOk("가".repeat(31))).toBe(false);
    // 「{회사명}」 은 안 세지만 뒤의 공백 한 칸은 센다 — 29자 + 공백 = 30자로 아직 통과.
    expect(subjectRuleOk(`{회사명} ${"가".repeat(29)}`)).toBe(true);
    expect(subjectRuleOk(`{회사명} ${"가".repeat(30)}`)).toBe(false);
  });
  it("★미리보기 문구가 비어도 제목 항목은 통과다 — 그건 둘째 항목이 따로 센다", () => {
    const items = emailChecklist(checkState({ preheader: "" }));
    expect(items[0].ok).toBe(true);
    expect(items[1].ok).toBe(false);
  });
});

describe("emailChecklist — 시안 §3단계의 아홉 줄", () => {
  it("알림톡·채팅이면 빈 배열 — 이메일 안 쓰는 담당자에게 이메일 점검표를 내밀지 않는다", () => {
    expect(emailChecklist(checkState({ channel: "chat" }))).toEqual([]);
    expect(emailChecklist(checkState({ channel: "both" }))).toHaveLength(9);
  });

  it("항목 아홉 개가 시안 순서 그대로다", () => {
    expect(labels()).toEqual([
      "제목 30자 안 · 금지 표현 없음",
      "미리보기 문구 있음",
      "[확인 필요] 0개",
      "사실 잠금 통과 — 원문의 값이 정리본에 그대로",
      "광고 표현 없음 — 정보성 안내만 보냅니다",
      "깨진 링크 0 (변수 든 링크는 「검사 불가」로 표시)",
      "첨부는 보관함 링크로 정상",
      "수신 설정 링크·수신거부 머리글 자동 포함",
      "발신 도메인 wedly.kr 인증(DKIM·DMARC) 정상",
    ]);
  });

  it("고칠 곳은 전부 2단계다 — 빨간 줄을 누르면 어디로 갈지가 항목마다 적혀 있다", () => {
    expect(emailChecklist(checkState()).every((i) => i.goStep === 2)).toBe(true);
  });

  it("아무 문제가 없으면 아홉 줄 모두 통과", () => {
    expect(bad()).toEqual([]);
    expect(emailChecklistFailedCount(emailChecklist(checkState()))).toBe(0);
  });

  it("채우지 않은 [확인 필요] 가 하나라도 있으면 막힌다", () => {
    expect(bad({ fillMarkers: ["[확인 필요: 요일]"], fillValues: {} })).toEqual(["[확인 필요] 0개"]);
    expect(bad({ fillMarkers: ["[확인 필요: 요일]"], fillValues: { "[확인 필요: 요일]": "  " } })).toEqual([
      "[확인 필요] 0개",
    ]);
    expect(bad({ fillMarkers: ["[확인 필요: 요일]"], fillValues: { "[확인 필요: 요일]": "금요일" } })).toEqual([]);
  });

  it("사실 잠금은 결과를 아직 못 받았을 때도 막는다 — 「모름」을 통과로 위장하지 않는다", () => {
    expect(bad({ factLock: null })).toEqual(["사실 잠금 통과 — 원문의 값이 정리본에 그대로"]);
    expect(bad({ factLock: { missing: ["9월 12일"], added: [], ok: false } })).toEqual([
      "사실 잠금 통과 — 원문의 값이 정리본에 그대로",
    ]);
  });

  it("광고로 읽히는 문장이 있으면 막힌다", () => {
    expect(bad({ adSentences: ["지금 신청하면 무료입니다"] })).toEqual([
      "광고 표현 없음 — 정보성 안내만 보냅니다",
    ]);
  });

  it("첨부 총합이 10MB 를 넘으면 막힌다", () => {
    expect(bad({ attachments: [{ bytes: 6 * 1024 * 1024 }, { bytes: 5 * 1024 * 1024 }] })).toEqual([
      "첨부는 보관함 링크로 정상",
    ]);
    expect(bad({ attachments: [{ bytes: 10 * 1024 * 1024 }] })).toEqual([]);
  });

  it("여러 곳이 어긋나면 여러 줄이 빨개진다 — 하나만 알려 주고 끝내지 않는다", () => {
    expect(bad({ subject: "무료", preheader: "", adSentences: ["광고 문장"] })).toEqual([
      "제목 30자 안 · 금지 표현 없음",
      "미리보기 문구 있음",
      "광고 표현 없음 — 정보성 안내만 보냅니다",
    ]);
    expect(emailChecklistFailedCount(emailChecklist(checkState({ subject: "", preheader: "" })))).toBe(2);
  });
});

describe("제목 길이 — 22자는 권장, 30자가 서버 상한(2026-09-06 배포본 검사 반려 3)", () => {
  const checksOf = (subject: string) => emailChecklist(checkState({ subject }));
  const sendable = (subject: string) =>
    canConfirmSend({
      targetsOk: true,
      tooMany: false,
      noticeCategory: "",
      channel: "email",
      emailChecks: checksOf(subject),
    });

  it("23자는 통과하되 노란 경고가 붙는다 — 권장을 넘겼을 뿐 보낼 수 있다", () => {
    const item = checksOf("가".repeat(23))[0];
    expect(item.ok).toBe(true);
    expect(item.warn).toBe(true);
    expect(item.note).toBe("권장 22자를 넘어요 — 받은편지함에서 잘릴 수 있어요");
    // 통과이므로 「미통과 N건」에도 안 세고 보내기도 안 잠긴다
    expect(emailChecklistFailedCount(checksOf("가".repeat(23)))).toBe(0);
    expect(sendable("가".repeat(23))).toBe(true);
    // 22자 안이면 경고도 없다
    expect(checksOf("가".repeat(22))[0].warn).toBe(false);
    expect(checksOf("가".repeat(22))[0].note).toBeUndefined();
  });

  it("31자는 막힌다 — 서버 상한(30자)을 넘으면 보내기가 잠긴다", () => {
    const checks = checksOf("가".repeat(31));
    expect(checks[0].ok).toBe(false);
    expect(checks[0].warn).toBe(false);
    expect(emailChecklistFailedCount(checks)).toBe(1);
    expect(sendable("가".repeat(31))).toBe(false);
    // 경계 한 글자 — 30자는 아직 통과(경고만)
    expect(checksOf("가".repeat(30))[0].ok).toBe(true);
    expect(checksOf("가".repeat(30))[0].warn).toBe(true);
  });
});

describe("canConfirmSend — 통로별 판정", () => {
  const ok9 = emailChecklist(checkState());
  it("알림톡·채팅은 지금까지와 똑같다(채널 칸이 없는 옛 호출 포함)", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "결과 통보" })).toBe(true);
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "결과 통보", channel: "chat" })).toBe(true);
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "", channel: "chat" })).toBe(false);
  });

  it("이메일은 안내구분을 안 본다 — 알림톡 문안의 칸이라 이메일에는 없다", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "", channel: "email", emailChecks: ok9 })).toBe(true);
  });

  it("이메일은 점검 아홉 줄이 모두 통과해야 열린다", () => {
    const oneBad = emailChecklist(checkState({ preheader: "" }));
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "", channel: "email", emailChecks: oneBad })).toBe(false);
  });

  it("★점검 결과를 못 받았으면 닫는다 — 「모름」을 통과로 읽지 않는다", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "", channel: "email" })).toBe(false);
  });

  it("「둘 다」는 두 조건을 모두 지켜야 한다", () => {
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "결과 통보", channel: "both", emailChecks: ok9 })).toBe(true);
    // 안내구분만 빠져도 막힌다
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "", channel: "both", emailChecks: ok9 })).toBe(false);
    // 점검만 어긋나도 막힌다
    const oneBad = emailChecklist(checkState({ adSentences: ["광고"] }));
    expect(canConfirmSend({ targetsOk: true, tooMany: false, noticeCategory: "결과 통보", channel: "both", emailChecks: oneBad })).toBe(false);
  });

  it("★대상·상한은 통로와 상관없이 본다 — 0명·상한 초과는 이메일에서도 막힌다", () => {
    expect(canConfirmSend({ targetsOk: false, tooMany: false, noticeCategory: "", channel: "email", emailChecks: ok9 })).toBe(false);
    expect(canConfirmSend({ targetsOk: true, tooMany: true, noticeCategory: "", channel: "email", emailChecks: ok9 })).toBe(false);
  });
});

describe("emailSignalOf — 확인함 › 도착 › 보냄 › 반송 › 수신거부 › 제외", () => {
  it("★반송·수신거부가 「확인함」보다 앞이다 — 서버 history.ts emailSignalOf 와 같은 순서", () => {
    expect(emailSignalOf({ emailStatus: "bounced", emailViewedAt: "2026-09-05T01:00:00Z" })).toEqual({
      label: "반송",
      variant: "red",
    });
    expect(emailSignalOf({ emailStatus: "unsubscribed", emailDeliveredAt: "2026-09-05T01:00:00Z" })).toEqual({
      label: "수신거부",
      variant: "red",
    });
    // 스팸 신고도 결국 수신거부다(서버가 수신거부 명단에 올린다)
    expect(emailSignalOf({ emailStatus: "complained" })?.label).toBe("수신거부");
  });

  it("확인함 › 도착 › 보냄 순으로 강한 신호가 이긴다", () => {
    const t = "2026-09-05T01:00:00Z";
    expect(emailSignalOf({ emailStatus: "sent", emailSentAt: t, emailDeliveredAt: t, emailViewedAt: t })).toEqual({
      label: "확인함",
      variant: "green",
    });
    expect(emailSignalOf({ emailStatus: "sent", emailSentAt: t, emailDeliveredAt: t })).toEqual({
      label: "도착",
      variant: "blue",
    });
    // 「보냄」은 뜻 없는 회색 점을 그리지 않는 기본형이다(딱지 정본 2026-08-26)
    expect(emailSignalOf({ emailStatus: "sent", emailSentAt: t })).toEqual({ label: "보냄", variant: "default" });
  });

  it("제외는 사유를 그대로 딱지에 적는다 — 「수신거부 확인 불가」도 그대로", () => {
    expect(emailSignalOf({ emailStatus: "skipped", emailSkipReason: "수신거부 확인 불가" })).toEqual({
      label: "수신거부 확인 불가",
      variant: "yellow",
    });
    expect(emailSignalOf({ emailStatus: "skipped", emailSkipReason: "이메일 없음" })?.label).toBe("이메일 없음");
    // 사유가 안 적혀 있어도 제외됐다는 사실은 알린다
    expect(emailSignalOf({ emailStatus: "skipped" })?.label).toBe("제외");
  });

  it("아직 아무 신호도 없으면 null — 없는 상태를 성공으로 위장하지 않는다", () => {
    expect(emailSignalOf({})).toBeNull();
    expect(emailSignalOf({ emailStatus: "pending" })).toBeNull();
  });
});

describe("failureReasonOf — 이메일 사유까지 함께 적는다", () => {
  it("이메일 칸이 없는 옛 응답·채팅 발송은 글자 하나 안 바뀐다", () => {
    expect(failureReasonOf({ status: "failed", error: "번호 없음", alimtalkStatus: "" })).toBe("번호 없음");
    expect(failureReasonOf({ status: "sent", error: "", alimtalkStatus: "failed" })).toBe(ALIMTALK_REASON_MISSING);
    expect(failureReasonOf({ status: "sent", error: "", alimtalkStatus: "sent" })).toBe("—");
  });

  it("이메일만 실패하면 그 사유가 뜬다 — 「—」로 숨기지 않는다", () => {
    expect(
      failureReasonOf({ status: "skipped", error: "", alimtalkStatus: "", emailStatus: "failed", emailError: "주소 없음" }),
    ).toBe("주소 없음");
    expect(failureReasonOf({ status: "skipped", error: "", alimtalkStatus: "", emailStatus: "failed" })).toBe(
      EMAIL_REASON_MISSING,
    );
  });

  it("제외 사유도 그대로 보인다", () => {
    expect(
      failureReasonOf({ status: "sent", error: "", alimtalkStatus: "sent", emailStatus: "skipped", emailSkipReason: "중복 주소" }),
    ).toBe("중복 주소");
  });

  it("★두 통로가 각각 실패하면 둘 다 적는다 — 한쪽만 적으면 나머지가 표에서 사라진다", () => {
    expect(
      failureReasonOf({
        status: "sent",
        error: "",
        alimtalkStatus: "failed",
        alimtalkError: "발신 프로필 차단",
        emailStatus: "bounced",
        emailError: "수신 서버가 되돌림",
      }),
    ).toBe("발신 프로필 차단 · 수신 서버가 되돌림");
  });
});

describe("progressOf — 통로마다 세는 칸이 다르다", () => {
  const job = {
    total: 10,
    sent: 3,
    failed: 1,
    chatTotal: 8,
    emailTotal: 10,
    emailSent: 5,
    emailFailed: 0,
  };

  it("알림톡·채팅은 sent+failed / chatTotal", () => {
    expect(progressOf(job, "chat")).toEqual({ done: 4, total: 8 });
  });

  it("이메일은 emailSent+emailFailed / emailTotal", () => {
    expect(progressOf(job, "email")).toEqual({ done: 5, total: 10 });
  });

  it("「둘 다」는 두 통로를 각각 세어 더한다 — 한 사람에게 두 번 나가니 두 번 센다", () => {
    expect(progressOf(job, "both")).toEqual({ done: 9, total: 18 });
  });

  it("통로별 인원을 모르면(되살린 화면) 작업 전체 인원으로 접는다 — 0이면 막대가 영영 안 찬다", () => {
    expect(progressOf({ total: 12, sent: 2, failed: 0 }, "chat")).toEqual({ done: 2, total: 12 });
    expect(progressOf({ total: 12, emailSent: 4, emailFailed: 1 }, "email")).toEqual({ done: 5, total: 12 });
  });

  it("★작업이 실제로 쓴 통로가 화면 고르개를 이긴다 — 새로고침 뒤 고르개는 기본값으로 돌아온다", () => {
    const emailOnly = { total: 6, sent: 0, failed: 0, emailSent: 6, emailFailed: 0, channelChat: false, channelEmail: true };
    // 화면 고르개는 "chat" 이지만 이 작업은 이메일만 보냈다 — 0/6 이 아니라 6/6 이어야 한다.
    expect(progressOf(emailOnly, "chat")).toEqual({ done: 6, total: 6 });
  });

  it("값이 없거나 망가져도 「NaN / NaN」을 그리지 않는다", () => {
    expect(progressOf(null, "chat")).toEqual({ done: 0, total: 0 });
    expect(progressOf({}, "email")).toEqual({ done: 0, total: 0 });
    expect(progressOf({ total: 5, sent: -3, failed: Number.NaN }, "chat")).toEqual({ done: 0, total: 5 });
  });

  it("막대 백분율은 0~100 밖으로 안 나간다", () => {
    expect(progressPercent({ done: 0, total: 0 })).toBe(0);
    expect(progressPercent({ done: 5, total: 10 })).toBe(50);
    // 통로별 인원을 몰라 전체로 접었을 때 끝난 수가 더 클 수 있다
    expect(progressPercent({ done: 20, total: 10 })).toBe(100);
  });
});

describe("canStopSend — 실제로 멈출 수 있을 때만 그린다", () => {
  it("★알림톡·채팅만 도는 작업에는 안 그린다 — 채팅 러너는 중단 표식을 읽지 않는다", () => {
    expect(canStopSend({ status: "running", channelChat: true, channelEmail: false })).toBe(false);
  });
  it("이메일이 도는 동안에만 열린다", () => {
    expect(canStopSend({ status: "done", emailStatus: "running", channelChat: false, channelEmail: true })).toBe(true);
    expect(canStopSend({ status: "running", emailStatus: "running", channelChat: true, channelEmail: true })).toBe(true);
  });
  it("이메일이 끝났으면 닫는다", () => {
    expect(canStopSend({ status: "done", emailStatus: "done", channelEmail: true })).toBe(false);
  });
  it("이미 눌렀으면 다시 안 눌린다", () => {
    expect(canStopSend({ emailStatus: "running", channelEmail: true, stopRequested: true })).toBe(false);
  });
  it("작업이 없으면 안 그린다", () => {
    expect(canStopSend(null)).toBe(false);
  });
});

describe("sendRunning — 이메일만 보내는 작업은 status 가 처음부터 done 이다", () => {
  it("★status 만 보면 이메일이 도는 내내 「끝났다」로 읽힌다", () => {
    expect(sendRunning({ status: "done", emailStatus: "running", channelChat: false, channelEmail: true })).toBe(true);
  });
  it("채팅이 도는 중이면 도는 중", () => {
    expect(sendRunning({ status: "running", channelChat: true, channelEmail: false })).toBe(true);
  });
  it("둘 다 끝났으면 끝난 것", () => {
    expect(sendRunning({ status: "done", emailStatus: "done", channelChat: true, channelEmail: true })).toBe(false);
    expect(sendRunning(null)).toBe(false);
  });
});

describe("sendHeadline — 통로를 함께 보는 진행 머리글", () => {
  it("★이메일 작업은 status 만 보면 시작하자마자 「끝났어요」가 뜬다", () => {
    const job = { status: "done", emailStatus: "running", channelChat: false, channelEmail: true };
    expect(progressHeadline(job.status)).toBe("발송이 끝났어요"); // 옛 판정(이래서 못 쓴다)
    expect(sendHeadline(job)).toBe("보내는 중이에요");
  });
  it("중단을 누른 작업은 「중단했어요」", () => {
    expect(
      sendHeadline({ status: "done", emailStatus: "done", channelEmail: true, stopRequested: true }),
    ).toBe("발송을 중단했어요");
  });
  it("두 통로가 다 끝나야 「끝났어요」 — 한쪽이 멈추면 멈춘 것", () => {
    expect(sendHeadline({ status: "done", emailStatus: "done", channelChat: true, channelEmail: true })).toBe(
      "발송이 끝났어요",
    );
    expect(sendHeadline({ status: "done", emailStatus: "failed", channelChat: true, channelEmail: true })).toBe(
      "발송이 멈췄어요",
    );
    expect(sendHeadline({ status: "interrupted", channelChat: true, channelEmail: false })).toBe("발송이 멈췄어요");
  });
  it("진행을 아직 못 받았으면 「불러오는 중」 — 되살린 직후를 사고로 읽지 않게", () => {
    expect(sendHeadline(null)).toBe("진행 상황을 불러오는 중…");
    expect(sendHeadline({ status: "" })).toBe("진행 상황을 불러오는 중…");
  });
});

/* ══════════ 끝난 뒤 새 발송 (2026-09-06 브라우저 QA 반려 7) ══════════ */

describe("canRestartSend — 발송이 끝난 뒤에만 「새 발송 시작」을 그린다", () => {
  it("도는 중에는 안 그린다 — 보내는 도중에 처음으로 돌아갈 길을 주지 않는다", () => {
    expect(canRestartSend({ status: "running", channelChat: true })).toBe(false);
    // 이메일만 보내는 작업은 status 가 처음부터 done 이다 — emailStatus 를 함께 본다
    expect(canRestartSend({ status: "done", emailStatus: "running", channelChat: false, channelEmail: true })).toBe(false);
  });

  it("끝났으면(완료·중단·실패) 그린다", () => {
    expect(canRestartSend({ status: "done", channelChat: true })).toBe(true);
    expect(canRestartSend({ status: "interrupted", channelChat: true })).toBe(true);
    expect(canRestartSend({ status: "failed", channelChat: true })).toBe(true);
    expect(canRestartSend({ status: "done", emailStatus: "done", channelChat: false, channelEmail: true })).toBe(true);
    expect(canRestartSend({ status: "done", emailStatus: "stopped", channelChat: false, channelEmail: true })).toBe(true);
  });

  it("진행을 아직 못 받았으면 안 그린다 — 되살린 직후 「끝났다」로 위장하지 않는다", () => {
    expect(canRestartSend(null)).toBe(false);
    expect(canRestartSend(undefined)).toBe(false);
    expect(canRestartSend({})).toBe(false);
  });

  it("배선까지 본다 — 누르면 적어 둔 작업 번호를 지우고 1단계 처음 상태로 돌아간다", () => {
    const hookSrc = readFileSync(join(__dirname, "useBulkState.ts"), "utf8");
    expect(hookSrc).toContain("const restartSend = useCallback(() => {");
    // 보관한 작업 번호를 지운다 — 안 지우면 새로고침이 끝난 발송을 다시 열어 화면이 갇힌다
    expect(hookSrc).toContain("try { sessionStorage.removeItem(JOB_ID_STORE_KEY); } catch { /* 무시 */ }");
    // 진행·작업 번호를 비우고
    expect(hookSrc).toContain("setJobId(\"\");");
    expect(hookSrc).toContain("setProgress(null);");
    // 1단계 처음 상태로(고른 사람 · 원문 · 통로 기본값) 돌아간 뒤 1단계를 연다
    expect(hookSrc).toContain("setPicked(new Map());");
    expect(hookSrc).toContain("setOriginalText(\"\");");
    expect(hookSrc).toContain("setChannel(DEFAULT_CHANNEL);");
    expect(hookSrc).toContain("canRestartSend(progress)");
  });
});
