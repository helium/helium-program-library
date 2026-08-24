//! The Mobile data deployer earnings backstop (HIP 149 Decision 1, HIP 150 Decision 2).
//!
//! Two coupled mechanisms, both keyed off the per-epoch carrier-paid burn signal
//! `mobile_sub_dao_epoch_info.dc_burned` (DC has 5 decimals, 1 DC = $0.00001, so
//! `dc_burned` is a direct USD measure of carrier consumption). Per-Hotspot reward
//! multipliers need no state here: the payer burns the multiplied data credits, so
//! `dc_burned` already aggregates whatever multipliers were in force. The band itself is a
//! single network-wide bound on the Mobile data deployer pool, not a per-Hotspot one.
//!
//! - **Floor (target minimum / top-up).** When the Mobile data deployer baseline
//!   falls below 80% of the carrier-paid USD, the protocol re-emits burned HNT to
//!   top deployers up to that target. Computed here in `calculate_utility_score_v0`
//!   and minted by `issue_rewards_v0` straight into the Mobile data rewards escrow,
//!   so the top-up is sized at the shortfall itself: every HNT of it reaches a
//!   deployer rather than being shared out by the sub-DAO and bucket splits. Bounded
//!   by recent HNT destruction so it never grows net supply, and sharing one burn
//!   budget with the existing HIP 20 net-emissions re-emit (the two paths never
//!   re-mint the same destroyed HNT twice).
//! - **Cap (earnings ceiling / overflow-to-stakers).** When the deployer pool would pay
//!   more than three times the carrier-paid USD, the excess is redirected from the rewards
//!   escrow to the shared delegator pool. Applied in `issue_rewards_v0`; this module
//!   computes the ceiling (`deployer_cap_hnt`) and the redirect (`staker_overflow`).
//!
//! The floor target is clamped to the ceiling where it is computed, so the two never bind in
//! the same epoch. The clamp matters because the floor converts its USD target at
//! `ema - 2 * conf` while the cap converts its own at `ema`: a confidence width above ~37% of
//! the EMA price puts the unclamped target above the ceiling, which would mint a top-up only
//! for the cap to redirect it to stakers. What the cap still trims is the residual between
//! the baseline computed here and the pool `issue_rewards_v0` mints from the freshly-smoothed
//! percent share.
//!
//! The two parameters (80% floor share, 300% cap) are hardcoded; changing them requires a
//! community HIP and program upgrade. Everything else the band needs is read from chain each
//! epoch: the Mobile percent share and the delegation slice that together size the baseline.
//! No bucket fraction appears here. With the Service Provider allocation at zero the rewards
//! escrow *is* the Mobile data bucket, so the amount minted to it is the deployer pool, and
//! how a sub-DAO's rewards are allocated within that pool is the oracles' concern.

use anchor_lang::prelude::*;

/// The Mobile sub-DAO PDA on mainnet (`["sub_dao", MOBILE_MINT]` under this program).
/// The backstop keys off the Mobile sub-DAO's `dc_burned` and percent share.
pub const MOBILE_SUB_DAO: Pubkey = pubkey!("Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22");

/// The canonical mainnet HNT/USD Pyth push account (shard 0 for `HNT_PRICE_FEED_ID`),
/// kept continuously fresh on-chain and mirrored in `spl-utils`' `HNT_PYTH_PRICE_FEED`.
/// `calculate_utility_score_v0` pins the supplied price account to this key so a caller
/// cannot substitute a different (stale-but-valid) HNT price update to steer the backstop.
///
/// Operational constraint: this constant and the account the end-epoch cron forwards must
/// move together. A closed or stale canonical account fails safe (the content checks in
/// `read_hnt_price` make the epoch dormant, issuance continues). But repointing the cron
/// at a *different* account without also upgrading this constant hard-fails the pin
/// (`InvalidPriceOracle`) and halts issuance. To rotate the Pyth feed account, upgrade this
/// constant and update the cron in the same rollout.
pub const HNT_PYTH_PRICE_FEED: Pubkey = pubkey!("He5mhwVQQNvjFxqjEjFDb7enJWFwFJ7Rq7zknqBz89A5");

