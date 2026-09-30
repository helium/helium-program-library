---
"@helium/spl-utils": patch
---

Regenerate the bundled helium_entity_manager IDL that `fetchBackwardsCompatibleIdl` falls back to, so it matches the program (adds `serial` on `WifiInfoV0`), and add an `update-hem-idl` script that rebuilds it from the program.
