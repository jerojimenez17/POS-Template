import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Upstream merge introduced test suites written with looser upstream typing
    // conventions (loose mocks/stubs typed as `any`). Relax no-explicit-any ONLY
    // inside the test trees — app code under src/ (outside __tests__) keeps full
    // strictness, and upstream test files stay unedited. Covers every test
    // location in the repo: src/__tests__, nested src/**/__tests__, tests/,
    // ai/features suites, and e2e specs.
    files: [
      "src/**/__tests__/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "ai/**/*.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
