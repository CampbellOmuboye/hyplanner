import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // This workspace contains an experimental `next-app/` folder (separate Next project)
    // and its build artifacts should not be linted.
    "next-app/**",
    // Uploaded reference bundle for the Opportunity Map (not part of HyPlanner build).
    "src/**",
  ]),
]);

export default eslintConfig;
