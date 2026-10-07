import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["lib/**"] },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Rules `next/core-web-vitals` never enabled. Keeping them off makes this
      // a like-for-like replacement of the Next preset rather than a new lint
      // pass over code no ticket in this migration touches.
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-empty": "off",
      // Next's preset had this as a warning
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
