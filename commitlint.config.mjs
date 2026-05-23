/**
 * Conventional Commits — used by `nx release` to decide version bumps
 * (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major).
 *
 * @see https://www.conventionalcommits.org/
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
