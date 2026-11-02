# Actual browser route and code identity

Source baseline: private main11d2af35ce9bb665a0f3de3d695582c237020825, re-read from GitHub. All159 local text files matched remote before QA (remote additionally contains its snapshot manifest). Root rebuilt successfully before opening the UI; build logs/hash list are retained.

The built-in cloud desktop terminal runs the compiled server with an explicit cleared environment and no provider/model/database credentials: NODE_ENV=test, HOST127.0.0.1, PORT3000, APP_ORIGINhttp://localhost:3000, ALLOW_MAINNET_MEMORY_WRITES=false. Existing cloud Chromium actually reaches it. This route does not launch another browser, change organization policy or require a new saved cloud coding environment.

A later local UI validation fix changes Composer.tsx and adds rule-scope tests. It is not yet committed: do not label the patched code as exactly11d2af. Validation-fix/source-build-sha256.txt records the actual bytes;51tests with realPG and complete build passed. The patch gives meaningful scope-bound feedback and guards empty/decimal input before BigInt conversion while retaining server validation.

Core pre-patch12-step acceptance is recorded separately. Some screenshot calls captured an earlier pending frame; screenshot-content-notes.md explicitly indexes actual pixel content, not filenames. Final stable screenshot was visually checked. Ordinary same-origin iframe viewport testing is not DevTools/device emulation. Organization-disabled DevTools is not retried or bypassed.

Mainnet memory count remains0; fixture restore is not a real remote cold restore. Product Tatum/Walrus/model credentials remain absent. Browser proof does not change those gates.
