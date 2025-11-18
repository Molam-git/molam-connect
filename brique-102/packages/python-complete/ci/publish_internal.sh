#!/usr/bin/env bash
#
# Internal PyPI Publishing Script
#
# Builds wheel and publishes to internal PyPI (Artifactory/Nexus).
# Requires environment variables:
#   - TWINE_REPO_URL: Internal PyPI repository URL
#   - TWINE_USERNAME: PyPI username (default: __token__)
#   - TWINE_PASSWORD: PyPI password/token (required)
#
# Usage:
#   ./ci/publish_internal.sh
#
# Example:
#   TWINE_REPO_URL="https://pypi.internal.molam.io" \
#   TWINE_PASSWORD="token_xyz" \
#   ./ci/publish_internal.sh

set -euo pipefail

echo "==> Molam Python SDK - Internal PyPI Publishing"
echo ""

# Validate environment variables
if [ -z "${TWINE_REPO_URL:-}" ]; then
  echo "ERROR: TWINE_REPO_URL environment variable is not set"
  echo "Example: TWINE_REPO_URL=https://pypi.internal.molam.io"
  exit 1
fi

if [ -z "${TWINE_PASSWORD:-}" ]; then
  echo "ERROR: TWINE_PASSWORD environment variable is not set"
  echo "Set it to your PyPI API token"
  exit 1
fi

TWINE_USERNAME="${TWINE_USERNAME:-__token__}"

echo "Repository URL: $TWINE_REPO_URL"
echo "Username: $TWINE_USERNAME"
echo ""

# Upgrade build tools
echo "==> Upgrading build tools..."
python -m pip install --upgrade pip build twine --quiet

# Clean previous builds
if [ -d "dist" ]; then
  echo "==> Cleaning previous builds..."
  rm -rf dist/
fi

# Build wheel and source distribution
echo "==> Building wheel..."
python -m build

# List built artifacts
echo ""
echo "==> Built artifacts:"
ls -lh dist/
echo ""

# Upload to internal PyPI
echo "==> Publishing to internal PyPI..."
python -m twine upload \
  --repository-url "$TWINE_REPO_URL" \
  --username "$TWINE_USERNAME" \
  --password "$TWINE_PASSWORD" \
  --non-interactive \
  dist/*

echo ""
echo "==> Successfully published to $TWINE_REPO_URL"
echo ""
echo "Install with:"
echo "  pip install --index-url $TWINE_REPO_URL molam-python-sdk"
