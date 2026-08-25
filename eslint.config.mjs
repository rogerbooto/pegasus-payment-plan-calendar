import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // No dynamic-code sinks, anywhere. All code is bundled and static.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      // Money is integer cents. Float parsing of money is banned repo-wide;
      // digit strings are converted with integer arithmetic (src/shared/money.ts).
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Money is integer cents. Use src/shared/money.ts." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Money is integer cents. Use src/shared/money.ts." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='Number']",
          message: "Number(x) coerces via float. Use integer digit-string parsing in src/shared/money.ts.",
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: "innerHTML is a banned sink. Build DOM with createElement/textContent.",
        },
        {
          selector: "AssignmentExpression[left.property.name='outerHTML']",
          message: "outerHTML is a banned sink. Build DOM with createElement/textContent.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: "insertAdjacentHTML is a banned sink. Build DOM with createElement/textContent.",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
