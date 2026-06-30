//! HIP 149 Decision 1: the Mobile data deployer earnings backstop.
//!
//! Two coupled mechanisms, both keyed off the per-epoch carrier-paid burn signal
//! `mobile_sub_dao_epoch_info.dc_burned` (DC has 5 decimals, 1 DC = $0.00001, so
//! `dc_burned` is a direct USD measure of carrier consumption):
//!
//! - **Floor (target minimum / top-up).** When the Mobile data deployer baseline
//!   falls below half the carrier-paid USD, the protocol re-emits burned HNT to
//!   top deployers up to that target. Computed here in `calculate_utility_score_v0`
//!   and added to DAO-level `total_rewards`. Bounded by recent HNT destruction so
//!   it never grows net supply, and sharing one burn budget with the existing
//!   HIP 20 net-emissions re-emit (the two paths never re-mint the same destroyed
//!   HNT twice).
//! - **Cap (earnings ceiling / overflow-to-stakers).** When the Mobile data bucket
//!   would pay deployers more than three times the carrier-paid USD, the excess is
//!   redirected from the rewards escrow to the shared delegator pool. Applied in
//!   `issue_rewards_v0`; this module only computes the ceiling (`deployer_cap_hnt`).
//!
//! The floor and the cap are mutually exclusive within an epoch (the floor sits at
//! a sixth of the cap).
//!
//! Parameters (50% floor share, 300% cap, 0.70 Mobile data bucket) are hardcoded;
//! changing them requires a community HIP and program upgrade. `alpha` (the fraction
//! of total emission reaching Mobile data deployers) is computed each epoch from the
//! on-chain Mobile percent share, not a parameter.

use anchor_lang::prelude::*;

/// The Mobile sub-DAO PDA on mainnet (`["sub_dao", MOBILE_MINT]` under this program).
/// The backstop keys off the Mobile sub-DAO's `dc_burned` and percent share.
pub const MOBILE_SUB_DAO: Pubkey = pubkey!("Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22");

/// Mobile data bucket fraction (HIP 149 Decision 3), as a percentage. Hardcoded.
pub const MOBILE_DATA_BUCKET_PERCENT: u128 = 70;

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
  /// `10^(hnt_decimals - pyth_exponent - 5)`, the DC->HNT scale factor (mirrors
  /// `mint_data_credits_v0`). With 8 HNT decimals and a -8 exponent this is `10^11`.
  pub decimals_factor: u128,
  /// Confidence-adjusted Pyth HNT price (`ema_price - 2 * ema_conf`), guaranteed `> 0`
  /// by the caller. Same convention as `mint_data_credits_v0`.
  pub hnt_price_with_conf: u64,
}

/// Result of the backstop computation for one epoch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BackstopOutput {
  /// The existing HIP 20 carrier-burn re-emit, `min(smoothed_hnt_burned, net_emissions_cap)`.
  pub existing_re_emit: u64,
  /// The target-minimum top-up to add to DAO-level `total_rewards` this epoch.
  pub top_up: u64,
  /// DAO-level total rewards: `emission + existing_re_emit + top_up`.
  pub total_rewards: u64,
  /// The Mobile data deployer earnings ceiling in HNT (`3 x carrier_paid_USD`).
  pub deployer_cap_hnt: u64,
}

/// Convert a DC count to HNT lamports at the confidence-adjusted Pyth price, exactly
/// as `mint_data_credits_v0` converts DC to the HNT it burns:
/// `hnt = dc * decimals_factor / price`.
fn scale_dc_to_hnt(dc_amount: u128, decimals_factor: u128, hnt_price_with_conf: u64) -> u64 {
  dc_amount
    .saturating_mul(decimals_factor)
    .checked_div(hnt_price_with_conf as u128)
    .unwrap_or(0)
    .try_into()
    .unwrap_or(u64::MAX)
}

