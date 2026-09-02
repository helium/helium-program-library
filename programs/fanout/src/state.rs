use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

/// Dust is carried at twelve extra decimal places.
pub const TWELVE_PREC: u128 = 1_000000000000;

#[account]
#[derive(Default)]
pub struct FanoutV0 {
  pub authority: Pubkey,
  pub token_account: Pubkey,
  pub fanout_mint: Pubkey,
  pub membership_mint: Pubkey,
  pub total_shares: u64,
  pub total_staked_shares: u64,
  // Collection of NFTs minted representing a receipt voucher
  pub membership_collection: Pubkey,
  pub total_inflow: u64,
  pub last_snapshot_amount: u64,
  pub name: String,
  pub bump_seed: u8,
}

impl FanoutV0 {
  /// Fold the tokens that have arrived since `last_snapshot_amount` into
  /// `total_inflow`, scaled by `total_shares / total_staked_shares` so the
  /// staked vouchers together account for the whole arrival and the unstaked
  /// remainder accounts for none of it.
  ///
  /// `total_inflow` is the unit a voucher watermark is measured in. An arrival
  /// is attributed to whoever is staked when it is folded in, and `stake_v0`
  /// folds before it adds to `total_staked_shares`, so joining does not dilute
  /// the vouchers already there. Unstaking folds nothing in, and releases what
  /// the closing voucher was owed back to the vouchers that remain.
  ///
  /// An arrival is folded only as far as the accumulator has room for, and the
  /// snapshot advances by exactly the part that was folded, so the remainder
  /// stays pending for a later fold rather than being lost or refused. Raising
  /// `total_staked_shares` shrinks the scaling and lets more of it through, and
  /// `stake_v0` is the only instruction that raises it, so the fold stays
  /// callable at every share ratio.
  ///
  /// With nothing staked there is no share count to scale by, so the arrival
  /// stays pending and the first fold with something staked pays it out.
  pub fn accrue_inflow(&mut self, curr_balance: u64) -> Result<()> {
    if self.total_staked_shares == 0 {
      return Ok(());
    }

    let pending = curr_balance
      .checked_sub(self.last_snapshot_amount)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
    let staked = u128::from(self.total_staked_shares);
    let total = u128::from(self.total_shares);

    // `scaled = inflow * total_shares / total_staked_shares` has to land inside
    // the accumulator, so the arrival is capped at the inflow whose scaling fits.
    let headroom = u128::from(u64::MAX - self.total_inflow);
    let admissible = headroom
      .checked_mul(staked)
      .and_then(|room| room.checked_div(total))
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
    let inflow = u128::from(pending).min(admissible);
    let scaled = inflow
      .checked_mul(total)
      .and_then(|scaled| scaled.checked_div(staked))
      .and_then(|scaled| u64::try_from(scaled).ok())
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

    self.total_inflow = self
      .total_inflow
      .checked_add(scaled)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
    self.last_snapshot_amount = self
      .last_snapshot_amount
      .checked_add(u64::try_from(inflow).map_err(|_| error!(ErrorCode::ArithmeticError))?)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

    Ok(())
  }

  /// What `voucher` is owed by the accumulator, carried at `TWELVE_PREC` extra
  /// decimals so a distribution can keep the remainder as dust.
  pub fn owed_to(&self, voucher: &FanoutVoucherV0) -> Result<u128> {
    u128::from(
      self
        .total_inflow
        .checked_sub(voucher.total_inflow)
        .ok_or_else(|| error!(ErrorCode::ArithmeticError))?,
    )
    .checked_mul(TWELVE_PREC)
    .and_then(|owed| owed.checked_mul(u128::from(voucher.shares)))
    .and_then(|owed| owed.checked_div(u128::from(self.total_shares)))
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))
  }
}

#[account]
#[derive(Default)]
pub struct FanoutVoucherV0 {
  pub fanout: Pubkey,
  pub mint: Pubkey,
  pub stake_account: Pubkey,
  pub shares: u64,
  pub total_inflow: u64,
  pub total_distributed: u64,
  // dust is the amount of tokens that are not divisible by the total shares. Taken to 12 additional decimal places, we attempt to add these back in to the mix
  pub total_dust: u64,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! voucher_seeds {
  ( $voucher:expr ) => {
    &[
      b"fanout_voucher".as_ref(),
      $voucher.mint.as_ref(),
      &[$voucher.bump_seed],
    ]
  };
}

#[macro_export]
macro_rules! fanout_seeds {
  ( $fanout:expr ) => {
    &[
      b"fanout".as_ref(),
      $fanout.name.as_bytes(),
      &[$fanout.bump_seed],
    ]
  };
}

#[cfg(test)]
mod tests {
  use super::*;

