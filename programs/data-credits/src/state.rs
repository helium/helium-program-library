use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct DataCreditsV0 {
  pub dc_mint: Pubkey,
  pub hnt_mint: Pubkey,  // must be burned to mint dc
  pub authority: Pubkey, // EOA auth for managing this struct
  pub hnt_price_oracle: Pubkey,
  pub data_credits_bump: u8,
  pub account_payer: Pubkey,
  pub account_payer_bump: u8,
}

#[account]
#[derive(Default)]
pub struct DelegatedDataCreditsV0 {
  pub data_credits: Pubkey,
  pub sub_dao: Pubkey,
  pub escrow_account: Pubkey,
  pub router_key: String,
  pub bump: u8,
}
