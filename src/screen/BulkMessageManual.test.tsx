import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeSectionIndex, BulkMessageManual } from "./BulkMessageManual";
import { MAX_RECIPIENTS, TEST_SEND_CAP_PARTNER, TEST_SEND_CAP_STAFF } from "./limits";

const html = renderToStaticMarkup(<BulkMessageManual />);
const source = readFileSync(join(__dirname, "BulkMessageManual.tsx"), "utf8");

describe("사용방법 탭 — 승인 미리보기(가독성 판)의 내용을 다 옮겼나", () => {
  it("구역 제목 6개가 다 있다", () => {
    for (const title of [
      "받을 분 고르기",
      "안내문 만들기",
      "발송 확인",
      "보낸 뒤 — 진행 표 읽기",
      "자주 묻는 질문",
      "보내기 전 체크",
    ]) {
      expect(html, `구역 제목 「${title}」`).toContain(title);
    }
  });

  it("자동 제외 표시 4개를 설명한다", () => {
    for (const label of ["수신거부", "번호 없음", "중복 번호", "범위 밖"]) {
      expect(html, `자동 제외 「${label}」`).toContain(label);
    }
  });

  it("자주 묻는 질문이 6개 펼침으로 들어 있다", () => {
    expect(html.match(/<details/g) ?? []).toHaveLength(6);
    expect(html.match(/<summary/g) ?? []).toHaveLength(6);
  });

  it("상한 숫자는 limits.ts 값 그대로 나온다", () => {
    expect(MAX_RECIPIENTS).toBe(500);
    expect(TEST_SEND_CAP_STAFF).toBe(10);
    expect(TEST_SEND_CAP_PARTNER).toBe(3);
    expect(html).toContain("500");
    expect(html).toContain("10건");
    expect(html).toContain("3건");
    // 숫자를 손으로 박아 두면 limits.ts 를 고쳐도 매뉴얼만 옛 값으로 남는다.
    expect(source).not.toMatch(/최대 500명|하루 10건|파트너 앱 3건/);
  });

  it("흐름 카드 3개를 눌러서 이동할 수 있다", () => {
    expect(html.match(/role="button"/g) ?? []).toHaveLength(3);
    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(3);
  });

  it("인용한 화면 문구가 실제 문구 그대로다", () => {
    // 매뉴얼이 「」로 인용하는 문구는 화면·서버가 실제로 내는 문구여야 한다.
    //  - "먼저 안내문 변환이 끝나야 해요"  → step2-helpers.ts step2FooterHint
    //  - "같은 내용을 방금 보냈습니다"      → 서버 발송 창구의 10분 중복 방어 문구
    for (const quote of ["먼저 안내문 변환이 끝나야 해요", "같은 내용을 방금 보냈습니다"]) {
      expect(html, `인용 문구 「${quote}」`).toContain(quote);
    }
  });

  it("체크리스트 5칸과 진행 문구 세 가지가 있다", () => {
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(5);
    expect(html).toContain("0 / 5 확인");
    expect(html).toContain("아직 확인 전");
    // 다 체크했을 때 문구는 첫 그리기에 안 나오므로 코드에 있는지로 본다.
    expect(source).toContain("보내도 좋아요");
  });
});

describe("1단계 개편(2026-09-04) — 탭 3개·진행상태가 사라진 흐름을 설명한다", () => {
  it("대상 기준이 「계약일」이고 진행상태를 안 본다고 적혀 있다", () => {
    expect(html).toContain("계약일이 적힌 고객");
    expect(html).toContain("진행상태는 보지 않습니다");
  });

  it("검색·선택 유지·환불 빨간 줄을 설명한다", () => {
    expect(html).toContain("상호명·대표자명·연락처를 한 칸에서 찾습니다");
    expect(html).toContain("담당이나 검색을 바꿔도 이미 고른 사람은 풀리지 않습니다");
    expect(html).toContain("환불일이 적힌 고객");
  });

  it("없어진 탭 3개·붙여넣기 설명이 남아 있지 않다", () => {
    for (const gone of ["조건으로 찾기", "목록에서 고르기", "번호 붙여넣기", "붙여넣"]) {
      expect(html, `옛 설명 「${gone}」`).not.toContain(gone);
    }
  });

  it("「목록에 없어요」 질문이 원인 셋을 다 알려 준다", () => {
    expect(html).toContain("계약한 고객인데 목록에 없어요");
    // 계약일만 알려 주면 담당·검색 때문에 안 보이는 사람이 멀쩡한 계약일을 고치러 간다.
    expect(html).toContain("「전체」로 바꿔 보세요");
    // 파트너 앱에는 「전체」가 없다 — 없는 선택지를 시키면 멀쩡한 계약일을 고치러 간다
    expect(html).toContain("파트너 앱에서는 본인 담당 고객만 보입니다");
    expect(html).toContain("검색어를 지워 보세요");
    expect(html).toContain("비어 있는 것입니다");
  });
});

