import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-native/**", "**/build/**", "test-results/**", "**/node_modules/**", "**/.wrangler/**", "apps/client/android/**", "tools/**", "**/*.config.*", "playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": ["error", { selector: "CallExpression[callee.name='parseFloat']", message: "Use strict decimal parsing for money (packages/domain/src/money.ts)." }]
    }
  }
);
