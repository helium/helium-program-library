use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct DataCreditsV0 {
  pub dc_mint: Pubkey,
  pub hnt_mint: Pubkey,        // must be burned to mint dc
  pub authority: Pubkey,       // EOA auth for managing this struct
  pub token_authority: Pubkey, // PDA that holds mint/freeze auth for dc_mint
  pub token_authority_bump: u8,
  pub data_credits_bump: u8,
}
