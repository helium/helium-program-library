//! HIP 149 Decision 2: the operations-and-growth supplement.
//!
//! A per-epoch HNT mint into a Receiving-Entity Squads vault, bounded at deploy by two
//! hardcoded timestamps: a flat-rate first window (~12 months at ~196,000 HNT/day total)
//! followed by a linear taper to zero (~24 months). Both windows self-terminate; no vote
//! or manual halt is needed to end them.
//!
//! The mint happens in `issue_rewards_v0`, once per sub-DAO pass, each minting
//! `supplement_per_subdao(now)` so the two passes sum to the full daily rate.
//! `calculate_utility_score_v0` adds the same total back into `current_hnt_supply` so the
//! supplement isn't misread as burned HNT (see the supply-tracking note there).
//!
//! All parameters are hardcoded; changing them requires a community-voted program upgrade.
//! That includes both destination token accounts, so which accounts the supplement mints *into*
//! cannot change without one; see COUNCIL_FANOUT_TOKEN_ACCOUNT for what that does not fix about
//! where the Council carve-out ends up. Both destinations are mandatory while a window is
//! open, and `hpl-crons` withholds a destination that still holds its pre-activation
//! placeholder rather than forwarding it, so a build whose destinations are not real fails
//! every epoch of a live window instead of minting somewhere unintended.

use anchor_lang::prelude::*;

use crate::TESTING;

const EPOCH_LENGTH: i64 = 24 * 60 * 60;

// ── Patch-time constants ─────────────────────────────────────────────────────────────
/// Mint start, 2026-08-05T12:00:00Z. Epochs settle on the 00:00 UTC boundary, so the first
/// supplement mint lands at the 2026-08-06T00:00:00Z crank, closing the Council's pre-mint
/// review window. The value sits between two crank boundaries rather than on one, so neither
/// Solana clock drift nor a late crank can change which epoch mints first, and the windows
/// come to whole crank counts: 360 flat, then 720 tapering.
///
/// Under TESTING the start stays a far-future sentinel (2100-01-01), keeping the supplement
/// dormant for the localnet suite: an open window makes both destination accounts mandatory
/// in `issue_rewards_v0`, and every test there closes epochs without them.
pub const INFLATION_START: i64 = if TESTING {
  4_102_444_800
} else {
  1_785_931_200
};

/// End of the flat window (~12 months / ~360 epochs after the start).
pub const INFLATION_FLAT_END: i64 = INFLATION_START + 360 * EPOCH_LENGTH;

/// End of the taper window (~24 months / ~720 epochs after the flat window).
pub const INFLATION_TAPER_END: i64 = INFLATION_START + (360 + 720) * EPOCH_LENGTH;

/// Flat per-epoch mint **per sub-DAO**. Two sub-DAO passes per epoch sum to ~196,000
/// HNT/day. (98,000 HNT in bones.)
pub const INFLATION_FLAT_PER_EPOCH_PER_SUBDAO: u64 = 98_000 * 100_000_000;

/// Taper starting per-epoch-per-sub-DAO rate; equal to the flat rate for a smooth handoff,
/// then decaying linearly to zero across the taper window.
pub const INFLATION_TAPER_INITIAL_PER_EPOCH_PER_SUBDAO: u64 = INFLATION_FLAT_PER_EPOCH_PER_SUBDAO;

/// The Receiving Entity's HNT token account: the associated token account of vault index 0 of
/// Squads multisig `2g7qF5d3p2XeJALK6RzAF1sFY8Emt8LuMLXATF6hjWyy`, whose vault is
/// `Cuy6WiVdHE6Wznqos86AUwLpA4zPfPABYq3qszMa6E6A`.
///
/// issue_rewards_v0 requires the supplied supplement token account to equal this key (relaxed
/// under TESTING). Pinning the exact account, rather than only checking the token account's
/// authority, is what stops a caller routing the supplement to a different account under the
/// same authority.
pub const SUPPLEMENT_VAULT_TOKEN_ACCOUNT: Pubkey =
  pubkey!("AGPDcgpXan5RB2Y9usHvdJmmJHpyyYqcQm8KouRkK6f4");

