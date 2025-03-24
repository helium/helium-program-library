use anchor_lang::prelude::*;
use solana_program::pubkey;

use crate::state::*;

const AUTHORITY: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");

#[derive(Accounts)]
pub struct TempBackfillDaoRecentProposals<'info> {
  #[account(address = AUTHORITY)]
  pub authority: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
}

pub fn handler(ctx: Context<TempBackfillDaoRecentProposals>) -> Result<()> {
  ctx.accounts.dao_epoch_info.recent_proposals = ctx.accounts.dao.recent_proposals.clone();
  Ok(())
}
