# @helium/automation-hooks

React hooks for Helium's on-chain automation (mini-fanouts, tuktuk tasks, dc-auto-top, etc.). Wraps the underlying SDKs so UIs can read/modify scheduled tasks and recurring distributions without wiring Anchor clients themselves.

Note that we are moving to an API model, and most of these hooks have an equivalent in blockchain-api that should be used instead.