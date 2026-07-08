---
name: gha-security-review
description: Review GitHub Actions workflows for security risks, supply-chain hardening, and Terraform CI/CD privilege-boundary issues. Use when asked to review, create, or modify .github/workflows, reusable workflows, composite actions, or Terraform deployment automation.
---

# GitHub Actions Security Review Skill

## Scope

Use this skill to review:

- `.github/workflows/*.yml`
- `.github/workflows/*.yaml`
- reusable workflows called by `workflow_call`
- composite actions: `action.yml` / `action.yaml`
- Terraform CI/CD workflows that run `terraform plan` or `terraform apply`
- deployment workflows that obtain cloud credentials through OIDC or static secrets

Default stance: GitHub Actions workflows are production-grade code because they can access repository contents, tokens, secrets, deployment credentials, packages, caches, artifacts, and release processes.

## Priority of sources

When rules conflict, prioritize in this order:

1. Official GitHub documentation
2. Cloud provider official documentation, when cloud credentials are involved
3. OWASP GitHub Actions Security Cheat Sheet / OWASP CI/CD guidance
4. Tool output from `zizmor`, `pinact`, `actionlint`, CodeQL, Scorecard
5. Project-specific conventions
6. Community articles and examples

Use the Zenn references as review heuristics, not as sole authority.

## Files to read first

Before giving advice, inspect:

- `.github/workflows/*.yml`
- `.github/workflows/*.yaml`
- `.github/dependabot.yml`
- `.github/codeql/*.yml`, if present
- `.pinact.yml`, if present
- `action.yml` / `action.yaml` files, if present
- Terraform directories if workflows run `terraform`
- deployment scripts called by workflows

If the repository has many workflows, start from workflows triggered by:

- `pull_request_target`
- `workflow_run`
- `issue_comment`
- `pull_request`
- `push` to protected branches
- `release`
- `workflow_dispatch`
- `schedule`

Prioritize jobs that use:

- `permissions: write-all`
- `contents: write`
- `id-token: write`
- `actions: write`
- `packages: write`
- `deployments: write`
- `secrets.*`
- cloud credential actions
- `terraform apply`
- package publish / release steps
- self-hosted runners

## Required review flow

### 1. Inventory workflows

Summarize:

- workflow name
- trigger
- privileged jobs
- declared permissions
- secrets usage
- cloud credential usage
- third-party actions
- deployment / release / Terraform steps

### 2. Run automated checks when available

Run commands only when appropriate for the repository and environment.

#### zizmor

If `zizmor` is installed, run it.

Preferred:

```bash
zizmor .github/workflows
```

If GitHub token is available and repository context benefits from online checks, use authenticated mode according to the installed version's help.

If `zizmor` is not installed, do not fail the review. Mention that it can be installed and used for GitHub Actions static analysis.

Suggested install examples:

```bash
brew install zizmor
```

or:

```bash
uv tool install zizmor
```

or follow the official zizmor installation documentation.

Treat `zizmor` findings as strong evidence. Still review manually because static analysis can miss architectural risks.

#### pinact

Check whether third-party actions and reusable workflows are pinned to full-length commit SHA.

If any external `uses:` reference is not pinned to a full-length commit SHA and `pinact` is installed, run:

```bash
pinact run
```

Then review the diff before finalizing. Do not blindly accept changes if the repository has a policy against automated pinning.

If `pinact` is not installed, instruct the user to install it and run it.

Suggested install examples:

```bash
brew install suzuki-shunsuke/pinact/pinact
```

or follow the official pinact installation documentation.

For check-only mode:

```bash
pinact run -check
```

For offline syntactic check only:

```bash
pinact run -fix=false -no-api
```

When recommending pinning, preserve version comments if pinact adds them.

#### Optional checks

Use these if available or already configured:

```bash
actionlint
```

```bash
scorecard --repo=<owner>/<repo>
```

CodeQL with `language: actions` may also be recommended when GitHub Advanced Security or public repository scanning is available.

### 3. Manual review checklist

#### Token and permission minimization

Flag:

- missing top-level `permissions`
- `permissions: write-all`
- broad write permissions at workflow level
- `contents: write` when the job only needs read
- `id-token: write` at workflow level rather than job level
- permissions granted to jobs that do not need them