// ── HIP 149 Decision 4: Advisory Council compensation carve-out ─────────────────────────
/// The community-nominated Council seats share 1.25% of the supplement (HIP 149 Decision 4).
/// This is a carve-out *of* the per-epoch supplement, not an addition: issue_rewards_v0 mints
/// this share to the Council fanout and the remainder to the Receiving Entity vault, so the
/// two sum to the full per-epoch supplement and the supply-tracking correction is unchanged.
/// Expressed in basis points; the HIP caps the total at 1.25%, so this is a ceiling.
pub const COUNCIL_COMPENSATION_BPS: u64 = 125;

/// The Council compensation fanout's HNT token account: the associated token account of
/// `mini_fanout` `2pCpQYrUmQor9igsF4cY7tkmd3jBQzHFEB75gtpjdWA2`.
///
/// issue_rewards_v0 requires the supplied Council token account to equal this key (relaxed
/// under TESTING). The fanout's `owner` is the governance multisig vault, never the Receiving
/// Entity, so the seated-member set changes only through a multisig action.
///
/// The pinned address fixes where the carve-out is *minted*, not where it ends up. A seated
/// member can point their own share at a delegate under their own signature, and closing the
/// fanout sweeps its balance to the owner and frees the PDA for re-initialisation by the
/// namespace keypair. Monitor the fanout's shares, not just this address.
pub const COUNCIL_FANOUT_TOKEN_ACCOUNT: Pubkey =
  pubkey!("EYbAXgLq1aRr9a9y55DbjfMdXNrZuMa69WXN9c1UR6eK");

/// The Council compensation carve-out (1.25%) of a per-sub-DAO supplement amount. The
/// remainder (`supplement - council_cut`) goes to the Receiving Entity vault.
pub fn council_cut(supplement_per_subdao: u64) -> u64 {
  ((supplement_per_subdao as u128) * (COUNCIL_COMPENSATION_BPS as u128) / 10_000) as u64
}

/// Per-sub-DAO supplement mint for `now`, using the configured windows/rates.
/// Zero outside both windows.
pub fn supplement_per_subdao(now: i64) -> u64 {
  supplement_amount(
    now,
    INFLATION_START,
    INFLATION_FLAT_END,
    INFLATION_TAPER_END,
    INFLATION_FLAT_PER_EPOCH_PER_SUBDAO,
    INFLATION_TAPER_INITIAL_PER_EPOCH_PER_SUBDAO,
  )
}

