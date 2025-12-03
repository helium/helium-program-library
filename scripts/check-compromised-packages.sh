#!/bin/bash
# Check all yarn.deploy.lock files for compromised packages from DataDog IOCs
# Usage: ./scripts/check-compromised-packages.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

IOC_URL="https://raw.githubusercontent.com/DataDog/indicators-of-compromise/refs/heads/main/shai-hulud-2.0/consolidated_iocs.csv"
TEMP_CSV=$(mktemp)
trap "rm -f $TEMP_CSV" EXIT

echo "📥 Downloading compromised packages list from DataDog..."
curl -s "$IOC_URL" > "$TEMP_CSV"

if [ ! -s "$TEMP_CSV" ]; then
  echo "❌ Failed to download IOCs"
  exit 1
fi

echo "🔍 Checking all yarn.deploy.lock files for compromised packages..."
echo ""

# Find all deploy lockfiles
LOCKFILES=$(find packages -name "yarn.deploy.lock" -type f | sort)

if [ -z "$LOCKFILES" ]; then
  echo "⚠️  No yarn.deploy.lock files found"
  exit 0
fi

FOUND_COMPROMISED=0

# Use Python to properly parse CSV (handles quoted fields with commas)
python3 << PYTHON_SCRIPT
import csv
import sys
import os
import re
import glob

# Read compromised packages from CSV
compromised = {}
csv_file = "$TEMP_CSV"
lockfiles_dir = "$ROOT_DIR"

with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        package_name = row['package_name'].strip()
        package_versions = row['package_versions'].strip()
        
        # Split versions (comma-separated)
        versions = [v.strip() for v in package_versions.split(',')]
        compromised[package_name] = versions

# Find all lockfiles
lockfiles = glob.glob(os.path.join(lockfiles_dir, 'packages', '**', 'yarn.deploy.lock'), recursive=True)

found_compromised = False

for lockfile in sorted(lockfiles):
    package_dir = os.path.dirname(lockfile)
    package_name = os.path.basename(package_dir)
    
    try:
        with open(lockfile, 'r', encoding='utf-8') as f:
            content = f.read()
            
            # Check each compromised package
            for comp_pkg, comp_versions in compromised.items():
                for comp_version in comp_versions:
                    # Check for exact version match in lockfile
                    # Patterns in yarn.lock format:
                    # "package@npm:version": or "package@npm:^version":
                    # resolution: "package@npm:version"
                    # version: version (within the package entry)
                    
                    # Escape special regex characters
                    escaped_pkg = re.escape(comp_pkg)
                    escaped_ver = re.escape(comp_version)
                    
                    # Check for package entry with this version
                    # Match: "package@npm:version": or "package@npm:^version":
                    # Also check resolution and version fields
                    patterns = [
                        f'"{escaped_pkg}@npm:{escaped_ver}"',
                        f'"{escaped_pkg}@npm:' + re.escape('^') + f'{escaped_ver}"',
                        f'resolution: "{escaped_pkg}@npm:{escaped_ver}"',
                        f'version: {escaped_ver}\\b',
                    ]
                    
                    for pattern in patterns:
                        if re.search(pattern, content):
                            # Verify it's actually this package by checking nearby context
                            matches = list(re.finditer(pattern, content))
                            for match in matches:
                                # Check surrounding context to confirm it's the right package
                                start = max(0, match.start() - 100)
                                end = min(len(content), match.end() + 100)
                                context = content[start:end]
                                
                                # Make sure the package name appears in context
                                if comp_pkg in context or f'"{comp_pkg}@' in context:
                                    print(f"🚨 COMPROMISED PACKAGE FOUND:")
                                    print(f"   Package: {comp_pkg}")
                                    print(f"   Version: {comp_version}")
                                    print(f"   Location: {lockfile}")
                                    print(f"   Service: {package_name}")
                                    print()
                                    found_compromised = True
                                    break
                            
                            if found_compromised:
                                break
                    
                    if found_compromised:
                        break
                    
                    if found_compromised:
                        break
                if found_compromised:
                    break
    except Exception as e:
        print(f"⚠️  Error reading {lockfile}: {e}", file=sys.stderr)

if not found_compromised:
    print("✅ No compromised packages found in any yarn.deploy.lock files")
    sys.exit(0)
else:
    print("❌ Found compromised packages! Please review and update immediately.")
    sys.exit(1)
PYTHON_SCRIPT

