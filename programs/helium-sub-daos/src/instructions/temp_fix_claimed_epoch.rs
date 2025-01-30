use std::str::FromStr;

use anchor_lang::prelude::*;

use crate::DelegatedPositionV0;

#[derive(Accounts)]
pub struct TempFixClaimedEpoch<'info> {
  #[account(
    mut,
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub authority: Signer<'info>,
  #[account(mut)]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TempFixClaimedEpoch>) -> Result<()> {
  ctx.accounts.delegated_position.set_unclaimed(20117)?;

  Ok(())
}
