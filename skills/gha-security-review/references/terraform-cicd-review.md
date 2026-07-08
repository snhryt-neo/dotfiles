# Terraform CI/CD Review Notes

## Key distinction

OIDC is a credential delivery improvement, not a complete safety boundary.

Even with OIDC, a GitHub Actions job that can assume a broad cloud role and run `terraform apply` can convert a GitHub-side compromise into infrastructure compromise.

## Review model

Review Terraform workflows in two layers:

1. Terraform-specific risk
2. Generic GitHub Actions privilege-boundary risk

## Terraform-specific risk

Flag:

- `terraform apply -auto-approve`
- apply on `push` to `main`
- apply via `workflow_dispatch` without external approval
- apply via `/apply` comment or ChatOps
- broad AWS/GCP/Azure role in the same job
- plan/apply artifact not integrity-protected
- Terraform files can be modified before apply by untrusted or mutable actions
- third-party setup actions not SHA-pinned

Safer pattern:

- GitHub Actions runs tests and plan
- GitHub Actions may request an external deployment pipeline
- final apply happens in a dedicated deployment system
- manual approval occurs outside GitHub for high-impact production changes
- apply role is held by the external system, not by the GitHub Actions runner

Examples of external execution systems:

- HCP Terraform / Terraform Enterprise
- AWS CodePipeline + Manual approval + CodeBuild
- cloud-native deployment systems with independent approval and audit boundaries

## If apply remains in GitHub Actions

Require compensating controls:

- explicit risk acceptance
- protected branches
- CODEOWNERS for workflows and Terraform
- GitHub Environment required reviewers
- prevent self-review
- no admin bypass where feasible
- minimal job-level `permissions`
- OIDC trust policy restricted to repo, branch/ref, environment, and audience
- role permissions narrowed to specific resources
- all actions pinned to full-length SHA
- static analysis with zizmor / CodeQL actions scanning
- no PR head code execution in privileged jobs
- immutable plan/apply handoff or regenerate plan in trusted context
- audit logs and notifications

## Abstracted lesson

Any GitHub Actions workflow that can directly execute production-changing authority should be reviewed like a deployment control plane.

This includes:

- infrastructure changes
- package publishing
- release signing
- production DB migrations
- Kubernetes deployment
- IAM/secret changes
- data deletion or backfill jobs
