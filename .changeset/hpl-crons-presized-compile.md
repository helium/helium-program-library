---
"@helium/idls": patch
---

hpl-crons gains a `TooManyAccounts` error, so the generated IDL changes and the published types
need a republish.

`queue_end_epoch` compiles its task transactions with pre-sized buffers rather than
`tuktuk_program::compile_transaction`, which allocated 13,148 bytes to produce a 1,248-byte
transaction: two HashMaps growing from empty by doubling, plus a `remaining_accounts` Vec this
caller discards. The SBF heap is bump-allocated and never reuses freed memory, so every
intermediate table stayed resident, and the instruction had already exhausted that heap in
production once.

Indices and the privilege counts in a compiled transaction are `u8`. Past 255 accounts they would
truncate silently and point instructions at the wrong accounts rather than failing, so the new
error refuses that case instead. The end-epoch set uses 32.
