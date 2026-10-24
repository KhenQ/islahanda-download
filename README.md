# ISLAHANDA public Android download

Public portal: https://khenq.github.io/islahanda-download/

The Download button uses `https://github.com/KhenQ/islahanda-download/releases/latest/download/ISLAHANDA.apk`. Public visitors download directly from GitHub Releases without a Google account. Each versioned release contains an asset named `ISLAHANDA.apk`; older releases remain available.

The existing Android in-app updater continues using the versioned Google Drive APK and `latest-android.json`. Its publisher command does not change. The GitHub workflow checks the public Drive manifest approximately every 15 minutes (GitHub may delay scheduled runs), verifies APK checksum, package, version and pinned signing identity, and mirrors new approved releases. It can also be run immediately from Actions. No Google credentials or private signing keys are stored in this repository.

GitHub Pages publishes `main` at `/`. `index.html` includes its styles and artwork.
