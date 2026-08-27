import next from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config, because `npm run lint` runs bare `eslint` and ESLint 9 looks for
 * exactly this file. It was missing entirely: both `eslint` and
 * `eslint-config-next` were installed and the lint script was declared, but the
 * script exited 2 before reading a single line of source. A lint script that
 * cannot run is indistinguishable from a codebase with no lint problems, which
 * is how a sibling repo accumulated eleven of them unnoticed — two being refs
 * touched during render, which tsc and next build both pass.
 *
 * `core-web-vitals` is the stricter of the two Next presets; the TypeScript
 * preset adds the parser and the TS-aware rules on top.
 */
const config = [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  ...next,
  ...nextTypescript,
  {
    rules: {
      // Unused function arguments document a signature deliberately not used;
      // unused *variables* stay an error.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
