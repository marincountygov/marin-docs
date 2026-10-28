#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
SHELL_DIR="$ROOT_DIR/../marin-app-shell"
RUN_BROWSER=0
case "${1:-}" in
  '') ;;
  --browser) RUN_BROWSER=1 ;;
  -h|--help)
    printf 'Usage: bash scripts/check.sh [--browser]\n'
    exit 0
    ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
command -v python3 >/dev/null 2>&1 || { printf 'ERROR: Python 3 is required.\n' >&2; exit 1; }

bash -n "$ROOT_DIR/scripts/check.sh"
if [[ -f "$SHELL_DIR/scripts/install.py" ]]; then
  python3 "$SHELL_DIR/scripts/install.py" --check "$ROOT_DIR"
else
  printf 'SKIP: marin-app-shell is not next to this repo; shell integrity was not checked.\n' >&2
fi
# The audit ships with the shell release; use the installed copy so it matches the installed shell.
if [[ -f "$ROOT_DIR/vendor/marinos/audit-buttons.py" ]]; then
  python3 "$ROOT_DIR/vendor/marinos/audit-buttons.py" "$ROOT_DIR" --fail
else
  printf 'SKIP: vendor/marinos/audit-buttons.py is missing (shell older than 1.18.0); the button audit was not run.\n' >&2
fi
# Lists copy, download, file reading and upload code the app does itself; it must list nothing.
if [[ -f "$ROOT_DIR/vendor/marinos/audit-shared-helpers.py" ]]; then
  python3 "$ROOT_DIR/vendor/marinos/audit-shared-helpers.py" "$ROOT_DIR" --fail
fi

if command -v node >/dev/null 2>&1; then
  node --check "$ROOT_DIR/scripts/build-pmr-guide.js"
  node --check "$ROOT_DIR/scripts/build-guide.js"
  node --check "$ROOT_DIR/scripts/stamp-updated-dates.js"
  node --check "$ROOT_DIR/sop/flow-view.js"
  node --check "$ROOT_DIR/sop/sop-actions.js"
  python3 "$ROOT_DIR/tests/test_generated.py"
else
  printf 'SKIP: Node is unavailable; the generator and generated pages were not checked.\n' >&2
fi

if [[ "$RUN_BROWSER" == 1 ]]; then
  python3 "$ROOT_DIR/tests/browser_docs.py"
else
  printf 'SKIP: Browser tests not requested; run with --browser to include them.\n'
fi
printf 'Requested checks completed successfully.\n'
