use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateDataCreditsArgsV0 {
  new_authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: UpdateDataCreditsArgsV0)]
pub struct UpdateDataCreditsV0<'info> {
  #[account(
    mut,
    seeds = ["dc".as_bytes(), dc_mint.key().as_ref()],
    bump = data_credits.data_credits_bump,
    has_one = authority,
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  pub dc_mint: Box<Account<'info, Mint>>,
  pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateDataCreditsV0>, args: UpdateDataCreditsArgsV0) -> Result<()> {
  ctx.accounts.data_credits.authority = args.new_authority;
  Ok(())
}