/// The target minimum, as a percentage of the carrier-paid USD the Mobile sub-DAO's
/// `dc_burned` measures (HIP 150 Decision 2). Hardcoded.
pub const DEPLOYER_TARGET_PERCENT: u128 = 80;

/// The earnings ceiling, as a multiple of the same carrier-paid USD (HIP 149 Decision 1).
pub const DEPLOYER_CAP_MULTIPLE: u128 = 3;

/// Scale of `DaoV0::delegator_rewards_percent`: 100% with 2 decimals of accuracy.
/// `issue_rewards_v0` divides the delegator slice by this same figure.
pub const PERCENT_SCALE: u64 = 100 * 10_0000000;

/// Inputs to the backstop computation, all already read from on-chain state and
/// the Pyth price account by the caller.
pub struct BackstopInput {
  /// HIP 20 emission schedule value for the end of this epoch.
  pub emission: u64,
  /// 7-epoch moving average of HNT destroyed on-chain (the existing HIP 20 variable).
  pub smoothed_hnt_burned: u64,
  /// DAO net-emissions cap governing the existing carrier-burn re-emit.
  pub net_emissions_cap: u64,
  /// Mobile sub-DAO `dc_burned` accumulator for this epoch (carrier-paid DC).
  pub mobile_dc_burned: u64,
  /// Mobile sub-DAO 30-epoch EMA percent share (`previous_percentage`), scaled by `u32::MAX`.
  pub mobile_share: u32,
  /// `DaoV0::delegator_rewards_percent`, scaled by `PERCENT_SCALE`. The rest of the
  /// sub-DAO's emission is minted to the rewards escrow, and with the Service Provider
  /// allocation at zero the escrow is the Mobile data deployer pool, so `1 - this` is the
  /// fraction of the sub-DAO slice that reaches deployers. Read from chain rather than
  /// hardcoded as a bucket percentage, so the baseline cannot disagree with the amount
  /// `issue_rewards_v0` actually mints.
  pub delegator_rewards_percent: u64,
  /// `10^(hnt_decimals - pyth_exponent - 5)`, the DC->HNT scale factor (mirrors
  /// `mint_data_credits_v0`). With 8 HNT decimals and a -8 exponent this is `10^11`.
  pub decimals_factor: u128,
  /// Lower-bound Pyth HNT price (`ema_price - 2 * ema_conf`), guaranteed `> 0` by the
  /// caller. Used for the floor/top-up: a lower price converts the USD target into more
  /// HNT, which is the conservative direction for a minimum. Same convention as
  /// `mint_data_credits_v0`.
  pub hnt_price_floor: u64,
  /// EMA (point-estimate) Pyth HNT price, no confidence adjustment. Used for the earnings
  /// cap so it binds at exactly `3.0 x carrier_paid_USD` at the point price. The floor uses
  /// the lower bound (never underpay a minimum); the cap uses the point price (land on the
  /// HIP's 3.0x rather than biasing the ceiling in either direction with the confidence
  /// width) (I-01).
  pub hnt_price_cap: u64,
}

/// Result of the backstop computation for one epoch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BackstopOutput {
  /// The existing HIP 20 carrier-burn re-emit, `min(smoothed_hnt_burned, net_emissions_cap)`.
  pub existing_re_emit: u64,
  /// The target-minimum top-up, which `issue_rewards_v0` mints whole into the Mobile data
  /// rewards escrow and excludes from the amount it splits.
  pub top_up: u64,
  /// Total HNT minted at DAO level this epoch: `emission + existing_re_emit + top_up`.
  /// Only `total_rewards - top_up` is split by sub-DAO share; the whole of it is what
  /// `current_hnt_supply` has to track.
  pub total_rewards: u64,
  /// The Mobile data deployer earnings ceiling in HNT (`3 x carrier_paid_USD`).
  pub deployer_cap_hnt: u64,
}

