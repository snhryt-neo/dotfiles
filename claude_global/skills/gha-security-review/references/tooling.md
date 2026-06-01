# Tooling Notes

## pinact

Purpose:

- Pin GitHub Actions and reusable workflows to full-length commit SHA.
- Check whether actions are pinned.
- Update pinned versions.
- Preserve maintainability through version comments.

Useful commands:

```bash
pinact run
```

```bash
pinact run -check
```

```bash
pinact run -fix=false -no-api
```

Notes:

- `pinact run` edits workflow files by default.
- Review the diff after running.
- `-no-api` can only check 40-character SHA syntax; it cannot resolve tags to SHAs.

## zizmor

Purpose:

- Static analysis for GitHub Actions workflows.
- Detects common security issues such as template injection, credential persistence/leakage, excessive permissions, and suspicious git references.

Useful command:

```bash
zizmor .github/workflows
```

If unavailable, recommend installation rather than blocking manual review.

## OpenSSF Scorecard

Purpose:

- Repository-level supply-chain security posture check.
- Useful for broader maturity review, including token permissions and pinned dependencies.

Example:

```bash
scorecard --repo=<owner>/<repo>
```

## actionlint

Purpose:

- Syntax and semantic linting for GitHub Actions workflows.
- Complements security-oriented tools.

Example:

```bash
actionlint
```

## CodeQL Actions scanning

When available, recommend CodeQL configured to scan GitHub Actions workflows using `language: actions`.
