---
"@helium/idls": patch
"@helium/helium-admin-cli": patch
---

Size the dc-auto-top HNT refill to what it can pay for and finish in one slot, and stop an update from stranding the leg. `top_off_hnt_v0` buys `min(gap, balance / swap amount, ceil(slot seconds / interval))` orders instead of skipping the whole DCA when the balance is short, and prices HNT against the pinned feed constant rather than the stored field, `update_auto_top_off_v0` leaves both task fields on the "nothing scheduled" sentinel after dequeuing, takes `dca_mint` and `dca_mint_account` as an optional pair and refuses a mint change while the account it spends from still holds a balance, and no longer writes `hnt_price_oracle`; `UpdateAutoTopOffArgsV0` drops that field and `TopOffDcV0` drops its `has_one`, since data-credits pins the feed itself.
