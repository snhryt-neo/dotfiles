# GitHub Actions Security Checklist

## Baseline

- Treat CI/CD as production code.
- Set minimal `GITHUB_TOKEN` permissions.
- Prefer job-level permission elevation.
- Pin third-party actions and reusable workflows to full-length commit SHA.
- Avoid running untrusted code in privileged contexts.
- Prefer OIDC over static cloud credentials, but still minimize the cloud role.
- Review caches, artifacts, and workflow chaining across trust boundaries.
- Use static analysis for workflow files.

## High-risk patterns

### `pull_request_target`

Dangerous when combined with:

- checkout of PR head SHA
- running tests/builds/install scripts from PR code
- secrets
- write token
- package publish or deploy
- artifact upload that later feeds privileged workflows

Safer alternatives:

- use `pull_request` for untrusted code testing
- keep `pull_request_target` metadata-only
- split privileged actions into a separate approved workflow

### `workflow_run`

Dangerous when:

- privileged workflow downloads artifacts from untrusted workflow
- artifact contents are executed, deployed, or released
- cache/artifact integrity is not verified

### `issue_comment` / ChatOps

Dangerous when:

- any commenter can trigger privileged work
- command input is interpolated into shell
- actor association is not checked
- no environment approval exists

## Secrets

Avoid:

- structured JSON secrets where possible
- logging secrets
- broad workflow-level env secrets
- `secrets: inherit` by default
- long-lived cloud keys

Prefer:

- OIDC
- short-lived scoped credentials
- per-job secret exposure
- rotation on suspected exposure

## Third-party actions

Flag:

- `@main`, `@master`, branches, tags
- unmaintained or obscure actions
- confusable names
- mutable Docker tags
- privileged workflows using unpinned actions

Use pinact to pin actions and reusable workflows where feasible.

## Self-hosted runners

Avoid running untrusted code on self-hosted runners, especially for public repositories.

Require:

- ephemeral runner design
- network isolation
- no persistent credentials
- workspace cleanup
- egress controls
- strict repository allowlist
