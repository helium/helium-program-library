use super::common::*;
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct DistributeRewardsV0<'info> {
  common: DistributeRewardsCommonV0<'info>,
  #[account(
    token::mint = common.recipient.asset,
    constraint = recipient_mint_account.amount > 0,
    constraint = recipient_mint_account.owner == common.owner.key()
  )]
  pub recipient_mint_account: Box<Account<'info, TokenAccount>>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, DistributeRewardsV0<'info>>) -> Result<()> {
  distribute_impl(&mut ctx.accounts.common)
}
