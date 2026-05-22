/**
 * Conventional Commits — used by `nx release` to decide version bumps
 * (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major).
 *
 * @see https://www.conventionalcommits.org/
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // new feature → minor bump
        "fix", // bug fix → patch bump
        "perf", // performance → patch bump
        "refactor", // refactor (no behavior change)
        "docs", // docs only
        "test", // tests only
        "build", // build system, deps
        "ci", // CI config
        "chore", // tooling, misc — does not trigger release
        "style", // formatting (no code change)
        "revert", // revert a previous commit
      ],
    ],
    "scope-empty": [0],
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
