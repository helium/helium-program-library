use std::str::FromStr;

use anchor_lang::prelude::*;

use crate::state::{NftVoteRecord, PositionV0};

#[derive(Accounts)]
pub struct AdminCloseNftVoteRecord<'info> {
  #[account(
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub admin: Signer<'info>,
  #[account(
    mut,
    close = governing_token_owner,
    has_one = governing_token_owner,
  )]
  pub vote_record: Account<'info, NftVoteRecord>,
  #[account(
    mut,
    seeds = [b"position".as_ref(), vote_record.nft_mint.as_ref()],
    bump = position.bump_seed
  )]
  pub position: Account<'info, PositionV0>,
  /// CHECK: Checked by has one, just receiving sol.
  #[account(mut)]
  pub governing_token_owner: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AdminCloseNftVoteRecord>) -> Result<()> {
  ctx.accounts.position.num_active_votes -= 1;
  Ok(())
}