/// Convert a DC count to HNT lamports at the confidence-adjusted Pyth price, exactly
/// as `mint_data_credits_v0` converts DC to the HNT it burns:
/// `hnt = dc * decimals_factor / price`.
///
/// `None` when the result does not fit in `u64`, which takes a price so small that the
/// carrier-paid USD converts to more HNT than exists. A caller that saturated instead would
/// be acting on a price it cannot represent, so both mechanisms treat `None` as a reason to
/// go dormant for the epoch rather than as an enormous amount.
fn scale_dc_to_hnt(
  dc_amount: u128,
  decimals_factor: u128,
  hnt_price_with_conf: u64,
) -> Option<u64> {
  dc_amount
    .saturating_mul(decimals_factor)
    .checked_div(hnt_price_with_conf as u128)?
    .try_into()
    .ok()
}

/// Compute the backstop for one epoch.
///
/// The floor tops Mobile data deployers up to `0.8 x carrier_paid_USD`; the cap
/// (returned as `deployer_cap_hnt`) holds them at no more than `3.0 x carrier_paid_USD`.
/// The top-up is bounded by `max(0, smoothed_hnt_burned - net_emissions_cap)` so that,
/// together with the existing re-emit, re-emission never exceeds recent HNT destruction.
pub fn compute_backstop(input: &BackstopInput) -> BackstopOutput {
  let existing_re_emit = std::cmp::min(input.smoothed_hnt_burned, input.net_emissions_cap);

  // carrier_paid_USD = dc_burned x 1e-5. The cap is 3.0x of it (dc_burned*3 in DC units);
  // the floor target (0.8x) is computed below, after the share guard, since it's only
  // used on the top-up path. The cap uses the EMA point price so it binds at exactly 3.0x;
  // the floor uses the lower (confidence-adjusted) price so a minimum is never underpaid.
  //
  // A ceiling that will not fit in u64 leaves the epoch with no ceiling and no top-up: the
  // price is too small to represent either side of the band, so neither half of it is acted
  // on (I-02). A zero ceiling disables the redirect downstream.
  let deployer_cap_hnt = scale_dc_to_hnt(
    (input.mobile_dc_burned as u128).saturating_mul(DEPLOYER_CAP_MULTIPLE),
    input.decimals_factor,
    input.hnt_price_cap,
  );

  // Total emission unaffected by the backstop: schedule + the existing re-emit.
  let base_total = input.emission.saturating_add(existing_re_emit);

  let dormant = BackstopOutput {
    existing_re_emit,
    top_up: 0,
    total_rewards: base_total,
    deployer_cap_hnt: deployer_cap_hnt.unwrap_or(0),
  };

  // mobile_share == 0 is a genesis or fully un-delegated Mobile sub-DAO, which takes no
  // share of the emission and so has no deployer pool for the band to act on.
  let (Some(deployer_cap_hnt), true) = (deployer_cap_hnt, input.mobile_share != 0) else {
    return dormant;
  };

  // Floor target: 0.8x carrier-paid USD, in HNT, and never above the ceiling. Without the
  // clamp the two prices can invert the band -- the floor converts at `ema - 2 * conf` and
  // the cap at `ema`, so a confidence width above ~37% of the EMA price puts the target over
  // the ceiling -- and the top-up would then be minted only to be redirected to stakers by
  // the cap. Clamping here is what keeps the floor a floor of the same band the cap tops.
  let Some(target_hnt) = scale_dc_to_hnt(
    (input.mobile_dc_burned as u128).saturating_mul(DEPLOYER_TARGET_PERCENT) / 100,
    input.decimals_factor,
    input.hnt_price_floor,
  ) else {
    return dormant;
  };
  let target_hnt = std::cmp::min(target_hnt, deployer_cap_hnt);

  // deployer_baseline: what the emission schedule and the existing re-emit deliver to Mobile
  // data deployers, being the Mobile share of the split base less the veHNT delegation slice.
  // The remainder is what issue_rewards_v0 mints to the rewards escrow, and with the Service
  // Provider allocation at zero the escrow is the deployer pool. Excludes any HST cut, which
  // is 0% and has no payout instruction in this program.
  let share = input.mobile_share as u128;
  let deployer_percent = PERCENT_SCALE.saturating_sub(input.delegator_rewards_percent) as u128;
  let deployer_baseline = (base_total as u128).saturating_mul(share) / (u32::MAX as u128)
    * deployer_percent
    / (PERCENT_SCALE as u128);

  // top_up_demand = target_hnt - deployer_baseline. The top-up is minted straight into the
  // Mobile data rewards escrow rather than into the amount those splits divide, so what
  // reaches deployers is the mint itself and the shortfall needs no grossing up. Both terms
  // are u64-bounded, so the difference is too.
  let top_up_demand = target_hnt.saturating_sub(deployer_baseline as u64);

  // Burn-bounded: the top-up may use only the burn beyond what the existing re-emit
  // already consumes (HIP 149 shared-budget bound). With existing_re_emit =
  // min(smoothed, cap), this burn budget is max(0, smoothed - cap), and the two paths
  // sum to at most smoothed_hnt_burned.
  let burn_budget = input
    .smoothed_hnt_burned
    .saturating_sub(input.net_emissions_cap);
  let top_up = std::cmp::min(top_up_demand, burn_budget);

  BackstopOutput {
    existing_re_emit,
    top_up,
    total_rewards: base_total.saturating_add(top_up),
    deployer_cap_hnt,
  }
}