Prefer:

```yaml
permissions: {}
```

or:

```yaml
permissions:
  contents: read
```

Then elevate only per job.

For OIDC cloud auth, prefer job-level:

```yaml
permissions:
  contents: read
  id-token: write
```

Only on the job that actually obtains cloud credentials.

#### Dangerous triggers

Flag high risk:

- `pull_request_target` that checks out PR head code
- `pull_request_target` that runs build/test/install scripts from PR code
- `workflow_run` that consumes artifacts from untrusted workflows
- `issue_comment` / ChatOps that can trigger privileged behavior
- `workflow_dispatch` that accepts unvalidated user input and runs privileged commands

`pull_request_target` rule:

- It may be acceptable for label/comment/metadata-only operations.
- It is dangerous when it checks out or executes attacker-controlled PR code.
- If PR code must be tested, use `pull_request` with restricted secrets and restricted permissions.
- If privileged action is needed, split workflows and add an explicit approval boundary.

#### Third-party action supply-chain risks

Flag:

- unpinned third-party actions
- `uses: owner/action@main`
- `uses: owner/action@master`
- `uses: owner/action@v1` without SHA pinning
- reusable workflows not pinned to SHA
- obscure or unmaintained third-party actions
- actions from similarly named / confusable repositories
- Docker actions using mutable image tags

Prefer full-length commit SHA pinning. Use Dependabot/Renovate/pinact to keep pinned actions maintainable.

#### Secrets and credentials

Flag:

- plaintext secrets in workflow YAML
- secrets placed into broad `env`
- secrets echoed or interpolated into shell commands
- structured secrets that can evade masking
- credentials stored as long-lived cloud access keys
- secrets passed to reusable workflows via `secrets: inherit` without need
- `actions/checkout` with credential persistence when later steps run untrusted tools

Prefer:

- OIDC over static cloud credentials
- narrow cloud IAM roles
- short-lived credentials
- job-level secret scoping
- masking non-GitHub sensitive values with `::add-mask::`
- `persist-credentials: false` when checkout credentials are not needed after checkout

Example:

```yaml
- uses: actions/checkout@<sha>
  with:
    persist-credentials: false
```

#### Shell injection and untrusted input

Flag direct interpolation of untrusted contexts in `run`, especially:

- `${{ github.event.issue.title }}`
- `${{ github.event.comment.body }}`
- `${{ github.event.pull_request.title }}`
- `${{ github.head_ref }}`
- workflow inputs
- matrix values derived from user input

Avoid:

```yaml
run: echo "${{ github.event.pull_request.title }}"
```

Prefer passing values through environment variables and quoting in shell:

```yaml
env:
  PR_TITLE: ${{ github.event.pull_request.title }}
run: |
  printf '%s\n' "$PR_TITLE"
```

Still validate and constrain inputs before using them as commands, paths, flags, package names, or URLs.

#### Cache and artifact poisoning

Flag:

- privileged workflows restoring caches written by untrusted PR workflows
- broad cache keys
- artifacts from untrusted workflows consumed by privileged jobs
- release/deploy jobs using PR-produced artifacts without verification
- `workflow_run` chains that elevate trust without validation

Prefer:

- separate caches by trust boundary
- immutable artifact verification
- checksums/signatures/provenance
- rebuild from trusted source before release
- avoid consuming untrusted artifacts in privileged contexts

#### Self-hosted runners

Flag:

- public-repo PRs running on self-hosted runners
- privileged network access from runner
- long-lived credentials on runner
- shared mutable workspace
- runners not ephemeral
- missing egress controls

Prefer ephemeral isolated runners and avoid running untrusted code on self-hosted runners.

#### AI/agent workflows

Flag:

- AI agents running on untrusted PRs with write token
- agents with broad repository permissions
- agents that can modify workflow files without human review
- secrets exposed to agent prompts, logs, artifacts, or tool outputs
- comment-triggered AI workflows without actor allowlist

Prefer:

- read-only token for analysis
- no secrets for PR analysis
- explicit allowlist for privileged commands
- human approval before writes
- environment protections for deployment or write actions

