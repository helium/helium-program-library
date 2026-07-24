---
"@helium/helium-vote-service": patch
---

Resolve positions_with_vetokens.sql and the helium-vote-proxies dir relative to the package root instead of keying off NODE_ENV and cwd, fixing ENOENT crash when running the compiled build without NODE_ENV=production
