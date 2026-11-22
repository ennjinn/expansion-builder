#!/bin/sh
# Builds "Expansion Builder.app" next to this script. Usage: ./build.sh [--open]
set -e
cd "$(dirname "$0")"
APP="Expansion Builder.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Universal binary (Apple Silicon + Intel)
TMP=$(mktemp -d)
for ARCH in arm64 x86_64; do
  swiftc -O -swift-version 5 -target $ARCH-apple-macos13.4 mac/main.swift -o "$TMP/eb-$ARCH" \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers
done
lipo -create "$TMP/eb-arm64" "$TMP/eb-x86_64" -output "$APP/Contents/MacOS/ExpansionBuilder"
rm -rf "$TMP"
cp -R web "$APP/Contents/Resources/web"
[ -f mac/AppIcon.icns ] && cp mac/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Expansion Builder</string>
  <key>CFBundleDisplayName</key><string>Expansion Builder</string>
  <key>CFBundleIdentifier</key><string>local.hakai.expansionbuilder</string>
  <key>CFBundleExecutable</key><string>ExpansionBuilder</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.4</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
# Sign with the stable local certificate so macOS remembers folder-access answers across rebuilds
# (an ad-hoc signature changes every build, so the privacy prompts come back). Falls back to ad-hoc.
if security find-certificate -c "Hakai Local Signing" >/dev/null 2>&1; then
  codesign --force --sign "Hakai Local Signing" "$APP" >/dev/null 2>&1 || codesign --force --sign - "$APP" >/dev/null 2>&1 || true
else
  codesign --force --sign - "$APP" >/dev/null 2>&1 || true
fi
echo "Built $APP"
[ "$1" = "--open" ] && open "$APP"
exit 0
