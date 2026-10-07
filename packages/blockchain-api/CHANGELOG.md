# Change Log

## 0.12.3

### Patch Changes

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`d48d673`](https://github.com/helium/helium-program-library/commit/d48d673b802be2db71b2b8807edad8f98048743c) Thanks [@bryzettler](https://github.com/bryzettler)! - Charge the setup rent once on a first-time `createAutomation`. The cron job transfer no longer carries the base rent that `init_entity_claim_cron_v0` already takes from the wallet, so a first setup moves that much less SOL. `createAutomation` now prices its transfers and balance check with the same helper as `getFundingEstimate`.

  Count the task queue's min crank reward that `init_entity_claim_cron_v0` pays its schedule task. `getFundingEstimate`, `getAutomationStatus` and `createAutomation` add it to `rentFee` (and so to `totalSolNeeded`, the balance check and `estimatedSolFee`) when the wallet has no automation yet; existing automations are unchanged.

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`b5e82d0`](https://github.com/helium/helium-program-library/commit/b5e82d004a5bcf3bfb8d0719f8c153c719396211) Thanks [@bryzettler](https://github.com/bryzettler)! - Charge the recipient rent once in `getFundingEstimate` and `getAutomationStatus`. When the PDA wallet balance covered its own rent and the HNT ATA rent but only part of the recipient rent, `recipientFee` added the covered part (balance minus PDA and ATA rent) on top of the PDA wallet funding, which already carries every recipient's rent. `recipientFee` is now always 0, and `totalSolNeeded` drops by that amount for wallets in that range; other estimates are unchanged.

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`f766451`](https://github.com/helium/helium-program-library/commit/f7664510c368e1c9f545ff11cc6715c23699bb6b) Thanks [@bryzettler](https://github.com/bryzettler)! - Add an optional `schedule` input to `getFundingEstimate`, the same preset or raw crontab `createAutomation` takes. With it, the setup rent prices the cron job at that crontab's length, as `createAutomation` does, so a raw crontab over 15 characters is no longer under-quoted. Without it, the estimate is unchanged and still assumes the longest preset (15 characters).

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`0608a58`](https://github.com/helium/helium-program-library/commit/0608a582e1223a38f7192d775c7b7feae50aff06) Thanks [@bryzettler](https://github.com/bryzettler)! - Count the 0.01 SOL task-return funding once for a first-time automation: `getFundingEstimate` and `getAutomationStatus` no longer add it to `rentFee`, since the cron job funding already carries it. `totalSolNeeded` drops by 0.01 SOL for wallets without an automation. The reserve is now held back until the cron program owns `task_return_account_1`, not merely until the account exists. For an existing cron job whose task-return account is still system-owned (it has not completed a run yet), 0.01 SOL of the cron balance no longer counts as claim funding. `getAutomationStatus` reports fewer remaining claims for it. When its cron balance is below rent plus 0.01 SOL, `getFundingEstimate` and `fundAutomation` add the gap, so `totalSolNeeded` and the cron transfer rise by up to 0.01 SOL; otherwise `totalSolNeeded` does not rise. Other existing automations are unchanged.

  `getAutomationStatus` now prices `recipientFee` the way `getFundingEstimate` does, instead of the full recipient rent, which the PDA wallet funding in operationalSol already carries when the wallet lacks it, so its `rentFee`, `recipientFee` and `operationalSol` sum to the estimate's `totalSolNeeded` at duration 0.

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`480ebca`](https://github.com/helium/helium-program-library/commit/480ebca0a9a8ee7591c1bb3fa4ad25833dfc51e7) Thanks [@bryzettler](https://github.com/bryzettler)! - Fund the cron job `createAutomation` re-creates on a schedule change for the whole requested duration at the claim count the old cron job had; claims added afterwards shorten it. The teardown refunds the old cron job, so the new one starts with only its rent; it was priced from the old balance and often got no funding at all, then stood down at its first run. `getFundingEstimate` with a different `schedule` now prices the same re-created cron job, and the wallet balance check counts the old cron job's refund.

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`78ac420`](https://github.com/helium/helium-program-library/commit/78ac420643be59ffad3628c85d4a06962428daa9) Thanks [@bryzettler](https://github.com/bryzettler)! - Gate data-only issue and onboard on the rent the cluster charges: issue now requires the KeyToAssetV0 rent plus the stored tree fee, onboard the IoT or mobile hotspot info rent, on top of transaction fees.

  Insufficient-SOL errors on hotspot info updates, delegation, reward claims and token transfers now say the balance must cover account rent as well as transaction fees.

  `getRentLamports` now rejects, and does not cache, a rent of 0 from an RPC error body; the request fails instead of pricing rent at 0 for an hour.

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`b74a18f`](https://github.com/helium/helium-program-library/commit/b74a18f01a307f1d7796b909e9f3139544cd5690) Thanks [@bryzettler](https://github.com/bryzettler)! - `issueDataOnlyHotspot` now returns an `estimatedSolFee` of the transaction fee plus the KeyToAssetV0 rent and tree fee, the same costs its funding gate charges, instead of the transaction fee alone.

- Updated dependencies [[`9f99b45`](https://github.com/helium/helium-program-library/commit/9f99b458c442cd11909e7fccb4db33f373c33c8b), [`0888cd5`](https://github.com/helium/helium-program-library/commit/0888cd5ccae217e3b4c07e18459cc9f6ef2dbfc0), [`d48d673`](https://github.com/helium/helium-program-library/commit/d48d673b802be2db71b2b8807edad8f98048743c), [`f766451`](https://github.com/helium/helium-program-library/commit/f7664510c368e1c9f545ff11cc6715c23699bb6b), [`6f11300`](https://github.com/helium/helium-program-library/commit/6f11300031422e9468dc9c0ad813fad9eaa76d3c), [`7830992`](https://github.com/helium/helium-program-library/commit/78309926e86fd0de14a157d7e4c903fde04b3981), [`b26c94b`](https://github.com/helium/helium-program-library/commit/b26c94b2447cdc03eb0b997e7efcae7ed2891325), [`a9b1301`](https://github.com/helium/helium-program-library/commit/a9b13019bb52e8e9015f3fcfaabb4308c8aeddc6), [`56a2e86`](https://github.com/helium/helium-program-library/commit/56a2e86fa55c0f7eb33b0664cf368d4faf4bf1e2), [`4dbe762`](https://github.com/helium/helium-program-library/commit/4dbe762512abea5d53f4ca59d96385a158c7f283)]:
  - @helium/account-fetch-cache@0.11.17
  - @helium/circuit-breaker-sdk@0.12.0
  - @helium/data-credits-sdk@0.13.0
  - @helium/distributor-oracle@0.14.0
  - @helium/helium-entity-manager-sdk@0.12.0
  - @helium/helium-sub-daos-sdk@0.13.0
  - @helium/hpl-crons-sdk@0.14.0
  - @helium/idls@0.12.0
  - @helium/lazy-distributor-sdk@0.13.0
  - @helium/mini-fanout-sdk@0.12.0
  - @helium/spl-utils@0.14.0
  - @helium/sus@0.12.0
  - @helium/voter-stake-registry-sdk@0.13.0
  - @helium/welcome-pack-sdk@0.13.0
  - @helium/blockchain-api@0.16.1

## 0.12.2

### Patch Changes

- [`fc8b879`](https://github.com/helium/helium-program-library/commit/fc8b8795b485cb0ea91af4ab503ba2e7e7929811) Thanks [@bryzettler](https://github.com/bryzettler)! - Reject migrate requests whose source or destination wallet is the service fee payer. A request with `from` set to the service's own key made the service sign away its own balance. migration-service also gains the `from != to` and on-curve destination checks blockchain-api already had.

## 0.12.1

### Patch Changes

- [#1302](https://github.com/helium/helium-program-library/pull/1302) [`7d0fec1`](https://github.com/helium/helium-program-library/commit/7d0fec10a7a979d220f0062dec202ce6372d7071) Thanks [@bryzettler](https://github.com/bryzettler)! - Bump @helium/tuktuk-sdk, @helium/tuktuk-idls and @helium/cron-sdk to ^0.1.1. The delegate
  endpoint keeps returning BAD_REQUEST when the automation task queue has fewer free slots
  than positions, now that `nextAvailableTaskIds` throws instead of returning a short list.
- Updated dependencies [[`7d0fec1`](https://github.com/helium/helium-program-library/commit/7d0fec10a7a979d220f0062dec202ce6372d7071)]:
  - @helium/distributor-oracle@0.13.0
  - @helium/hpl-crons-sdk@0.13.0
  - @helium/welcome-pack-sdk@0.12.0

## 0.12.0

### Minor Changes

- [#1299](https://github.com/helium/helium-program-library/pull/1299) [`2f6c363`](https://github.com/helium/helium-program-library/commit/2f6c36318d674c6360f2cec411df9e1dffbefdfb) Thanks [@bryzettler](https://github.com/bryzettler)! - governance.getPositions now returns a `delegation` object per position (null
  when not delegated) with the sub-DAO, lastClaimedEpoch, raw expirationTs,
  `claimableEpochCount` (epochs claimDelegationRewards would build instructions
  for right now), `requiredUnclaimedEpochCount` (unclaimed epochs
  close_delegation_v0 requires, issued or not) and `unissuedRequiredEpochCount`
  (the subset of those undelegatePosition is waiting on issuance for). The counts
  come from the same epoch-range and issuance test the claim builder uses, which
  now lives in a shared helper.

  The issuance test now gates HNT-era epochs on `DaoEpochInfoV0.doneIssuingRewards`
  (what claim_rewards_v1 checks) instead of the per-sub-DAO `rewardsIssuedAt`,
  which is set before the last sub-DAO has issued. Claims built in that window
  used to fail on-chain with EpochNotClosed.

  Note for consumers: web-helium-world currently mirrors this epoch range in
  `src/lib/governance/reward-math.ts` (`claimUpperBoundEpoch` /
  `payableUpperBoundEpoch`) and should switch to `claimableEpochCount` /
  `unissuedRequiredEpochCount` once it adopts this version.

### Patch Changes

- Updated dependencies [[`2f6c363`](https://github.com/helium/helium-program-library/commit/2f6c36318d674c6360f2cec411df9e1dffbefdfb), [`35e7e30`](https://github.com/helium/helium-program-library/commit/35e7e302596eda528af6d8a327e9bfbb285b789c), [`1e752e6`](https://github.com/helium/helium-program-library/commit/1e752e6af23e3f0f4eb96978c13b7188d6162943), [`991210f`](https://github.com/helium/helium-program-library/commit/991210f9290d8fc97166722489ca511dbbb8194e)]:
  - @helium/blockchain-api@0.16.0
  - @helium/idls@0.11.27
  - @helium/hpl-crons-sdk@0.12.0
  - @helium/helium-sub-daos-sdk@0.12.0
  - @helium/lazy-distributor-sdk@0.12.0
  - @helium/distributor-oracle@0.12.0
  - @helium/spl-utils@0.13.3
  - @helium/data-credits-sdk@0.12.1
  - @helium/helium-entity-manager-sdk@0.11.19
  - @helium/welcome-pack-sdk@0.11.19

## 0.11.27

### Patch Changes

- [#1295](https://github.com/helium/helium-program-library/pull/1295) [`9865d3e`](https://github.com/helium/helium-program-library/commit/9865d3e1a4db5972da30d8c629c3adad9f39cb68) Thanks [@bryzettler](https://github.com/bryzettler)! - A transaction the cluster reports confirmed is no longer written expired, and
  its batch failed, when it is polled at finalized after its blockhash leaves
  range. The extend-delegation procedure judges lockup, expiration and season on
  the registrar clock, matching delegate. The pending_transactions index migration
  serialises concurrent replicas with an advisory lock and drops an invalid
  leftover index concurrently.

## 0.11.26

### Patch Changes

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Harden batch status tracking. Landed batches are resolved from one batched
  signature-status read, the status transaction is held only for writes, a status
  update that loses the compare-and-swap reloads the row instead of overwriting a
  terminal state, and a tick Jito cannot answer is skipped rather than marked
  failed. Manual resubmits check batch status first, keep the stored submission
  type, and no longer double-count the Jito tip's signature fee.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Size every Jito bundle producer's compute unit limits from the static CU table.
  Standalone simulation cannot see the state earlier transactions in a bundle
  leave behind, so a later claim or delegate transaction could exceed its limit
  and fail the bundle with `ProgramFailedToComplete`. `buildVersionedTransaction`
  and `buildBatchedTransactions` take `useTableComputeUnits`, on by default for
  batched builds, and the governance bundle endpoints (claim, delegate,
  undelegate, vote, relinquish, proxy assign and unassign, create position) use
  it. `tableComputeUnitsForInstructions` gains `throwOnMiss`, so a bundle
  carrying an untabled instruction fails the build naming the missing key instead
  of quietly requesting 1.4M CU. The table gains mainnet-measured entries for the
  nft_proxy, hpl_crons vote-queue and voter_stake_registry expired-vote
  instructions, and re-measures `vote_v0` and `relinquish_vote_v1` from mainnet.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Report the transaction that actually failed a Jito bundle simulation: the error
  data, the Sentry extras and the classifier all use the failing transaction's own
  logs plus its index, instead of a flat concatenation of every transaction's logs.
  `SIMULATION_FAILED` data carries the new optional `failedTransactionIndex`.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Make `delegatePositions` correct and fast for many positions. Ownership, claim
  bots, registrars and proxy configs are read in batches instead of once per
  position, the claim-bot instructions carry every account explicitly so Anchor
  fetches no IDL or related account per position, and each position reserves its
  own tuktuk task id so a bundle no longer collides with itself. Lockups,
  expirations and seasons are judged on the registrar clock, constant lockups are
  recognized by the program's `i64::MAX` sentinel, and a season is current only
  while `start <= now < end`, so a request past the last season is refused instead
  of signing a bundle that panics in `delegate_v0`. The funds preflight prices
  delegation rent from program-declared account sizes and the per-bot prepay, and
  `createPosition` quotes every lamport the bundle charges the wallet.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Stop resubmitting batches whose blockhash has expired. Expiry is decided from
  each transaction's own blockhash against the cluster's block height before a
  retry slot is consumed, and expired transactions are marked `expired` instead
  of retrying to the cap while Jito answers "bundle contains an expired
  blockhash". Submitting a transaction the cluster no longer accepts returns the
  new `BLOCKHASH_EXPIRED` error, carrying the blockhash and the index of the
  transaction in the batch, instead of a raw Jito message.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Reject a swap quote whose input and output mint are the same. `GetQuoteInput`
  now requires the two mints to differ, so the request fails as a 400 before it
  reaches Jupiter instead of coming back as a `JUPITER_ERROR` 500 carrying
  Jupiter's `CIRCULAR_ARBITRAGE_IS_DISABLED`. Jupiter's client-side error codes
  (`CIRCULAR_ARBITRAGE_IS_DISABLED`, `TOKEN_NOT_TRADABLE`) map to `BAD_REQUEST`
  for both `swap.getQuote` and `swap.getInstructions`, and the swap UI leaves the
  counterpart token out of each picker so the pair can no longer be selected.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Surface Jupiter rate limiting from `swap.getQuote` and `swap.getInstructions`
  as `RATE_LIMITED` (429) so clients back off, classified before Jupiter's error
  codes so a 429 body is never mistaken for a bad request.

- [#1286](https://github.com/helium/helium-program-library/pull/1286) [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7) Thanks [@bryzettler](https://github.com/bryzettler)! - Fix transactions.history pinning the database CPU. Index pending_transactions on signature and batch_id (built concurrently, so the submit path keeps writing), and look up already-known signatures with one query per Helius page instead of one query per transaction.

- Updated dependencies [[`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7), [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7), [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7), [`d7b31af`](https://github.com/helium/helium-program-library/commit/d7b31afab5d4441db2a461dddec31d37c4e6e8c7)]:
  - @helium/spl-utils@0.13.2
  - @helium/blockchain-api@0.15.2

## 0.11.25

### Patch Changes

- [#1278](https://github.com/helium/helium-program-library/pull/1278) [`3484cf7`](https://github.com/helium/helium-program-library/commit/3484cf7cbf00ba8d116f4a4121e71808ee5e9b06) Thanks [@bryzettler](https://github.com/bryzettler)! - Fix bugs surfaced in prod logs:
  - Floor fractional proxy `expirationTime` instead of rejecting it
  - Dedupe hotspots across claim-rewards pages so Jito bundles never contain duplicate transactions
  - Refuse to build `closeDelegationV0` while a required epoch has no issued rewards (the program panics otherwise)
  - Serve the stored batch status when the on-chain status check fails instead of returning 500
  - Order the paginated hotspot query by asset so pages are stable, and dedupe within a page as well as across pages
  - Keep the safe-integer bound on proxy `expirationTime` after flooring
  - Rethrow database errors from the batch status check and build the fallback from a pre-check snapshot

- Updated dependencies [[`3484cf7`](https://github.com/helium/helium-program-library/commit/3484cf7cbf00ba8d116f4a4121e71808ee5e9b06)]:
  - @helium/blockchain-api@0.15.1

## 0.11.24

### Patch Changes

- Updated dependencies [[`c31dc01`](https://github.com/helium/helium-program-library/commit/c31dc01c35ebef6fd676e75451dddbefdcad5545)]:
  - @helium/blockchain-api@0.15.0

## 0.11.23

### Patch Changes

- [#1269](https://github.com/helium/helium-program-library/pull/1269) [`7dcdd47`](https://github.com/helium/helium-program-library/commit/7dcdd47419a0b71eef8f1ef4e5aacf35282d27bd) Thanks [@bryzettler](https://github.com/bryzettler)! - Widen transaction batch tags to TEXT, bound the contract tag at 1000 chars, back off per-batch resubmissions, and clamp migration SOL transfers to the live source balance

- Updated dependencies [[`7dcdd47`](https://github.com/helium/helium-program-library/commit/7dcdd47419a0b71eef8f1ef4e5aacf35282d27bd)]:
  - @helium/blockchain-api@0.14.3

## 0.11.22

### Patch Changes

- [#1207](https://github.com/helium/helium-program-library/pull/1207) [`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1) Thanks [@bryzettler](https://github.com/bryzettler)! - Pyth pro migration service updates: monitor-service gains pyth crank/payer balance and feed publish-time gauges, tuktuk-pyth-service crank hardening, and blockchain-api drops the Hermes ephemeral price-update path from DC mints.

- Updated dependencies [[`79889b1`](https://github.com/helium/helium-program-library/commit/79889b13c1cc3654fa29c02ca5d5a2fc293f0e96), [`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1), [`c49ab38`](https://github.com/helium/helium-program-library/commit/c49ab38eb4a710d50bd905465e8b3041a74aeb9a)]:
  - @helium/idls@0.11.22
  - @helium/spl-utils@0.13.0
  - @helium/data-credits-sdk@0.12.0
  - @helium/helium-sub-daos-sdk@0.11.19
  - @helium/circuit-breaker-sdk@0.11.18
  - @helium/distributor-oracle@0.11.19
  - @helium/helium-entity-manager-sdk@0.11.18
  - @helium/hpl-crons-sdk@0.11.19
  - @helium/lazy-distributor-sdk@0.11.18
  - @helium/mini-fanout-sdk@0.11.18
  - @helium/sus@0.11.18
  - @helium/voter-stake-registry-sdk@0.12.2
  - @helium/welcome-pack-sdk@0.11.18

## 0.11.21

### Patch Changes

- [#1201](https://github.com/helium/helium-program-library/pull/1201) [`2022672`](https://github.com/helium/helium-program-library/commit/2022672309d34fb95d20b6b45f6ac88b72755ef2) Thanks [@bryzettler](https://github.com/bryzettler)! - Price transactions with the cluster's own fee calculation instead of local compute-budget math. `getTransactionFee`/`getTotalTransactionFees` now take a `Connection` and resolve via `getFeeForMessage`, so quoted fees track base, priority, and any future fee components (SIMD-0553 resource fees) without client-side modeling. The local fallback used when the RPC can't answer parses the u64 CU price without the signed-shift overflow past 2^31 and models the runtime's 200k-per-instruction default (capped at 1.4M) rather than a flat 200k.

  `buildVersionedTransaction` resolves address lookup tables once and shares them with `withPriorityFees` and the message compile, fetches the blockhash concurrently with fee estimation, and on estimation failure falls back to spl-utils' measured compute-unit table instead of shipping instructions with no compute budget. Hardcoded 500k compute-unit limits are dropped from the remaining procedures.

- Updated dependencies [[`c6e759e`](https://github.com/helium/helium-program-library/commit/c6e759e421db942e69d6ad357c65d735e0ca2bae)]:
  - @helium/spl-utils@0.12.0
  - @helium/circuit-breaker-sdk@0.11.17
  - @helium/data-credits-sdk@0.11.17
  - @helium/distributor-oracle@0.11.17
  - @helium/helium-entity-manager-sdk@0.11.17
  - @helium/helium-sub-daos-sdk@0.11.18
  - @helium/hpl-crons-sdk@0.11.18
  - @helium/lazy-distributor-sdk@0.11.17
  - @helium/mini-fanout-sdk@0.11.17
  - @helium/sus@0.11.17
  - @helium/voter-stake-registry-sdk@0.12.1
  - @helium/welcome-pack-sdk@0.11.17

## 0.11.20

### Patch Changes

- Updated dependencies [[`77df26b`](https://github.com/helium/helium-program-library/commit/77df26b20ce9922b11f6b6e36b9f45b1a723e8bc)]:
  - @helium/blockchain-api@0.14.0

## 0.11.19

### Patch Changes

- Updated dependencies [[`a5d7e07`](https://github.com/helium/helium-program-library/commit/a5d7e073f3da1ab87816c982ec723c7e2158a5ac), [`a5d7e07`](https://github.com/helium/helium-program-library/commit/a5d7e073f3da1ab87816c982ec723c7e2158a5ac)]:
  - @helium/voter-stake-registry-sdk@0.12.0
  - @helium/blockchain-api@0.13.0
  - @helium/helium-sub-daos-sdk@0.11.17
  - @helium/hpl-crons-sdk@0.11.17

## 0.11.18

### Patch Changes

- Updated dependencies [[`9431155`](https://github.com/helium/helium-program-library/commit/943115570fc36650cdc83471fdf1ca66c491e6bb)]:
  - @helium/blockchain-api@0.12.0

## 0.11.17

### Patch Changes

- [#1171](https://github.com/helium/helium-program-library/pull/1171) [`97e4704`](https://github.com/helium/helium-program-library/commit/97e4704468ea44b153451b4e0a620db553f188bc) Thanks [@bryzettler](https://github.com/bryzettler)! - Fix Sentry errors with accurate fee calculations and ATA checks, and enrich actionMetadata with hotspot names, split details, and estimated pending rewards

- Updated dependencies [[`97e4704`](https://github.com/helium/helium-program-library/commit/97e4704468ea44b153451b4e0a620db553f188bc)]:
  - @helium/blockchain-api@0.11.17
  - @helium/spl-utils@0.11.17

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.16](https://github.com/helium/helium-program-library/compare/v0.11.15...v0.11.16) (2026-03-31)

### Features

- add DC token to KNOWN_TOKENS with hardcoded price ([#1159](https://github.com/helium/helium-program-library/issues/1159)) ([5c570e6](https://github.com/helium/helium-program-library/commit/5c570e66f7c7ec678cd4e7c5d5091877c531b342))

## [0.11.15](https://github.com/helium/helium-program-library/compare/v0.11.14...v0.11.15) (2026-03-27)

**Note:** Version bump only for package @helium/blockchain-api-service

## [0.11.14](https://github.com/helium/helium-program-library/compare/v0.11.13...v0.11.14) (2026-03-24)

### Bug Fixes

- process inner instructions in Solana execution order ([#1153](https://github.com/helium/helium-program-library/issues/1153)) ([6162ddf](https://github.com/helium/helium-program-library/commit/6162ddf3658c91fe853e5826c41f55bbf2be046a))

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/blockchain-api-service

## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)

**Note:** Version bump only for package @helium/blockchain-api-service
