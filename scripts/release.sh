#!/usr/bin/env bash
#
# release.sh — the ONE way to cut a live release of the OOH Dashboard.
#
# Why this exists: a release must ALWAYS iterate the app version. The image tag already
# iterates per commit (git sha), but the app's self-reported version (package.json ->
# /healthz.version) is what testers/ops read. This script bumps that version every time,
# so a release can never silently ship the same version twice.
#
# What it does (in order):
#   1. Guards: on main, clean tree, synced with origin.
#   2. npm version <patch|minor|major> — bumps package.json, commits "vX.Y.Z", tags it.
#   3. Pushes main + the tag.
#   4. Builds the image in ACR, tagged with BOTH the version and the git sha.
#   5. Rolls it out with `kubectl set image` (env is UNTOUCHED — WRITES_DISABLED stays as-is).
#   6. Verifies /healthz reports the new version and writesDisabled:true.
#
# SAFETY: this never flips writes. It uses `set image` (not `apply`), so it cannot change
# WRITES_DISABLED / SMS_PROVIDER / any env. The write-flip (OOHDASH-19) is a separate,
# deliberate manifest change and is NOT part of a routine release.
#
# Usage:  scripts/release.sh [patch|minor|major]   (default: patch)
# Prereqs: az logged in (ACR Task Runner), KUBECONFIG=~/.kube/ooh.yaml (deployer-ooh).
set -euo pipefail

BUMP="${1:-patch}"
case "$BUMP" in patch|minor|major) ;; *) echo "usage: $0 [patch|minor|major]" >&2; exit 2 ;; esac

REGISTRY="apitechhub"
IMAGE="ooh-dashboard"
NS="iot-services"
DEPLOY="ooh-dashboard"
URL="https://ooh.airedale-group.io"
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/ooh.yaml}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "==> Guards"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "ERROR: releases are cut from main (on '$branch')." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "ERROR: working tree not clean." >&2; exit 1; }
git fetch origin --quiet
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "ERROR: local main not in sync with origin/main." >&2; exit 1; }

prev_tag="$(kubectl -n "$NS" get deploy "$DEPLOY" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo '(unknown)')"
echo "    current live image (rollback ref): $prev_tag"

echo "==> Bumping version ($BUMP)"
new_ver="$(npm version "$BUMP" -m 'release v%s')"   # e.g. v1.3.0 — commits + tags
echo "    new version: $new_ver"
git push origin main --quiet
git push origin "$new_ver" --quiet

sha="$(git rev-parse --short HEAD)"
echo "==> Building image $IMAGE:$sha (+ $new_ver) in ACR"
az acr build --registry "$REGISTRY" --image "$IMAGE:$sha" --image "$IMAGE:$new_ver" --image "$IMAGE:latest" .

echo "==> Rolling out (set image — env untouched, WRITES_DISABLED unchanged)"
kubectl -n "$NS" set image deployment/"$DEPLOY" "$DEPLOY=$REGISTRY.azurecr.io/$IMAGE:$sha"
kubectl -n "$NS" rollout status deployment/"$DEPLOY" --timeout=180s

echo "==> Verify"
kubectl -n "$NS" get deploy "$DEPLOY" -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}' | grep -iE 'WRITES_DISABLED|SMS_PROVIDER'
for i in 1 2 3 4 5; do
  body="$(curl -s -m 15 "$URL/healthz" || true)"
  ver="$(printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{console.log("")}})' 2>/dev/null || echo '')"
  wd="$(printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).writesDisabled)}catch{console.log("")}})' 2>/dev/null || echo '')"
  if [ -n "$ver" ]; then
    echo "    /healthz version=$ver writesDisabled=$wd"
    [ "v$ver" = "$new_ver" ] || echo "    WARN: /healthz version ($ver) != released ($new_ver) — may still be rolling."
    [ "$wd" = "true" ] || echo "    *** WARNING: writesDisabled is NOT true — investigate before continuing. ***"
    break
  fi
  sleep 5
done

echo "==> Released $new_ver. Rollback: kubectl -n $NS set image deployment/$DEPLOY $DEPLOY=$prev_tag"
