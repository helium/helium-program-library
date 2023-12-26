use crate::error::*;
use anchor_lang::__private::bytemuck::Zeroable;
use anchor_lang::prelude::*;

const SCALED_FACTOR_BASE: u64 = 1_000_000_000;

// Exchange rate for an asset that can be used to mint voting rights.
//
// See documentation of configure_voting_mint for details on how
// native token amounts convert to vote weight.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct VotingMintConfigV0 {
  // Mint for this entry.
  pub mint: Pubkey,

  // Vote weight factor for all funds in the account, no matter if locked or not.
  //
  // In 1/SCALED_FACTOR_BASE units.
  pub baseline_vote_weight_scaled_factor: u64,

  // Maximum extra vote weight factor for lockups.
  //
  // This is the extra votes gained for lockups lasting lockup_saturation_secs or
  // longer. Shorter lockups receive only a fraction of the maximum extra vote weight,
  // based on lockup_time divided by lockup_saturation_secs.
  //
  // In 1/SCALED_FACTOR_BASE units.
  pub max_extra_lockup_vote_weight_scaled_factor: u64,

  // Genesis vote power multipliers for lockups.
  //
  // This is a multiplier applied to voting power for lockups created before
  // genesis_extra_lockup_expiration
  pub genesis_vote_power_multiplier: u8,

  // Timestamp of when to stop applying the genesis_extra_lockup_vote_weight_scaled_factor
  pub genesis_vote_power_multiplier_expiration_ts: i64,

  // Number of seconds of lockup needed to reach the maximum lockup bonus.
  pub lockup_saturation_secs: u64,

  // Used to be digit shift, now reserved
  pub reserved: i8,
}

impl VotingMintConfigV0 {
  // Apply a factor in SCALED_FACTOR_BASE units.
  fn apply_factor(base: u64, factor: u64) -> Result<u128> {
    let compute = || -> Option<u128> {
      (base as u128)
        .checked_mul(factor as u128)?
        .checked_div(SCALED_FACTOR_BASE as u128)
    };
    compute().ok_or_else(|| error!(VsrError::VoterWeightOverflow))
  }

  // The vote weight a deposit of a number of native tokens should have.
  //
  // This vote_weight is a component for all funds in a voter account, no
  // matter if locked up or not.//
  pub fn baseline_vote_weight(&self, amount_native: u64) -> Result<u128> {
    Self::apply_factor(amount_native, self.baseline_vote_weight_scaled_factor)
  }

  // The maximum extra vote weight a number of locked up native tokens can have.
  // Will be multiplied with a factor between 0 and 1 for the lockup duration.
  pub fn max_extra_lockup_vote_weight(&self, amount_native: u64) -> Result<u128> {
    Self::apply_factor(
      amount_native,
      self.max_extra_lockup_vote_weight_scaled_factor,
    )
  }

  // Whether this voting mint is configured.
  pub fn in_use(&self) -> bool {
    self.mint != Pubkey::default()
  }
}

unsafe impl Zeroable for VotingMintConfigV0 {}
