import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React 19 引入的严格规则，会将客户端组件中「mount 时异步拉取数据并 setState」
      // 的标准模式误报为 error（即使 setState 已位于 await 之后）。降级为 warn 保留提示。
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
