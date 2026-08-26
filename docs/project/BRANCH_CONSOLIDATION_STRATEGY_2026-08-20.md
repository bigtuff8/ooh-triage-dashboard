# OOH Triage Dashboard — Branch Consolidation Strategy (establish `main`)

**Date:** 2026-08-20
**Author:** Git investigation (read-only) for James
**Repo:** `C:\Users\james\OneDrive - Airedale Catering Equipment\Projects\Work\IOT OOH Dash\ooh-triage-dashboard`
**Remote:** `origin = https://github.com/bigtuff8/ooh-triage-dashboard.git`
**Jira:** OOHDASH-7 — "merge feature/go-live-sd586 → main" (there is currently **no `main` anywhere**)

---

## TL;DR (decision-ready)

- **Base `main` on local `feature/go-live-sd586` @ `0c63c0a`** (app v1.2.0, 36 commits). This is unambiguously the most advanced tip.
- **The history is 100% linear.** Every other branch (`master`, `feature/flow-amendments-v2`, `feature/live-build-v1`, and the `worktree-agent-*` ref) is a **strict ancestor** of go-live. Verified two independent ways: `git merge-base --is-ancestor` = YES for all, and `git log go-live..<branch>` + `git cherry` return **zero** unique commits.
- **Nothing is orphaned** by adopting go-live as `main`. No merge or cherry-pick is required. The other two feature branches are **fully superseded** and safe to archive/delete.
- **Only real action needed:** push the 8 unpushed local commits, create `main` from that tip, push it, set it as the GitHub default, then tidy stale branches.
- **Do NOT** let the untracked working-tree items (`.claude/`, kickoff docs, `.xlsx`, `.cmd`) get committed into `main`.

---

## 1. Branch inventory (after `git fetch --all --prune`)

| Ref | Tip | Committed date | package.json version | Subject |
|---|---|---|---|---|
| `feature/go-live-sd586` (local, HEAD) | `0c63c0a` | 2026-08-20 | **1.2.0** | zendesk: revert to standard API-token Basic auth |
| `origin/feature/go-live-sd586` | `73560c6` | 2026-07-27 | 1.2.0 | docs(v1.2.0): SD-586 go-live release notes |
| `feature/live-build-v1` (= origin) | `6498294` | 2026-07-14 | 1.1.0 | v1.1.0: OOH producer conformance + go-live prep |
| `feature/flow-amendments-v2` (= origin, = worktree-agent ref) | `6bfb17e` | 2026-03-28 | 0.3.0 (subject says v0.4.1) | v0.4.1: UX polish + GK Repairs chargeable warning |
| `master` (local only, NOT on origin) | `e42275d` | 2026-03-26 | 0.1.0 | v0.1.0: Initial OOH Triage Dashboard |

Remote `origin` currently has **three** `feature/*` branches only; `origin/HEAD` points at `feature/flow-amendments-v2` (the current GitHub default — this is stale and must move to `main`).

> **Version-string caveat (as warned):** the version numbers are NOT a reliable guide. `flow-amendments-v2`'s package.json still says `0.3.0` even though its commit subject claims v0.4.1. **The commit graph and dates are authoritative, not the version strings.** By the graph, go-live is newest by a wide margin.

## 2. True lineage (single straight line — no divergence)

```
e42275d  master                                   v0.1.0  (2026-03-26)
  │
  ├─ ... flow amendments ...
6bfb17e  flow-amendments-v2 = worktree-agent ref   v0.4.1  (2026-03-28)
  │
  ├─ ... consolidated app skeleton, Dockerfile/K8s, Playwright, producer conformance ...
6498294  live-build-v1                             v1.1.0  (2026-07-14)
  │
  ├─ 12fbfdf  F01/F02 public OIDC + AreaClaim[]
  ├─ 0ed6453  F03 keyless Cosmos via workload identity
  ├─ 1359fc0  F04 deployment manifest to prod
  ├─ 1277176  F07 unit tests
  ├─ 7d4b5f2  v1.2.0 SD-586 go-live build
73560c6  origin/feature/go-live-sd586             v1.2.0  (2026-07-27)
  │   ── 8 UNPUSHED LOCAL COMMITS BELOW ──
  ├─ 601fc44  OOHDASH-2 Zendesk Bearer (B7)
  ├─ 699afcd  OOHDASH-2 revert to classic Basic
  ├─ 068914e  build: exclude .claude worktrees from docker context
  ├─ 567745b  auth: surface OIDC provider error detail
  ├─ b46d374  auth: support confidential B2C client (OIDC_CLIENT_SECRET)
  ├─ c924d23  auth: convert B2C OIDC to implicit id_token sign-in (SD-586)
  ├─ 452bf02  zendesk: plain email:password Basic auth
0c63c0a  feature/go-live-sd586 (HEAD)             v1.2.0  (2026-08-20)  ← RECOMMENDED main base
```

`master → flow-amendments-v2 → live-build-v1 → go-live-sd586` is a clean fast-forward chain. There are **no merge commits and no forks**.

## 3. Unique work on the other branches — is anything orphaned?

**No.** For each branch, checked with both `git log go-live..<branch>` and `git cherry go-live <branch>`:

- **`feature/live-build-v1` (v1.1.0):** unique commits vs go-live = **NONE**. It is a strict ancestor; every one of its commits is already in go-live. **Fully superseded — safe to archive/delete.**
- **`feature/flow-amendments-v2` (v0.4.1):** unique commits vs go-live = **NONE**. Strict ancestor. **Fully superseded — safe to archive/delete.**
- **`master` (v0.1.0):** strict ancestor, the initial commit. Local-only, never on origin. Redundant once `main` exists.
- **`worktree-agent-aa5b172746c688582`:** points at exactly `6bfb17e` (identical to flow-amendments-v2). A leftover worktree ref, no unique work.