## Terraform CI/CD review

Apply both a Terraform-specific lens and an abstract GitHub Actions security lens.

### Terraform-specific lens

`terraform plan` in GitHub Actions can be acceptable if it has no write-capable cloud credentials and does not expose sensitive plan output.

`terraform apply` directly from GitHub Actions is high risk for production or production-like infrastructure.

Flag especially:

- `terraform apply -auto-approve` in GitHub Actions
- GitHub Actions assuming an admin-like cloud role
- `id-token: write` plus broad cloud IAM permissions in the same job
- apply triggered by `push`, `workflow_dispatch`, `issue_comment`, or ChatOps
- apply after mutable third-party actions
- apply after untrusted code or scripts can modify Terraform files
- plan generated in one trust context and applied in another without integrity verification

Important distinction:

- OIDC improves credential delivery.
- OIDC does not by itself make it safe to give GitHub Actions strong infrastructure-changing permissions.

Prefer:

- GitHub Actions requests deployment only
- actual `terraform apply` runs in a dedicated deployment system or Terraform execution platform
- manual approval boundary outside GitHub when the blast radius is large
- narrow role from GitHub Actions, such as only starting an external pipeline
- HCP Terraform / Terraform Enterprise, or cloud-native deployment systems with manual approval
- environment protection as a useful but not sufficient GitHub-side control

If keeping apply in GitHub Actions, require a strong justification and recommend compensating controls:

- protected branches
- CODEOWNERS review for workflow and Terraform changes
- environment required reviewers
- prevent self-review
- block admin bypass if feasible
- job-level minimal permissions
- SHA pinning for all actions
- OIDC trust policy restricted by repository, branch/environment, and audience
- no PR code execution in privileged jobs
- artifact and plan integrity checks
- audit logging
- separation between plan and apply
- limited cloud IAM role blast radius

### Abstracted GitHub Actions lens from Terraform apply risk

Any workflow that converts GitHub permissions into external production-changing permissions must be treated like a deployment control plane.

This applies to:

- Terraform apply
- database migrations
- Kubernetes deploys
- package publishing
- production release creation
- cloud IAM changes
- secret rotation
- incident automation
- data deletion jobs

For these, review whether GitHub Actions can directly exercise the final authority. If yes, ask whether a stronger boundary is needed.

## Severity guidance

Use this severity model.

### Critical

- Untrusted PR code can run with secrets or write token
- `pull_request_target` checks out and executes PR head code
- production cloud credentials can be exfiltrated from untrusted code
- release/deploy can be hijacked by artifact/cache poisoning
- self-hosted runner runs untrusted public PR code with internal network access

### High

- `terraform apply` for production runs directly in GitHub Actions with broad cloud role
- broad `GITHUB_TOKEN` write permissions in workflows that run user-controlled input
- unpinned third-party actions in privileged workflows
- OIDC role trust not restricted by repo/branch/environment
- ChatOps trigger can invoke privileged commands without actor allowlist and approval

### Medium

- missing top-level minimal `permissions`
- secrets unnecessarily available to many steps
- no static analysis for workflows
- no Dependabot/Renovate updates for actions
- unverified artifacts crossing trust boundaries

### Low

- style issues
- minor hardening opportunities
- documentation gaps
- lack of comments for non-obvious security decisions

## Output format

When reviewing, produce:

1. Executive summary
2. Risk table
3. Required fixes
4. Recommended hardening
5. Tool results
6. Suggested patch or diff, when safe
7. Residual risk

Risk table columns:

- Severity
- File / job
- Finding
- Why it matters
- Recommendation
- Source

Be concise but concrete. Prefer patches over abstract advice.

## Patch policy

When editing workflows:

- preserve comments
- keep existing formatting as much as possible
- do not remove functional behavior without explaining the impact
- do not add broad permissions to make checks pass
- prefer job-level permissions over workflow-level permissions
- prefer explicit `if:` conditions and actor allowlists for privileged ChatOps
- prefer splitting untrusted and privileged workflows

## Reference notes

See:

- `references/github-actions-security-checklist.md`
- `references/terraform-cicd-review.md`
- `references/tooling.md`
