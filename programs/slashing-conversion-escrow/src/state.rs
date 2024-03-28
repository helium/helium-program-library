use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct SlashingConversionEscrowV0 {
  pub main_conversion_escrow: Pubkey,
  pub slashing_conversion_escrow: Pubkey,
  /// 50% funds slashed to this account, other 50% on main conversion.
  pub insurance_fund: Pubkey,
  pub owner: Pubkey,
}