**Conclusion:** adopting go-live as `main` orphans nothing. No merge, no cherry-pick, no rebase required.

## 4. The 8 unpushed go-live commits (confirmed)

These sit on local `feature/go-live-sd586` ahead of `origin/feature/go-live-sd586` (verified: local is 8 ahead / 0 behind; origin tip is a strict ancestor, so a clean fast-forward push):

1. `601fc44` OOHDASH-2: switch Zendesk client to Authorization: Bearer (B7)
2. `699afcd` OOHDASH-2: keep Zendesk on classic Basic auth (revert Bearer)
3. `068914e` build: exclude .claude worktrees + nested node_modules from docker context
4. `567745b` auth: surface OIDC provider error detail on /auth/callback failure
5. `b46d374` auth: support confidential B2C client (send OIDC_CLIENT_SECRET when set)
6. `c924d23` auth: convert B2C OIDC to implicit id_token sign-in (SD-586)
7. `452bf02` zendesk: switch to plain email:password Basic auth
8. `0c63c0a` zendesk: revert to standard API-token Basic auth (email/token:apiToken)

Theme: the go-live smoke fixes — B2C OIDC auth hardening + Zendesk auth-mode iteration, plus a Docker build-context fix. These are exactly the smoke-run commits and belong in `main`.

## 5. Working-tree items that must NOT enter `main`

`git status --porcelain` shows these **untracked** items (none staged):

- `.claude/` (agent/session scratch — note commit `068914e` already excludes `.claude` worktrees from docker context; keep it out of git too)
- `OOH-INTEGRATION-DISCOVERY-KICKOFF.md`
- `fireup_down adjustments 1.xlsx`
- `spawn-ooh-integration-discovery.cmd`

Do **not** `git add .` when creating `main`. Creating `main` from an existing commit (below) does not touch the working tree, so these stay untracked. Consider adding them to `.gitignore` separately if they are persistent local artifacts.

## 6. Conflict risk

**None.** Because the branches are strictly linear ancestors, no folding-in is needed, so there are no conflicts to resolve. The push is a fast-forward; the `main` creation is a pointer at an existing commit.

---

## 7. PROPOSED command sequence (run later — NOT executed by this investigation)

> Read-only investigation only. The following is a proposal for James to run/approve. Assumes cwd is the repo root and `feature/go-live-sd586` is checked out at `0c63c0a`.

```bash
# 0. Safety: confirm state before doing anything
git fetch --all --prune
git status                       # expect only the 4 untracked items, nothing staged
git log --oneline -1             # expect 0c63c0a
git rev-list --left-right --count feature/go-live-sd586...origin/feature/go-live-sd586  # expect "8   0"

# 1. Push the 8 commits so origin/feature/go-live-sd586 catches up (fast-forward)
git push origin feature/go-live-sd586

# 2. Create main at the go-live tip (does not touch working tree)
git branch main feature/go-live-sd586        # main -> 0c63c0a

# 3. Publish main and set upstream
git push -u origin main

# 4. Set GitHub default branch to main
#    Preferred (gh CLI):
gh repo edit bigtuff8/ooh-triage-dashboard --default-branch main
#    (or set it in GitHub → Settings → Branches → Default branch)

# 5. OPTIONAL tidy — only AFTER confirming main is the default and green.
#    Delete superseded remote feature branches:
git push origin --delete feature/live-build-v1
git push origin --delete feature/flow-amendments-v2
#    Keep feature/go-live-sd586 on origin until OOHDASH-7 is closed, then optionally:
# git push origin --delete feature/go-live-sd586

#    Local cleanup:
git branch -d feature/live-build-v1 feature/flow-amendments-v2
git branch -D master                          # local-only v0.1.0, redundant once main exists
git worktree prune
git branch -D worktree-agent-aa5b172746c688582   # if the worktree is already removed
git remote set-head origin main               # refresh origin/HEAD locally
```

**Order rationale:** push first (so `main` and the go-live branch share the same published tip), then create/push `main`, then flip the default, then delete. Never delete a branch that is still the default (step 4 must precede step 5's flow-amendments-v2 deletion, since origin/HEAD currently points there).

## 8. Risks / unknowns to confirm with James

1. **Default-branch flip is a GitHub-side action** — needs repo admin (James is owner, so fine). No CI exists (`.github/workflows` absent), so creating `main` will **not** trigger any deploy; deployment stays manual. Confirm that's understood.
2. **Deleting remote feature branches** — recommend keeping `feature/go-live-sd586` on origin until OOHDASH-7 is verified closed; delete the other two now (they're strictly superseded). Confirm James wants them removed vs. kept as historical markers.
3. **`master` is local-only** — it is not on origin and is just the v0.1.0 initial commit, already in `main`'s history. Safe to delete locally; nothing to do remotely.
4. **Version string vs tag hygiene** — package.json is at 1.2.0 on the go-live tip, but there are **no git tags**. Suggest tagging the `main` tip `v1.2.0` at creation for a clean release marker (optional): `git tag -a v1.2.0 -m "OOH Triage Dashboard v1.2.0 (SD-586 go-live)" && git push origin v1.2.0`.
5. **Untracked artifacts** (`.claude/`, kickoff md, xlsx, cmd) — confirm none of these should be tracked; recommend `.gitignore` entries so they don't drift into future commits.