/// Pure windowing math (parameterized for testing): flat rate during the first window,
/// linear taper to zero during the second, zero otherwise.
fn supplement_amount(
  now: i64,
  start: i64,
  flat_end: i64,
  taper_end: i64,
  flat_rate: u64,
  taper_initial: u64,
) -> u64 {
  if now >= start && now < flat_end {
    flat_rate
  } else if now >= flat_end && now < taper_end {
    let remaining = taper_end.saturating_sub(now) as u128;
    let total = (taper_end - flat_end) as u128;
    (taper_initial as u128)
      .saturating_mul(remaining)
      .checked_div(total)
      .unwrap_or(0) as u64
  } else {
    0
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  // Explicit windows so the test doesn't depend on the TESTING-gated consts.
  const START: i64 = 1_000_000;
  const FLAT_END: i64 = START + 360 * EPOCH_LENGTH;
  const TAPER_END: i64 = FLAT_END + 720 * EPOCH_LENGTH;
  const FLAT: u64 = 98_000 * 100_000_000;

  fn amt(now: i64) -> u64 {
    supplement_amount(now, START, FLAT_END, TAPER_END, FLAT, FLAT)
  }

  /// Derives the supplement destination from the Receiving Entity's Squads vault rather than
  /// restating the constant, so a mistyped address, a wrong mint, or an on-curve derivation
  /// fails here. The vault itself is off-curve, which `get_associated_token_address` handles;
  /// changing the destination means changing the vault named here, deliberately.
  #[test]
  fn supplement_destination_is_the_receiving_entity_vault_hnt_ata() {
    const RECEIVING_ENTITY_VAULT: Pubkey = pubkey!("Cuy6WiVdHE6Wznqos86AUwLpA4zPfPABYq3qszMa6E6A");
    const HNT_MINT: Pubkey = pubkey!("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux");

    assert_eq!(
      SUPPLEMENT_VAULT_TOKEN_ACCOUNT,
      anchor_spl::associated_token::get_associated_token_address(
        &RECEIVING_ENTITY_VAULT,
        &HNT_MINT
      )
    );
  }

  /// Derives the Council destination through the whole chain that produced it: the fanout PDA
  /// from the mini_fanout program, the creating wallet as namespace and the seed, then that
  /// fanout's HNT associated token account. Repointing Council compensation means changing one
  /// of those inputs, deliberately, rather than editing an opaque address.
  #[test]
  fn council_destination_is_the_seated_fanout_hnt_ata() {
    const MINI_FANOUT_PROGRAM: Pubkey = pubkey!("mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn");
    const NAMESPACE: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");
    const HNT_MINT: Pubkey = pubkey!("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux");

    let (fanout, _bump) = Pubkey::find_program_address(
      &[b"mini_fanout", NAMESPACE.as_ref(), b"hip149-council"],
      &MINI_FANOUT_PROGRAM,
    );
    assert_eq!(
      fanout,
      pubkey!("2pCpQYrUmQor9igsF4cY7tkmd3jBQzHFEB75gtpjdWA2")
    );
    assert_eq!(
      COUNCIL_FANOUT_TOKEN_ACCOUNT,
      anchor_spl::associated_token::get_associated_token_address(&fanout, &HNT_MINT)
    );
  }

  /// Pins the deployed mint rate against the amount published in HIP 149 Decision 2: 98,000 HNT
  /// per sub-DAO per epoch, which across the two sub-DAO passes is the 196,000 HNT/day headline
  /// figure, and the taper opening at the same rate so the handoff neither steps up nor drops.
  ///
  /// The amounts are literals on both sides. An assertion that reads the constant it is meant to
  /// pin holds for every value that constant could take, and so states only that the window is
  /// open. The rate is not gated on TESTING, only the window is, so this holds in both builds.
  #[test]
  fn deployed_supplement_rate_matches_the_published_amount() {
    const HNT: u64 = 100_000_000;
    const SUB_DAO_PASSES_PER_EPOCH: u64 = 2;

    assert_eq!(INFLATION_FLAT_PER_EPOCH_PER_SUBDAO, 98_000 * HNT);
    assert_eq!(INFLATION_TAPER_INITIAL_PER_EPOCH_PER_SUBDAO, 98_000 * HNT);
    assert_eq!(
      INFLATION_FLAT_PER_EPOCH_PER_SUBDAO * SUB_DAO_PASSES_PER_EPOCH,
      196_000 * HNT
    );
  }

  /// Pins the deployed start timestamp and which epoch crank mints first. `cargo test --lib`
  /// builds without TESTING and so checks the mainnet value; a TESTING build must hold the
  /// dormant sentinel instead, and asserting both directions means swapping the two branches
  /// fails here either way.
  ///
  /// Both end boundaries are `INFLATION_START + N * EPOCH_LENGTH`, so what is worth pinning is
  /// `N` and the rate each crank sees, not a restatement of arithmetic the compiler performed.
  #[test]
  fn deployed_window_boundaries_match_the_published_schedule() {
    const AUG_05_0000Z: i64 = 1_785_888_000;
    const AUG_06_0000Z: i64 = 1_785_974_400;

    // Whole crank counts, in both builds: the HIP defines the windows in epochs, and a start
    // that did not sit between two crank boundaries would leave a fractional remainder.
    assert_eq!(INFLATION_FLAT_END - INFLATION_START, 360 * EPOCH_LENGTH);
    assert_eq!(INFLATION_TAPER_END - INFLATION_FLAT_END, 720 * EPOCH_LENGTH);

    if TESTING {
      assert_eq!(INFLATION_START, 4_102_444_800);
      assert_eq!(supplement_per_subdao(AUG_06_0000Z), 0);
      return;
    }

    assert_eq!(INFLATION_START, 1_785_931_200); // 2026-08-05T12:00:00Z

    // The 00:00 UTC crank on 2026-08-06 is the first one to mint; the one a day earlier
    // must not, so the Council's pre-mint review window runs its full length.
    assert_eq!(supplement_per_subdao(AUG_05_0000Z), 0);
    assert_eq!(
      supplement_per_subdao(AUG_06_0000Z),
      INFLATION_FLAT_PER_EPOCH_PER_SUBDAO
    );

    // Counted in cranks from that first minting one, so the flat window's last full-rate mint,
    // the taper's first reduced one, and the final paying crank are each pinned without
    // restating a derived timestamp. 360 flat + 720 tapering = 1,080 cranks that mint.
    let crank = |n: i64| AUG_06_0000Z + n * EPOCH_LENGTH;
    assert_eq!(
      supplement_per_subdao(crank(359)),
      INFLATION_FLAT_PER_EPOCH_PER_SUBDAO
    );
    assert!(supplement_per_subdao(crank(360)) < INFLATION_FLAT_PER_EPOCH_PER_SUBDAO);
    assert!(supplement_per_subdao(crank(1079)) > 0);
    assert_eq!(supplement_per_subdao(crank(1080)), 0);
  }

  #[test]
  fn zero_before_start() {
    assert_eq!(amt(START - 1), 0);
  }

  #[test]
  fn flat_rate_during_first_window() {
    assert_eq!(amt(START), FLAT);
    assert_eq!(amt(START + 100 * EPOCH_LENGTH), FLAT);
    assert_eq!(amt(FLAT_END - 1), FLAT);
  }

  #[test]
  fn taper_decays_linearly_to_zero() {
    // Start of taper ~ full rate.
    assert_eq!(amt(FLAT_END), FLAT);
    // Midpoint ~ half rate.
    let mid = FLAT_END + (TAPER_END - FLAT_END) / 2;
    let m = amt(mid);
    assert!(
      (m as i128 - (FLAT as i128 / 2)).abs() < (FLAT as i128 / 1000),
      "taper midpoint {m} should be ~half of {FLAT}"
    );
    // Just before the end ~ near zero, and monotonic decreasing.
    assert!(amt(TAPER_END - EPOCH_LENGTH) < FLAT / 100);
    assert!(amt(FLAT_END + 10 * EPOCH_LENGTH) > amt(FLAT_END + 11 * EPOCH_LENGTH));
  }

  #[test]
  fn zero_at_and_after_taper_end() {
    assert_eq!(amt(TAPER_END), 0);
    assert_eq!(amt(TAPER_END + 1_000_000), 0);
  }

  #[test]
  fn council_cut_is_125_bps_and_splits_cleanly() {
    // Flat per-sub-DAO amount: 1.25% carve-out, remainder to the vault, summing exactly.
    let council = council_cut(FLAT);
    assert_eq!(council, FLAT * 125 / 10_000);
    assert_eq!(council + (FLAT - council), FLAT);
    // A tiny tapered amount can round the carve-out to zero without underflowing.
    assert_eq!(council_cut(0), 0);
    assert_eq!(council_cut(79), 0); // 79 * 125 / 10000 == 0
    assert_eq!(council_cut(80), 1); // 80 * 125 / 10000 == 1
  }
}
