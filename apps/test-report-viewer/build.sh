#!/usr/bin/env bash
# ── Report Viewer Build Script ────────────────────────────────────────────────
#
# Assembles the split source files (styles.css, body.html, jszip.vendor.js,
# app.js) into a single self-contained report_viewer.html.
#
# The output file is a standalone HTML document that works offline — all CSS,
# JS, and the JSZip library are inlined. This is necessary because the file
# gets bundled into report zip archives and opened directly in a browser
# without a web server.
#
# Usage:
#   cd e2e-tests/viewer && ./build.sh
#   # or from project root:
#   e2e-tests/viewer/build.sh
#
# Output: e2e-tests/viewer/report_viewer.html

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${SCRIPT_DIR}/report_viewer.html"

cat > "$OUT" <<'HEADER'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IA SDK E2E Report Viewer</title>
  <!-- Apply saved theme immediately to prevent flash-of-wrong-theme -->
  <script>
    (function() {
      var saved = localStorage.getItem('e2e-theme');
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.setAttribute('data-theme', saved);
      }
    })();
  </script>
HEADER

# Inline vendor JS
echo "  <script>" >> "$OUT"
cat "$SCRIPT_DIR/jszip.vendor.js" >> "$OUT"
echo "  </script>" >> "$OUT"

# Inline CSS
echo "  <style>" >> "$OUT"
cat "$SCRIPT_DIR/styles.css" >> "$OUT"
echo "  </style>" >> "$OUT"

echo "</head>" >> "$OUT"
echo "<body>" >> "$OUT"

# HTML body
cat "$SCRIPT_DIR/body.html" >> "$OUT"

# Inline app JS
echo "<script>" >> "$OUT"
cat "$SCRIPT_DIR/app.js" >> "$OUT"
echo "</script>" >> "$OUT"

echo "</body>" >> "$OUT"
echo "</html>" >> "$OUT"

echo "Built: $OUT ($(wc -l < "$OUT") lines)"
