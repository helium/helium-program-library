use std::str::FromStr;

use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct RepairVoteMarkerSizes<'info> {
  #[account(
    mut,
    address = Pubkey::from_str(
      "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW"
    ).unwrap()
  )]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = voter,
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  /// CHECK: Just refunding
  #[account(mut)]
  pub voter: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RepairVoteMarkerSizes>) -> Result<()> {
  let new_size =
    8 + 32 + std::mem::size_of::<VoteMarkerV0>() + 1 + 2 * ctx.accounts.marker.choices.len();

  ctx
    .accounts
    .marker
    .to_account_info()
    .realloc(new_size, false)?;

  Ok(())
}
