#!/bin/bash
# Regenerate yarn.deploy.lock files with workspace dependencies resolved to npm versions
# Usage: ./scripts/regenerate-deploy-lockfiles.sh [package-name]
#   If package-name is provided, only regenerate that package's lockfile
#   Otherwise, regenerate all packages that have Dockerfiles

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Find all packages with Dockerfiles
find_packages_with_dockerfile() {
  find packages -name "Dockerfile" -type f | sed 's|/Dockerfile||' | sort
}

regenerate_package_lockfile() {
  local PACKAGE_DIR="$1"
  local PACKAGE_NAME=$(basename "$PACKAGE_DIR")
  
  if [ ! -f "$PACKAGE_DIR/package.json" ]; then
    echo "⚠️  Skipping $PACKAGE_NAME: no package.json found"
    return 0
  fi
  
  echo "🔄 Regenerating deploy lockfile for $PACKAGE_NAME..."
  
  # Create a temporary directory for generating the lockfile
  TEMP_DIR=$(mktemp -d)
  
  # Copy package.json
  cp "$PACKAGE_DIR/package.json" "$TEMP_DIR/package.json"
  
  # Copy existing deploy lockfile if it exists (for faster regeneration)
  if [ -f "$PACKAGE_DIR/yarn.deploy.lock" ]; then
    cp "$PACKAGE_DIR/yarn.deploy.lock" "$TEMP_DIR/yarn.deploy.lock"
  fi
  
  # Copy yarn config
  mkdir -p "$TEMP_DIR/.yarn/plugins"
  cp "$ROOT_DIR/.yarnrc.yml" "$TEMP_DIR/.yarnrc.yml"
  cp -r "$ROOT_DIR/.yarn/releases" "$TEMP_DIR/.yarn/releases"
  if [ -d "$ROOT_DIR/.yarn/plugins" ]; then
    cp -r "$ROOT_DIR/.yarn/plugins"/* "$TEMP_DIR/.yarn/plugins/" 2>/dev/null || true
  fi
  
  # Change to temp directory and install
  cd "$TEMP_DIR"
  
  export YARN_LOCKFILE_FILENAME=yarn.deploy.lock
  # Use --immutable if lockfile exists, otherwise just install
  if [ -f "yarn.deploy.lock" ]; then
    yarn install --immutable >/dev/null 2>&1 || yarn install >/dev/null 2>&1
  else
    yarn install >/dev/null 2>&1
  fi
  
  # Copy generated lockfile back before cleanup
  local LOCKFILE_COPIED=0
  if [ -f "yarn.deploy.lock" ]; then
    cp yarn.deploy.lock "$PACKAGE_DIR/yarn.deploy.lock"
    LOCKFILE_COPIED=1
  fi
  
  # Cleanup temp directory
  cd "$ROOT_DIR"
  rm -rf "$TEMP_DIR"
  
  if [ $LOCKFILE_COPIED -eq 1 ]; then
    echo "✅ Regenerated $PACKAGE_NAME/yarn.deploy.lock"
    return 0
  else
    echo "❌ Failed to generate lockfile for $PACKAGE_NAME"
    return 1
  fi
}

if [ -n "$1" ]; then
  # Regenerate specific package
  PACKAGE_DIR="packages/$1"
  if [ ! -d "$PACKAGE_DIR" ]; then
    echo "❌ Package $1 not found in packages/"
    exit 1
  fi
  if [ ! -f "$PACKAGE_DIR/Dockerfile" ]; then
    echo "⚠️  Package $1 doesn't have a Dockerfile"
    exit 1
  fi
  regenerate_package_lockfile "$PACKAGE_DIR"
else
  # Regenerate all packages with Dockerfiles
  echo "🔍 Finding packages with Dockerfiles..."
  PACKAGES=$(find_packages_with_dockerfile)
  
  if [ -z "$PACKAGES" ]; then
    echo "⚠️  No packages with Dockerfiles found"
    exit 0
  fi
  
  echo "📦 Found $(echo "$PACKAGES" | wc -l | tr -d ' ') package(s) to regenerate"
  echo ""
  
  FAILED=0
  for PACKAGE_DIR in $PACKAGES; do
    if ! regenerate_package_lockfile "$ROOT_DIR/$PACKAGE_DIR"; then
      FAILED=$((FAILED + 1))
    fi
    echo ""
  done
  
  if [ $FAILED -eq 0 ]; then
    echo "✨ All deploy lockfiles regenerated successfully!"
  else
    echo "❌ Failed to regenerate $FAILED package(s)"
    exit 1
  fi
fi