/// Split an epoch's stored `total_rewards` into the part that `issue_rewards_v0` divides by
/// sub-DAO share, and the top-up it mints whole into the Mobile data rewards escrow.
/// Returns `(split_base, top_up)`, which sum to `total_rewards` by construction.
///
/// `total_rewards` is `emission + min(smoothed_hnt_burned, net_emissions_cap) + top_up`, and
/// every term that is not the top-up is available to `issue_rewards_v0`: the emission
/// schedule and the net-emissions cap on `DaoV0`, and the epoch's `smoothed_hnt_burned` on
/// the `DaoEpochInfoV0` that `calculate_utility_score_v0` wrote.
///
/// The two halves sum to `total_rewards` on any one call, so a single pass always mints
/// what the epoch recorded. What that does *not* pin is agreement between passes: every
/// sub-DAO pass derives the split independently, and one epoch's mint is
/// `total_rewards + share_of_the_other_passes x (their_base - the_Mobile_base)`. So a
/// divergence between passes mints HNT the epoch's `current_hnt_supply` does not account
/// for, in either direction.
///
/// The end-of-epoch crank compiles every pass into a single transaction, where the inputs
/// cannot move and the split is identical. The two ways they can diverge are a governance
/// `update_dao_v0` to the emission schedule or the net-emissions cap landing between passes
/// of a manual settlement, which sends each pass as its own transaction; and an upgrade of
/// this program landing mid-settlement, which no on-chain guard can detect because the
/// earlier passes ran under code that did not split at all. Settle every pass of an epoch
/// under one program version.
pub fn split_total_rewards(
  total_rewards: u64,
  emission: u64,
  smoothed_hnt_burned: u64,
  net_emissions_cap: u64,
) -> (u64, u64) {
  let split_base = emission
    .saturating_add(std::cmp::min(smoothed_hnt_burned, net_emissions_cap))
    .min(total_rewards);
  (split_base, total_rewards - split_base)
}

/// The earnings-cap overflow: the portion of the Mobile data deployer pool above the
/// deployer ceiling, redirected from the rewards escrow to the shared delegator pool.
///
/// `deployer_pool` is the escrow mint itself, which is what deployers are paid and so is
/// the quantity the ceiling governs. Measuring the pool rather than reconstructing it from
/// a bucket fraction is what keeps the amount measured and the amount minted the same
/// number: with the Service Provider allocation at zero the escrow is the whole data
/// bucket, and its size is set by `delegator_rewards_percent`, which governance can move.
///
/// A zero ceiling (no carrier burn or no representable price this epoch) disables the
/// redirect, so the whole pool flows to deployers. The result never exceeds
/// `deployer_pool`, so the caller's subtraction cannot underflow.
pub fn staker_overflow(deployer_pool: u64, deployer_cap_hnt: u64) -> u64 {
  if deployer_cap_hnt == 0 {
    return 0;
  }
  deployer_pool.saturating_sub(deployer_cap_hnt)
}

