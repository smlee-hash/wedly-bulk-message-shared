import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALIMTALK_REASON_MISSING,
  NOTICE_CATEGORIES,
  alimtalkBadgeOf,
  alimtalkFailedCountOf,
  canConfirmSend,
  failureReasonOf,
  progressHeadline,
  restoredJobFromStore,
} from "./step3-helpers";

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
