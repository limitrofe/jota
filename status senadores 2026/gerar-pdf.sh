#!/bin/bash
# Gera PDF a partir do HTML usando Safari (nativo do macOS)
HTML_PATH="$1"
PDF_PATH="$2"

if [ -z "$HTML_PATH" ]; then
  HTML_PATH="/Users/jota/Desktop/projetos/infografia/senadores2026/status senadores 2026/pdf-print.html"
fi
if [ -z "$PDF_PATH" ]; then
  PDF_PATH="/Users/jota/Desktop/projetos/infografia/senadores2026/status senadores 2026/senadores-2026.pdf"
fi

# Converte para URL absoluta
FILE_URL="file://${HTML_PATH}"

osascript <<EOF
tell application "Safari"
    activate
    open location "$FILE_URL"
    delay 3
    tell application "System Events"
        keystroke "p" using {command down}
        delay 2
        keystroke return
        delay 1
        -- Save dialog
        keystroke "G" using {command down, shift down}
        delay 0.5
        set the clipboard to "$PDF_PATH"
        keystroke "v" using {command down}
        delay 0.5
        keystroke return
        delay 1
        keystroke return
    end tell
    delay 2
    close every window
end tell
EOF

echo "PDF salvo em: $PDF_PATH"