#[cfg(test)]
// HNT amounts are written as whole-HNT then 8 decimals (e.g. 1_644_00000000) for
// readability against the spec's HNT figures; same precedent as the treasury mint
// literal in calculate_utility_score_v0.rs.
#[allow(clippy::inconsistent_digit_grouping)]
mod tests {
  use super::*;

  // Mobile sub-DAO ~89/11 split => mobile_share ~0.8927, so the fraction of the split base
  // reaching Mobile data deployers is 0.8927 x 0.94 ~ 0.839.
  const SHARE_8927: u32 = ((0.8927_f64) * (u32::MAX as f64)) as u32;
  /// `delegator_rewards_percent` at its mainnet 6%, in `PERCENT_SCALE` units.
  const DELEGATOR_PERCENT_6: u64 = 6 * 10_0000000;
  /// The share of the split base that reaches Mobile data deployers at SHARE_8927 once the
  /// 6% delegation slice is taken.
  const BASELINE_FRACTION: f64 = 0.8927 * 0.94;
  const NET_CAP: u64 = 1_644_00000000; // ~1,644 HNT/epoch in bones (8 decimals)
  const EMISSION: u64 = 20_548_00000000; // ~20,548 HNT/epoch
  const DECIMALS_FACTOR: u128 = 100_000_000_000; // 10^11 (8 hnt decimals, -8 expo)

  // carrier pays $9,100/day => 910,000,000 DC ($1 = 1e5 DC).
  const DC_BURNED: u64 = 910_000_000;

  fn hnt_price(dollars: f64) -> u64 {
    // Pyth price with 8-decimal (-8) exponent.
    (dollars * 1e8) as u64
  }

  fn base_input(price_dollars: f64, smoothed: u64) -> BackstopInput {
    // Zero-confidence case: floor and cap prices coincide, so the existing worked
    // examples are unchanged by the floor/cap price split (I-01).
    BackstopInput {
      emission: EMISSION,
      smoothed_hnt_burned: smoothed,
      net_emissions_cap: NET_CAP,
      mobile_dc_burned: DC_BURNED,
      mobile_share: SHARE_8927,
      delegator_rewards_percent: DELEGATOR_PERCENT_6,
      decimals_factor: DECIMALS_FACTOR,
      hnt_price_floor: hnt_price(price_dollars),
      hnt_price_cap: hnt_price(price_dollars),
    }
  }

  // Convert HNT bones back to whole HNT for readable asserts.
  fn hnt(bones: u64) -> f64 {
    bones as f64 / 1e8
  }

  #[test]
  fn neither_binds_inside_band() {
    // HNT $1: the 80% target is 0.8 x $9,100 / $1 = 7,280 HNT, well under the ~18,620 HNT
    // baseline, and the baseline is well under the 3 x $9,100 / $1 = 27,300 HNT ceiling.
    // Smoothed well above net_emissions_cap, so a zero top-up is the floor not binding
    // rather than an empty burn budget.
    let out = compute_backstop(&base_input(1.0, 91_000_00000000));
    assert_eq!(out.top_up, 0, "no top-up inside the band");
    let data_bucket = hnt(out.total_rewards) * BASELINE_FRACTION;
    assert!(data_bucket < hnt(out.deployer_cap_hnt), "below the cap");
  }

  #[test]
  fn floor_binds_steady_state() {
    // HNT $0.10 steady state: carrier still pays $9,100, Nova burns ~91,000 HNT/day,
    // so smoothed settles at ~91,000 HNT. Target fully delivered.
    let smoothed = 91_000_00000000;
    let out = compute_backstop(&base_input(0.10, smoothed));
    // target_hnt = 0.8 x $9,100 / $0.10 = 72,800 HNT. The top-up is minted straight into
    // the escrow, so what deployers receive is the baseline plus the whole top-up rather
    // than the baseline plus the fraction of it that survives the splits.
    let baseline = hnt(EMISSION + NET_CAP) * BASELINE_FRACTION;
    let delivered = baseline + hnt(out.top_up);
    assert!(
      (delivered - 72_800.0).abs() < 50.0,
      "delivered {delivered} HNT should reach the 72,800 HNT target"
    );
  }

