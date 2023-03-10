use crate::state::*;
use anchor_lang::prelude::*;
use shared_utils::resize_to_fit;

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct RepairRegistrarArgsV0 {
  pub collection: Pubkey,
  pub bump_seed: u8,
  pub collection_bump_seed: u8,
}

#[derive(Accounts)]
pub struct RepairRegistrarV0<'info> {
  #[account(mut, has_one = realm_authority)]
  pub registrar: Box<Account<'info, Registrar>>,
  pub realm_authority: Signer<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RepairRegistrarV0>, args: RepairRegistrarArgsV0) -> Result<()> {
  ctx.accounts.registrar.collection = args.collection;
  ctx.accounts.registrar.bump_seed = args.bump_seed;
  ctx.accounts.registrar.collection_bump_seed = args.collection_bump_seed;
  ctx.accounts.registrar.reserved = [0; 8];
  ctx.accounts.registrar.voting_mints = Vec::new();

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.registrar,
  )?;

  Ok(())
}
