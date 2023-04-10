use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateDataCreditsArgsV0 {
  new_authority: Option<Pubkey>,
  hnt_price_oracle: Option<Pubkey>,
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
  if let Some(new_authority) = args.new_authority {
    ctx.accounts.data_credits.authority = new_authority;
  }

  if let Some(hnt_price_oracle) = args.hnt_price_oracle {
    ctx.accounts.data_credits.hnt_price_oracle = hnt_price_oracle;
  }

  Ok(())
}
