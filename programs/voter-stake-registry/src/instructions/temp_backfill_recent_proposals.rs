use anchor_lang::prelude::*;
use shared_utils::resize_to_fit_pda;
use solana_program::pubkey;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempBackfillRecentProposalsArgs {
  pub recent_proposals: Vec<RecentProposal>,
}

const AUTHORITY: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");

#[derive(Accounts)]
pub struct TempBackfillRecentProposals<'info> {
  #[account(address = AUTHORITY)]
  pub authority: Signer<'info>,
  #[account(mut)]
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
    has_one = registrar,
    constraint = position.recent_proposals.is_empty(),
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<TempBackfillRecentProposals>,
  args: TempBackfillRecentProposalsArgs,
) -> Result<()> {
  ctx.accounts.position.recent_proposals = args.recent_proposals;
  ctx.accounts.position.registrar_paid_rent = u64::try_from(
    i64::try_from(ctx.accounts.position.registrar_paid_rent).unwrap()
      + resize_to_fit_pda(
        &ctx.accounts.registrar.to_account_info(),
        &ctx.accounts.position,
      )?,
  )
  .unwrap();

  msg!(
    "Proposals are now {:?}",
    ctx.accounts.position.recent_proposals
  );

  Ok(())
}