describe("가독성 — 사장님 지적(글자가 작다 · 문장이 길게 늘어진다) 반영", () => {
  it("목차 링크 7개가 있다", () => {
    expect(html.match(/href="#/g) ?? []).toHaveLength(7);
  });

  it("흐름 카드 제목은 구역 제목과 같은 층(14.5px)이다 — 더 크면 위계가 뒤집힌다", () => {
    for (const t of ["1. 받을 분 고르기", "2. 안내문 만들기", "3. 발송 확인"]) {
      expect(html, `흐름 카드 「${t}」 제목 층`).toContain(
        `text-wedly-section font-semibold text-wedly-t1 break-keep">${t}<`,
      );
    }
  });

  it("좁은 폭에서는 목차가 가로 알약 줄, md 이상에서만 세로 sticky 목록이다", () => {
    // 링크를 두 벌 그리면 주소 표식도 두 벌이 된다 — 한 벌만 그리고 반응형 클래스로 모양을 바꾼다.
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("md:sticky md:top-3");
    expect(source).toContain('inline: "nearest", block: "nearest"');
  });

  it("목차를 누르면 주소의 구역 표식만 바뀐다(뒤로가기 기록·화면 튐 없음)", () => {
    expect(source).toContain("history?.replaceState");
    expect(source).not.toContain("pushState");
  });

  it("목차 + 720px 본문 열 두 칸 배치다", () => {
    expect(source).toContain("md:grid-cols-[200px_minmax(0,1fr)]");
    expect(source).toContain("max-w-[720px]");
    expect(source).toContain('aria-label="사용방법 목차"');
  });

  it("현재 구역 강조는 스크롤 위치 계산으로 하고 서버 그리기에서 안 터진다", () => {
    // IntersectionObserver 는 화면 끝에서 틀려(맨 아래·맨 위) 버렸다 — 되살리지 마라.
    expect(source).not.toContain("IntersectionObserver(");
    expect(source).toContain('typeof window === "undefined"');
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("passive: true");
    expect(source).toContain("cancelAnimationFrame");
    expect(source).toContain("removeEventListener");
  });

  it("11px 층(text-wedly-hint)을 쓰지 않는다", () => {
    // 가독성 재구성의 핵심 — 각주까지 최소 13px 로 올렸다.
    expect(source).not.toContain("text-wedly-hint");
  });

  it("본문·보조 글자가 13px 밑으로 내려가지 않는다", () => {
    // text-[10px] · text-[11px] · text-[12.5px] 처럼 12px 이하로 박은 자리가 없어야 한다.
    const 작은글자 = source.split("\n").flatMap((line, i) => {
      const m = line.match(/text-\[1[0-2][^\]]*\]/g);
      return m ? m.map((c) => `${i + 1}행 ${c}`) : [];
    });
    expect(작은글자).toEqual([]);
  });

  it("표(<table>) 대신 카드 줄을 쓴다 — <thead>·<th> 없음", () => {
    // ERP 글자 층 검사가 <thead>/<th> 크기를 따로 보므로 아예 쓰지 않는다.
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<thead");
    expect(html).not.toContain("<th ");
  });

  it("구역 제목은 h2 + text-wedly-section 이다 (ERP 글자 층 규칙)", () => {
    expect(source).toContain('<h2 className="text-wedly-section font-bold text-wedly-t1 break-keep">');
    expect(html.match(/<h2/g) ?? []).toHaveLength(6);
    expect(html.match(/<h3/g) ?? []).toHaveLength(0);
  });
});

describe("activeSectionIndex — 목차 강조 계산", () => {
  // 구역 7개(한눈에 보기 · 1~4 · ? · ✓)의 상자 기준 top
  const tops = [0, 400, 900, 1500, 2100, 2700, 3300];
  const H = 800; // 보이는 높이
  const S = 4000; // 전체 높이

  it("맨 위에서는 첫 구역", () => {
    expect(activeSectionIndex(tops, 0, H, S)).toBe(0);
    // 읽는 자리(120px)보다 위에 있는 구역이 하나도 없어도 첫 구역으로 떨어진다
    expect(activeSectionIndex([200, 700], 0, H, S)).toBe(0);
  });

  it("중간에서는 읽는 자리를 지난 마지막 구역", () => {
    // 1000 + 120 = 1120 → 900 은 지났고 1500 은 아직 → 세 번째(번호 2)
    expect(activeSectionIndex(tops, 1000, H, S)).toBe(2);
    expect(activeSectionIndex(tops, 2000, H, S)).toBe(4);
  });

  it("바닥에 닿으면 마지막 구역 — 짧아서 읽는 자리까지 못 올라와도", () => {
    // 3200 + 800 = 4000 ≥ 4000 - 2 → 마지막(번호 6).
    // 읽는 자리로만 재면 3320 이라 3300 을 갓 지나 우연히 맞지만,
    // 마지막 구역이 짧아 top 이 3900 이어도 바닥 규칙이 마지막을 고른다.
    expect(activeSectionIndex(tops, 3200, H, S)).toBe(6);
    expect(activeSectionIndex([0, 400, 900, 1500, 2100, 2700, 3900], 3200, H, S)).toBe(6);
  });

  it("구역 경계 직전·직후에서 한 칸씩 넘어간다", () => {
    expect(activeSectionIndex(tops, 779, H, S)).toBe(1); // 779 + 120 = 899 → 아직 두 번째
    expect(activeSectionIndex(tops, 780, H, S)).toBe(2); // 780 + 120 = 900 → 세 번째로
  });

  it("구역이 없으면 0 (빈 배열에 터지지 않는다)", () => {
    expect(activeSectionIndex([], 0, H, S)).toBe(0);
  });
});

describe("WEDLY 디자인 토큰", () => {
  // raw Tailwind 컬러 스케일 금지(CLAUDE.md rule #1) — 화면 폴더 전체를 훑는다.
  const RAW_COLOR =
    /(bg|text|border|from|to)-(green|amber|red|sky|blue|indigo|violet|pink|gray|slate|zinc|orange|yellow|lime|emerald|teal|cyan|rose|fuchsia)-(50|100|200|300|400|500|600|700|800|900)/;

  it("src/screen 의 화면 파일에 raw 색 클래스가 없다", () => {
    const dir = join(__dirname);
    const hits: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tsx")) continue;
      readFileSync(join(dir, name), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (RAW_COLOR.test(line)) hits.push(`${name}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

describe("발송하기 / 사용방법 탭", () => {
  it("화면 파일에 알약 탭 두 개가 있다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain('role="tablist"');
    expect(src).toContain('aria-label="화면 보기"');
    expect(src).toContain('label: "발송하기"');
    expect(src).toContain('label: "사용방법"');
  });

  it("주소에 구역 표식이 붙어 오면 사용방법 판을 열고 그 구역으로 내린다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain('hash.startsWith("#bulk-manual-")');
    expect(src).toContain('setView("manual")');
    expect(src).toContain("requestAnimationFrame");
    expect(src).toContain('scrollIntoView({ block: "start" })');
    expect(src).toContain("cancelAnimationFrame");
    expect(src).toContain('typeof window === "undefined"');
  });

  it("1단계 화면에서 탭 3개·붙여넣기·진행상태 고르개가 걷혔다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    // 되살리지 마라 — 대상은 「계약일이 적힌 고객」 하나로 고정됐다(2026-09-04 사장님 확정).
    for (const gone of ["MultiCheckSelect", "loadPasteNow", "checkedKeysOnLoad", "STATUS_PLACEHOLDER", "번호 붙여넣기"]) {
      expect(src, `옛 코드 「${gone}」`).not.toContain(gone);
    }
    // 고른 사람은 열쇠가 아니라 줄을 통째로 담는다 — 검색으로 좁혀도 명단에서 안 빠지게.
    expect(src).toContain("useState<Map<string, Target>>");
    expect(src).toContain("hiddenPickedCount");
  });

  it("고른 뒤 보낼 수 없게 바뀐 사람은 자동으로 빠지고, 왜 빠졌는지 알린다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain("reconcilePicked");
    expect(src).toContain("droppedSummary(droppedPicked)");
    expect(src).toContain("고른 명단에서 자동으로 뺐어요");
  });

  it("3단계 「받는 사람」에 자동 제외 건수를 붙이지 않는다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    // 그 숫자는 1단계에 보이는 목록에서 세는 값이라 검색어만 바꿔도 흔들린다 — 되살리지 마라.
    expect(src).not.toContain("자동 제외)");
  });

  it("파트너 앱 담당 잠금을 서버 값으로 켜고, 조회 실패로 풀지 않는다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    // 판단은 nextManagerLock 이 혼자 한다 — 화면이 Boolean(...) 으로 직접 정하면 실패 경로에서 잠금이 풀린다.
    // 응답 덩어리를 통째로 넘겨야 「칸이 없음」과 「false」를 함수가 구분한다
    expect(src).toContain("nextManagerLock(prev, { ok: true, data: j.data })");
    expect(src).not.toContain("lockedToMe: j.data?.lockedToMe");
    expect(src).toContain("nextManagerLock(prev, { ok: false })");
    expect(src).not.toContain("setLockedToMe(Boolean(");
    // 그릴지 말지도 함수가 정한다 — 「모름」에 고르개가 뜨는 것을 화면이 다시 판단하지 않게
    expect(src).toContain('managerControl(lockedToMe) === "picker"');
    expect(src).toContain("useState<ManagerLock>(null)");
  });

  it("발송 확인에 환불 고객 경고를 띄우고, 판정은 환불일 하나로 한다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain("refundedNotice(selected)");
    expect(src).toContain("명이 포함돼 있어요");
    // 표의 빨간 띠도 같은 함수를 본다 — 둘이 어긋나면 경고가 거짓말이 된다
    expect(src).toContain("isRefunded(t)");
    expect(src).not.toContain("Boolean(t.refundedAt)");
    // 전체 선택 동작은 그대로다 — 사장님은 「표시」만 요구했다
    expect(src).toContain("else for (const t of sendableTargets) next.set(keyOf(t), t);");
  });

  it("발송이 걸러낸 사람을 알리고, 같은 사실을 두 모양으로 그리지 않는다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    expect(src).toContain("skippedNotice(j.data?.skipped)");
    expect(src).toContain("명은 보내지 않았어요");
    // 새 응답에서는 옛 두 줄(수신거부 N · 범위 밖 N)을 그리지 않는다 — 두 번 빠진 것으로 읽힌다.
    expect(src).toContain("{!skipped && blockedCount > 0 && (");
    expect(src).toContain("{!skipped && sendOutOfScopeCount > 0 && (");
  });

  it("판 두 개를 늘 그리고(떼지 않고 숨김) 탭이 판을 가리킨다", () => {
    const src = readFileSync(join(__dirname, "BulkMessageScreen.tsx"), "utf8");
    // 판을 떼면 탭을 옮길 때마다 체크리스트·펼침·고르던 대상이 초기화된다 — 늘 그리고 hidden 으로 숨긴다.
    expect(src.match(/role="tabpanel"/g) ?? []).toHaveLength(2);
    expect(src).toContain('hidden={view !== "send"}');
    expect(src).toContain('hidden={view !== "manual"}');
    expect(src).toContain("aria-controls={v.paneId}");
  });
});
