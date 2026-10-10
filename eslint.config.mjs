import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "public/monaco/**", "next-env.d.ts", ".data/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Full page loads are intentional after sign-in/out so server layouts re-read the session.
      "@next/next/no-location-assign-relative-destination": "off",
      // Data loading in effects is used deliberately in a few client components.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
export default config;
