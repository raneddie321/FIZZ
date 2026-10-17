#!/usr/bin/env bash
# FIZZ DEV: picks the key that signs the release APK and AAB.
#  1. Your key, from the repository secrets ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD,
#     ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD (Settings → Secrets and variables → Actions).
#  2. Otherwise, in a private repository, a new key made for you. It's in the "android-signing-key"
#     download: save it and add it as the secrets above — Google Play needs the same key for every update.
#  3. Otherwise (public repository) the release files are unsigned; the debug APK still installs.
set -euo pipefail
mkdir -p .fizz-out/key
KS="$PWD/.fizz-build/release.keystore"
if [ -n "${KEYSTORE_BASE64:-}" ]; then
  echo "$KEYSTORE_BASE64" | base64 -d > "$KS"
  SP="${KEYSTORE_PASSWORD:-}"; KA="${KEY_ALIAS:-}"; KP="${KEY_PASSWORD:-${KEYSTORE_PASSWORD:-}}"
  echo "Signing with your key from the repository secrets."
elif [ "${PRIVATE_REPO:-false}" = "true" ]; then
  SP="$(openssl rand -hex 16)"; KA="fizz"; KP="$SP"
  echo "::add-mask::$SP"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias "$KA" -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$SP" -keypass "$KP" -dname "CN=${APP_NAME:-FIZZ app}" >/dev/null
  cp "$KS" .fizz-out/key/release.keystore
  base64 -w0 "$KS" > .fizz-out/key/ANDROID_KEYSTORE_BASE64.txt
  cat > .fizz-out/key/README.txt <<EOF
This is the key that signed your app. Keep it safe and private.
To sign future builds with the same key (Google Play needs this), add these repository secrets
on GitHub → Settings → Secrets and variables → Actions:

ANDROID_KEYSTORE_BASE64 = the contents of ANDROID_KEYSTORE_BASE64.txt
ANDROID_KEYSTORE_PASSWORD = $SP
ANDROID_KEY_ALIAS = $KA
ANDROID_KEY_PASSWORD = $KP
EOF
  echo "Made a new signing key (see the android-signing-key download)."
else
  echo "No signing key: the release APK and AAB are unsigned. The debug APK installs on any phone."
  exit 0
fi
printf -- '-Pandroid.injected.signing.store.file=%s -Pandroid.injected.signing.store.password=%s -Pandroid.injected.signing.key.alias=%s -Pandroid.injected.signing.key.password=%s' \
  "$KS" "$SP" "$KA" "$KP" > .fizz-build/signing-args
