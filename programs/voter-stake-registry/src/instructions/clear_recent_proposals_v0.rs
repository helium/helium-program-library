use anchor_lang::prelude::*;
use shared_utils::resize_to_fit_pda;
use solana_program::pubkey;

use crate::state::*;

const HSD_ID: Pubkey = pubkey!("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ClearRecentProposalsArgsV0 {
  pub ts: i64,
  pub dao_bump: u8,
}

#[derive(Accounts)]
#[instruction(args: ClearRecentProposalsArgsV0)]
pub struct ClearRecentProposalsV0<'info> {
  #[account(mut)]
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
    has_one = registrar,
)]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    seeds = ["dao".as_bytes(), registrar.realm_governing_token_mint.key().as_ref()],
    bump = args.dao_bump,
    seeds::program = HSD_ID
  )]
  pub dao: Signer<'info>,
}

pub fn handler(
  ctx: Context<ClearRecentProposalsV0>,
  args: ClearRecentProposalsArgsV0,
) -> Result<()> {
  ctx.accounts.position.remove_proposals_older_than(args.ts);
  ctx.accounts.position.registrar_paid_rent = u64::try_from(
    i64::try_from(ctx.accounts.position.registrar_paid_rent).unwrap()
      + resize_to_fit_pda(
        &ctx.accounts.registrar.to_account_info(),
        &ctx.accounts.position,
      )?,
  )
  .unwrap();

  Ok(())
}