  #[test]
  fn split_total_rewards_inverts_the_computation() {
    // issue_rewards_v0 holds no top-up field: it splits the stored total_rewards back into
    // the amount it divides and the top-up it mints whole. Pin the inverse across the price
    // sweep and every burn regime, and pin that the two halves conserve the mint.
    for price in [0.05, 0.10, 0.20, 1.0, 2.5, 5.0] {
      for smoothed in [0u64, NET_CAP, NET_CAP + 1, 9_100_00000000, 91_000_00000000] {
        let out = compute_backstop(&base_input(price, smoothed));
        let (split_base, top_up) =
          split_total_rewards(out.total_rewards, EMISSION, smoothed, NET_CAP);
        assert_eq!(
          top_up, out.top_up,
          "price {price}, smoothed {smoothed}: derived top-up differs from the computed one"
        );
        assert_eq!(
          split_base + top_up,
          out.total_rewards,
          "price {price}, smoothed {smoothed}: the split lost or invented HNT"
        );
      }
    }
  }

  #[test]
  fn split_total_rewards_conserves_under_a_moved_base() {
    // A manual settlement that changed the emission schedule or the net-emissions cap
    // between the two instructions moves the derived base. Whichever way it moves, the two
    // halves still sum to total_rewards, so how much HNT is minted cannot change.
    let out = compute_backstop(&base_input(0.10, 91_000_00000000));
    for (emission, net_cap) in [
      (EMISSION, NET_CAP),
      (EMISSION * 2, NET_CAP),
      (EMISSION / 2, NET_CAP),
      (u64::MAX, NET_CAP),
      (EMISSION, 0),
      (EMISSION, u64::MAX),
    ] {
      let (split_base, top_up) =
        split_total_rewards(out.total_rewards, emission, 91_000_00000000, net_cap);
      assert_eq!(
        split_base + top_up,
        out.total_rewards,
        "emission {emission}, net_cap {net_cap}: the split lost or invented HNT"
      );
    }
  }

  #[test]
  fn burn_bound_binds_during_transient() {
    // Just after a crash from $1 to $0.10: smoothed still reflects pre-crash burns
    // (~9,100 HNT/day). The shared-budget bound caps the top-up at smoothed - net_cap.
    let smoothed = 9_100_00000000;
    let out = compute_backstop(&base_input(0.10, smoothed));
    let expected_top_up = smoothed - NET_CAP; // burn budget, since demand far exceeds it
    assert_eq!(
      out.top_up, expected_top_up,
      "top-up clamped to the shared burn budget (smoothed - net_emissions_cap)"
    );
    // Sanity: combined re-emission never exceeds smoothed_hnt_burned.
    assert!(out.existing_re_emit + out.top_up <= smoothed);
  }

  #[test]
  fn combined_reemission_never_exceeds_burns() {
    // Property: existing_re_emit + top_up <= smoothed_hnt_burned for any smoothed.
    for smoothed in [
      0u64,
      300,
      NET_CAP,
      NET_CAP + 1,
      50_000_00000000,
      91_000_00000000,
    ] {
      let out = compute_backstop(&base_input(0.10, smoothed));
      assert!(
        out.existing_re_emit + out.top_up <= smoothed,
        "smoothed={smoothed}: re_emit {} + top_up {} exceeds the burn budget",
        out.existing_re_emit,
        out.top_up
      );
    }
  }

  #[test]
  fn cap_ceiling_computed_for_overflow() {
    // HNT $2.50: the ~18,620 HNT baseline exceeds the 3 x $9,100 / $2.50 = 10,920 HNT
    // ceiling, so the cap binds. The redirect itself happens in issue_rewards_v0.
    let out = compute_backstop(&base_input(2.50, 91_000_00000000));
    assert_eq!(out.top_up, 0, "no top-up when HNT is expensive");
    assert!(
      (hnt(out.deployer_cap_hnt) - 10_920.0).abs() < 5.0,
      "cap_hnt {} should be ~10,920 HNT",
      hnt(out.deployer_cap_hnt)
    );
  }

