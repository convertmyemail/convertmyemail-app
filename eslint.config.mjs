import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Allow `any` ONLY in API boundary code (Stripe, Supabase, webhooks)
  {
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Prevent console logs in production builds (optional but recommended)
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);