  fn fanout(total_shares: u64, total_staked_shares: u64, last_snapshot_amount: u64) -> FanoutV0 {
    FanoutV0 {
      total_shares,
      total_staked_shares,
      last_snapshot_amount,
      ..Default::default()
    }
  }

  #[test]
  fn scales_an_arrival_up_to_the_full_share_base() {
    // A fifth of the shares are staked, so the accumulator has to move five
    // times the arrival for that fifth to be owed all 100 of it.
    let mut f = fanout(100, 20, 0);
    f.accrue_inflow(100).expect("accrue");

    assert_eq!(f.total_inflow, 500);
    assert_eq!(f.last_snapshot_amount, 100);
  }

  #[test]
  fn a_fully_staked_arrival_is_unscaled() {
    let mut f = fanout(100, 100, 0);
    f.accrue_inflow(100).expect("accrue");

    assert_eq!(f.total_inflow, 100);
    assert_eq!(f.last_snapshot_amount, 100);
  }

  #[test]
  fn only_the_balance_above_the_snapshot_is_new() {
    let mut f = fanout(100, 100, 40);
    f.accrue_inflow(100).expect("accrue");

    assert_eq!(f.total_inflow, 60);
    assert_eq!(f.last_snapshot_amount, 100);
  }

  #[test]
  fn accruing_the_same_balance_twice_adds_nothing() {
    let mut f = fanout(100, 25, 0);
    f.accrue_inflow(100).expect("first accrue");
    let after_first = f.total_inflow;
    f.accrue_inflow(100).expect("second accrue");

    // 100 + 100 * 75 / 25, pinning the value as well as the idempotence.
    assert_eq!(after_first, 400);
    assert_eq!(f.total_inflow, after_first);
    assert_eq!(f.last_snapshot_amount, 100);
  }

  #[test]
  fn an_arrival_with_nothing_staked_stays_pending() {
    // Seeded away from zero so that "left alone" is distinguishable from "reset".
    let mut f = fanout(100, 0, 3);
    f.total_inflow = 7;
    f.accrue_inflow(100).expect("accrue");

    // Untouched, so the next fold still sees everything above 3 as new.
    assert_eq!(f.total_inflow, 7);
    assert_eq!(f.last_snapshot_amount, 3);

    // 97 above the snapshot, scaled by 100/50, added to the 7 already there:
    // the whole 97 is owed to the first voucher to fold it in.
    f.total_staked_shares = 50;
    f.accrue_inflow(100).expect("accrue once staked");
    assert_eq!(f.total_inflow, 201);
    assert_eq!(f.last_snapshot_amount, 100);
  }

  #[test]
  fn a_balance_below_the_snapshot_is_an_error() {
    let mut f = fanout(100, 100, 60);
    assert!(f.accrue_inflow(40).is_err());
  }

  #[test]
  fn a_fold_that_does_not_fit_takes_what_does_and_leaves_the_rest() {
    // One share of u64::MAX staked scales an arrival by u64::MAX, so a single
    // unit fills the accumulator. The snapshot advances by exactly that unit,
    // never past the part that was not accumulated.
    let mut f = fanout(u64::MAX, 1, 0);
    f.accrue_inflow(2).expect("fold stays callable");

    assert_eq!(f.total_inflow, u64::MAX);
    assert_eq!(f.last_snapshot_amount, 1);
  }

  #[test]
  fn a_full_accumulator_folds_nothing_and_moves_no_snapshot() {
    let mut f = fanout(100, 100, 0);
    f.total_inflow = u64::MAX;
    f.accrue_inflow(50).expect("fold stays callable");

    assert_eq!(f.total_inflow, u64::MAX);
    assert_eq!(f.last_snapshot_amount, 0);
  }

  #[test]
  fn owed_to_is_the_voucher_s_fraction_of_the_accumulator_since_its_watermark() {
    let mut f = fanout(100, 100, 0);
    f.total_inflow = 500;
    let voucher = FanoutVoucherV0 {
      shares: 20,
      total_inflow: 100,
      ..Default::default()
    };

    // (500 - 100) * 20 / 100, carried at twelve extra decimals.
    assert_eq!(f.owed_to(&voucher).expect("owed"), 80 * TWELVE_PREC);
  }
}