  #[test]
  fn cap_uses_its_own_price_not_the_floor_price() {
    // I-01: the cap converts its 3.0x USD ceiling at the EMA point price, independent of
    // the floor's lower (confidence-adjusted) price. EMA $1.00, floor price $0.90. The cap
    // in HNT is 3 x $9,100 / $1.00 = 27,300 HNT (exactly 3.0x at the point price), not
    // 3 x $9,100 / $0.90 = 30,333 HNT (what sharing the floor's lower price would give).
    let mut input = base_input(1.00, NET_CAP);
    input.hnt_price_floor = hnt_price(0.90);
    input.hnt_price_cap = hnt_price(1.00);
    let out = compute_backstop(&input);
    assert!(
      (hnt(out.deployer_cap_hnt) - 27_300.0).abs() < 5.0,
      "cap_hnt {} should use the EMA point price (~27,300 HNT), not the floor's lower price (~30,333)",
      hnt(out.deployer_cap_hnt)
    );
  }

  #[test]
  fn staker_overflow_redirects_above_cap() {
    // A 13,870 HNT deployer pool against a 10,920 HNT ceiling redirects the 2,950 above it.
    let overflow = staker_overflow(13_870_00000000, 10_920_00000000);
    assert_eq!(hnt(overflow), 2_950.0);
  }

  #[test]
  fn staker_overflow_none_inside_band() {
    // Ceiling well above the pool (HNT cheap): no redirect.
    assert_eq!(staker_overflow(13_870_00000000, 27_300_00000000), 0);
  }

  #[test]
  fn staker_overflow_disabled_when_cap_zero() {
    // No carrier burn, or a price too small to convert => no ceiling => the whole pool
    // stays with deployers rather than being redirected wholesale to stakers.
    assert_eq!(staker_overflow(20_000_00000000, 0), 0);
  }

  #[test]
  fn staker_overflow_never_exceeds_the_pool() {
    // The redirect is drawn out of the pool itself, so the caller's subtraction cannot
    // underflow however small the ceiling is.
    let pool = 10_000_00000000;
    assert_eq!(staker_overflow(pool, 1), pool - 1);
    assert!(staker_overflow(pool, 1) <= pool);
  }

  #[test]
  fn deployer_pool_is_measured_not_reconstructed() {
    // The ceiling is applied to the escrow mint itself, so a delegation slice other than
    // today's 6% cannot make the measured pool and the minted pool disagree. Same pool,
    // same verdict, whatever fraction of the sub-DAO slice it happens to be.
    let cap = 10_920_00000000;
    for pool in [13_870_00000000_u64, 20_000_00000000, 5_000_00000000] {
      assert_eq!(
        staker_overflow(pool, cap),
        pool.saturating_sub(cap),
        "pool {pool}: the redirect is a function of the pool and the ceiling alone"
      );
    }
  }

  #[test]
  fn mobile_share_zero_is_dormant() {
    // A sub-DAO taking no share of the emission has no deployer pool for the band to act
    // on, so the epoch falls back to the existing re-emit alone.
    let mut input = base_input(0.10, 91_000_00000000);
    input.mobile_share = 0;
    let out = compute_backstop(&input);
    assert_eq!(out.top_up, 0, "no top-up when mobile_share is 0");
    assert_eq!(out.total_rewards, EMISSION + NET_CAP);
  }

  /// The baseline `compute_backstop` sizes the shortfall against, recomputed from the same
  /// inputs: the Mobile share of the split base, less the delegation slice.
  fn deployer_baseline(out: &BackstopOutput) -> u64 {
    let split_base = out.total_rewards - out.top_up;
    let deployer_percent = (PERCENT_SCALE - DELEGATOR_PERCENT_6) as u128;
    ((split_base as u128) * (SHARE_8927 as u128) / (u32::MAX as u128) * deployer_percent
      / (PERCENT_SCALE as u128)) as u64
  }

