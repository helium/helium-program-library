---
"@helium/idls": patch
---

Derive the data-only tree fee in helium-entity-manager's `issue_data_only_entity_v0` from the Rent sysvar at issue time: `ceil(Rent::get().minimum_balance(new_tree_space) / 2^new_tree_depth)`. The fee was `DataOnlyConfigV0.new_tree_fee_lamports`, fixed at DAO bootstrap under the old rent and changeable by no instruction, so as SIMD-0437 lowers rent it over-collects from onboarding wallets (69,215 stored vs 50,520 derived at mainnet rent in September 2026, about 10x at the last step) and strands the surplus in the tree escrow, whose only outflow is the exact rent reimbursement at tree rotation. The fee is priced at issue-time rent. If rent rises before rotation, the escrow's surplus covers the difference; if it does not, `update_data_only_tree_v0`'s reimbursement fails and issuance stops once the tree fills until the escrow is topped up. `new_tree_fee_lamports` and the `new_tree_fee_lamports` init argument keep their layout and are no longer read.
