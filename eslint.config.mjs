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
    // `.next/**` is anchored at the project root, so it does not match a build directory any deeper. Next
    // writes routes.d.ts and validator.ts itself, with the `any`s and the ts-ignores that generated code
    // carries, and they were being linted wherever a second checkout had been built — 100 errors from a
    // worktree under .claude, in code no one here wrote and no one can fix.
    "**/.next/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