  #[test]
  fn the_top_up_is_never_sized_above_the_ceiling() {
    // The clamp holds the floor target at or under the ceiling, so the band cannot invert
    // and the top-up can never be minted only for the cap to redirect it. Sweep prices with
    // confidence widths either side of the ~37% that would otherwise invert it.
    for price in [0.05, 0.10, 0.20, 0.33, 1.0, 1.97, 2.5, 5.0] {
      for conf_fraction in [0.0, 0.1, 0.3, 0.36, 0.37, 0.45, 0.49] {
        let mut input = base_input(price, 91_000_00000000);
        input.hnt_price_floor = hnt_price(price * (1.0 - 2.0 * conf_fraction));
        if input.hnt_price_floor == 0 {
          continue;
        }
        let out = compute_backstop(&input);
        if out.top_up == 0 {
          continue;
        }
        assert!(
          deployer_baseline(&out).saturating_add(out.top_up) <= out.deployer_cap_hnt,
          "price {price}, conf {conf_fraction}: baseline + top_up {} exceeds the ceiling {}",
          hnt(deployer_baseline(&out) + out.top_up),
          hnt(out.deployer_cap_hnt)
        );
      }
    }
  }

  #[test]
  fn an_inverted_band_tops_up_only_to_the_ceiling() {
    // EMA $1.00 with $0.40 confidence gives a $0.20 floor price, so the unclamped 0.8x
    // target would be 36,400 HNT against a 27,300 HNT ceiling. The clamp sizes the top-up
    // to land on the ceiling instead, so the ~9,100 HNT that would have been minted and
    // handed straight to stakers is never minted at all.
    let mut input = base_input(1.00, 91_000_00000000);
    input.hnt_price_floor = hnt_price(0.20);
    let out = compute_backstop(&input);
    assert!(out.top_up > 0, "the floor still binds");
    let delivered = deployer_baseline(&out) + out.top_up;
    assert!(
      (hnt(delivered) - 27_300.0).abs() < 1.0,
      "delivered {} HNT should land on the 27,300 HNT ceiling, not the 36,400 HNT target",
      hnt(delivered)
    );
  }

  #[test]
  fn the_redirect_holds_the_minted_pool_at_the_ceiling() {
    // `issue_rewards_v0` mints from the freshly-smoothed percent share, not the
    // `previous_percentage` the baseline uses, so the pool it mints can sit a little either
    // side of `baseline + top_up`. Whatever it is, the redirect leaves the escrow at no more
    // than the ceiling.
    let cap = 27_300_00000000_u64;
    for pool in [cap - 1, cap, cap + 1, cap + 9_100_00000000] {
      assert_eq!(
        pool - staker_overflow(pool, cap),
        pool.min(cap),
        "pool {pool}: the escrow after the redirect is not held at the ceiling"
      );
    }
  }

  #[test]
  fn a_price_too_small_to_convert_is_dormant() {
    // The floor's USD target converts at `ema - 2 * conf`, which read_hnt_price only
    // requires to be positive. A price small enough that the target exceeds u64 leaves the
    // epoch with no top-up rather than spending the whole burn budget on an unrepresentable
    // number.
    let mut input = base_input(1.00, 91_000_00000000);
    input.hnt_price_floor = 1;
    let out = compute_backstop(&input);
    assert_eq!(
      out.top_up, 0,
      "no top-up on a price that cannot be converted"
    );
    let budget = 91_000_00000000_u64 - NET_CAP;
    assert!(out.top_up < budget, "the burn budget is not drained");
  }

  #[test]
  fn a_ceiling_too_small_to_convert_is_dormant() {
    // Both prices absurd: no ceiling and no top-up, and the redirect is disabled rather
    // than measuring against a saturated ceiling.
    let mut input = base_input(1.00, 91_000_00000000);
    input.hnt_price_floor = 1;
    input.hnt_price_cap = 1;
    let out = compute_backstop(&input);
    assert_eq!(out.top_up, 0);
    assert_eq!(out.deployer_cap_hnt, 0);
    assert_eq!(out.total_rewards, EMISSION + NET_CAP);
  }
}
