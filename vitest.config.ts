import { defineConfig } from "vitest/config";

// tsconfig 의 jsx 는 "preserve"(Next 가 변환) — 그대로면 vitest 가 옛 방식(React.createElement)으로
// 바꿔 「React is not defined」로 죽는다. 시험에서만 새 방식으로 바꾼다.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"], environment: "node" },
});
