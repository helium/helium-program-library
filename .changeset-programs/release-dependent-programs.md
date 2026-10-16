---
data-credits: none
fanout: none
helium-sub-daos: none
lazy-distributor: none
lazy-transactions: none
mobile-entity-manager: none
rewards-oracle: none
voter-stake-registry: none
welcome-pack: none
---

Mark the workspace dependency changes these programs picked up since their last tag as reviewed. None of them changes their binaries' behavior. `data-credits` and `helium-sub-daos` see only the anchor-lang 0.31.2 pin in `pyth_solana_receiver_sdk`; that release changes doc comments only. The `helium-entity-manager`, `lazy-distributor` and `mini-fanout` changes the others pick up stay inside those programs' own handlers, add error variants, or remove an instruction the dependents never call. No account or args type the dependents use changed. `fanout`, `lazy-distributor`, `lazy-transactions` and `voter-stake-registry` change only through the anchor 0.31.2 lock bump, which has no code change.