/// Compute the HIP 149 Decision 1 backstop for one epoch.
///
/// The floor tops Mobile data deployers up to `0.5 x carrier_paid_USD`; the cap
/// (returned as `deployer_cap_hnt`) holds them at no more than `3.0 x carrier_paid_USD`.
/// The top-up is bounded by `max(0, smoothed_hnt_burned - net_emissions_cap)` so that,
/// together with the existing re-emit, re-emission never exceeds recent HNT destruction.
pub fn compute_backstop(input: &BackstopInput) -> BackstopOutput {
  let existing_re_emit = std::cmp::min(input.smoothed_hnt_burned, input.net_emissions_cap);

  // carrier_paid_USD = dc_burned x 1e-5. The cap is 3.0x of it (dc_burned*3 in DC units);
  // the floor target (0.5x) is computed below, after the share guard, since it's only
  // used on the top-up path.
  let deployer_cap_hnt = scale_dc_to_hnt(
    (input.mobile_dc_burned as u128).saturating_mul(3),
    input.decimals_factor,
    input.hnt_price_with_conf,
  );

  // Total emission unaffected by the backstop: schedule + the existing re-emit.
  let base_total = input.emission.saturating_add(existing_re_emit);

  // mobile_share == 0 (genesis or a fully un-delegated Mobile sub-DAO) would divide by
  // zero below; fall back to the existing re-emit only.
  if input.mobile_share == 0 {
    return BackstopOutput {
      existing_re_emit,
      top_up: 0,
      total_rewards: base_total,
      deployer_cap_hnt,
    };
  }

  // Floor target: 0.5x carrier-paid USD (dc_burned/2 in DC units), in HNT.
  let target_hnt = scale_dc_to_hnt(
    (input.mobile_dc_burned / 2) as u128,
    input.decimals_factor,
    input.hnt_price_with_conf,
  );

  // deployer_baseline = (emission + existing_re_emit) x mobile_share x 0.70.
  // mobile_share is scaled by u32::MAX; both divisors are nonzero constants.
  let share = input.mobile_share as u128;
  let deployer_baseline = (base_total as u128).saturating_mul(share) / (u32::MAX as u128)
    * MOBILE_DATA_BUCKET_PERCENT
    / 100;

  // top_up_demand = (target_hnt - deployer_baseline) / alpha
  //              = shortfall x u32::MAX x 100 / (mobile_share x 70).
  // Reverses the same scale used in deployer_baseline. The alpha division sizes a
  // DAO-level mint so the slice reaching Mobile data deployers equals the shortfall.
  let shortfall = (target_hnt as u128).saturating_sub(deployer_baseline as u128);
  let top_up_demand: u64 = shortfall
    .saturating_mul(u32::MAX as u128)
    .saturating_mul(100)
    .checked_div(share.saturating_mul(MOBILE_DATA_BUCKET_PERCENT))
    .unwrap_or(0)
    .try_into()
    .unwrap_or(u64::MAX);

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

/// The HIP 149 earnings-cap overflow: the portion of the Mobile data bucket above the
/// deployer ceiling, redirected from the rewards escrow to the shared delegator pool.
///
/// `rewards_amount` is the Mobile sub-DAO's emission this epoch; the data bucket is 0.70
/// of it. A zero ceiling (no carrier burn / no price oracle this epoch) disables the
/// redirect, so the full data bucket flows to deployers as before.
pub fn staker_overflow(rewards_amount: u64, deployer_cap_hnt: u64) -> u64 {
  if deployer_cap_hnt == 0 {
    return 0;
  }
  let data_bucket = (rewards_amount as u128)
    .saturating_mul(MOBILE_DATA_BUCKET_PERCENT)
    .checked_div(100)
    .unwrap_or(0) as u64;
  data_bucket.saturating_sub(deployer_cap_hnt)
}

#[cfg(test)]
// HNT amounts are written as whole-HNT then 8 decimals (e.g. 1_644_00000000) for
// readability against the spec's HNT figures; same precedent as the treasury mint
// literal in calculate_utility_score_v0.rs.
#[allow(clippy::inconsistent_digit_grouping)]
mod tests {
  use super::*;

  // Worked examples from helium-next/specs/supply.md, adjusted to HIP 149's
  // shared-budget burn bound. Mobile sub-DAO ~89/11 split => mobile_share ~0.8927.
  const SHARE_8927: u32 = ((0.8927_f64) * (u32::MAX as f64)) as u32; // alpha ~ 0.625
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
    BackstopInput {
      emission: EMISSION,
      smoothed_hnt_burned: smoothed,
      net_emissions_cap: NET_CAP,
      mobile_dc_burned: DC_BURNED,
      mobile_share: SHARE_8927,
      decimals_factor: DECIMALS_FACTOR,
      hnt_price_with_conf: hnt_price(price_dollars),
    }
  }

  // Convert HNT bones back to whole HNT for readable asserts.
  fn hnt(bones: u64) -> f64 {
    bones as f64 / 1e8
  }

  #[test]
  fn neither_binds_inside_band() {
    // HNT $1, R_payer $0.10. Baseline ~$0.15/GB sits well above the floor and below
    // the cap, so no top-up and no overflow.
    let out = compute_backstop(&base_input(1.0, NET_CAP)); // smoothed = cap => re_emit binds, burn_budget 0
    assert_eq!(out.top_up, 0, "no top-up inside the band");
    // deployer baseline ~13,870 HNT; cap_hnt = 3 x $9,100 / $1 = 27,300 HNT.
    let data_bucket = hnt(out.total_rewards) * 0.8927 * 0.70;
    assert!(data_bucket < hnt(out.deployer_cap_hnt), "below the cap");
  }

  #[test]
  fn floor_binds_steady_state() {
    // HNT $0.10 steady state: carrier still pays $9,100, Nova burns ~91,000 HNT/day,
    // so smoothed settles at ~91,000 HNT. Target fully delivered.
    let smoothed = 91_000_00000000;
    let out = compute_backstop(&base_input(0.10, smoothed));
    // target_hnt = 0.5 x $9,100 / $0.10 = 45,500 HNT.
    // deployer total delivered = baseline + top_up x alpha should reach 45,500 HNT.
    let alpha = 0.8927 * 0.70;
    let baseline = hnt(EMISSION + NET_CAP) * alpha;
    let delivered = baseline + hnt(out.top_up) * alpha;
    assert!(
      (delivered - 45_500.0).abs() < 50.0,
      "delivered {delivered} HNT should reach the 45,500 HNT target"
    );
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
    // HNT $2.50: baseline ~$0.38/GB exceeds the $0.30/GB cap. The ceiling in HNT is
    // 3 x $9,100 / $2.50 = 10,920 HNT. The redirect itself happens in issue_rewards_v0.
    let out = compute_backstop(&base_input(2.50, NET_CAP));
    assert_eq!(out.top_up, 0, "no top-up when HNT is expensive");
    assert!(
      (hnt(out.deployer_cap_hnt) - 10_920.0).abs() < 5.0,
      "cap_hnt {} should be ~10,920 HNT",
      hnt(out.deployer_cap_hnt)
    );
  }

  #[test]
  fn staker_overflow_redirects_above_cap() {
    // rewards_amount such that the data bucket (70%) is 13,870 HNT; cap 10,920 HNT.
    let rewards_amount = (13_870_00000000_u64 * 100) / 70; // data bucket = 13,870 HNT
    let cap = 10_920_00000000;
    let overflow = staker_overflow(rewards_amount, cap);
    assert!(
      (hnt(overflow) - 2_950.0).abs() < 5.0,
      "overflow {} HNT should be ~2,950",
      hnt(overflow)
    );
  }

  #[test]
  fn staker_overflow_none_inside_band() {
    let rewards_amount = (13_870_00000000_u64 * 100) / 70;
    // cap well above the bucket (HNT cheap): no redirect.
    assert_eq!(staker_overflow(rewards_amount, 27_300_00000000), 0);
  }

  #[test]
  fn staker_overflow_disabled_when_cap_zero() {
    // No carrier burn / no price oracle => ceiling 0 => the whole bucket stays with
    // deployers (no accidental redirect of everything to stakers).
    assert_eq!(staker_overflow(20_000_00000000, 0), 0);
  }

  #[test]
  fn mobile_share_zero_falls_back_to_re_emit() {
    let mut input = base_input(0.10, 91_000_00000000);
    input.mobile_share = 0;
    let out = compute_backstop(&input);
    assert_eq!(out.top_up, 0, "no top-up when mobile_share is 0");
    assert_eq!(out.total_rewards, EMISSION + NET_CAP);
  }

  #[test]
  fn floor_and_cap_mutually_exclusive() {
    // The floor (0.5x) sits below the cap (3.0x) of the same carrier-paid USD, so they
    // can never both bind. Sweep prices: whenever top_up > 0, the data bucket is below
    // the cap ceiling; whenever the bucket exceeds the cap, top_up == 0.
    for price in [0.05, 0.10, 0.20, 0.33, 1.0, 1.97, 2.5, 5.0] {
      let out = compute_backstop(&base_input(price, 91_000_00000000));
      let data_bucket = (out.total_rewards as u128) * (SHARE_8927 as u128) / (u32::MAX as u128)
        * MOBILE_DATA_BUCKET_PERCENT
        / 100;
      let over_cap = (data_bucket as u64) > out.deployer_cap_hnt;
      assert!(
        !(out.top_up > 0 && over_cap),
        "price {price}: floor and cap bound simultaneously"
      );
    }
  }
}
