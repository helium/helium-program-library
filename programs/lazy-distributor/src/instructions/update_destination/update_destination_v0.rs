use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct UpdateDestinationV0<'info> {
  #[account(mut)]
  pub recipient: Box<Account<'info, RecipientV0>>,
  pub owner: Signer<'info>,
  /// CHECK: User provided destination
  pub destination: UncheckedAccount<'info>,
  #[account(
    token::mint = recipient.asset,
    constraint = recipient_mint_account.amount > 0,
    constraint = recipient_mint_account.owner == owner.key()
  )]
  pub recipient_mint_account: Box<Account<'info, TokenAccount>>,
}

pub fn handler<'info>(ctx: Context<UpdateDestinationV0>) -> Result<()> {
  ctx.accounts.recipient.destination = ctx.accounts.destination.key();

  Ok(())
}
