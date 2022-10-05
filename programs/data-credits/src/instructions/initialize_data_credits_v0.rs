use crate::errors::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDataCreditsV0Args {
  authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeDataCreditsV0Args)]
pub struct InitializeDataCreditsV0<'info> {
  #[account(
    init, // prevents from reinit attack
    payer = payer,
    space = 60 + std::mem::size_of::<DataCreditsV0>(),
    seeds = ["dc".as_bytes()],
    bump,
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  pub hnt_mint: Box<Account<'info, Mint>>,
  pub dc_mint: Box<Account<'info, Mint>>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeDataCreditsV0>,
  args: InitializeDataCreditsV0Args,
) -> Result<()> {
  ctx.accounts.data_credits.dc_mint = ctx.accounts.dc_mint.key();
  ctx.accounts.data_credits.hnt_mint = ctx.accounts.hnt_mint.key();
  ctx.accounts.data_credits.authority = args.authority;

  ctx.accounts.data_credits.data_credits_bump = *ctx
    .bumps
    .get("data_credits")
    .ok_or(DataCreditsErrors::BumpNotAvailable)?;
  Ok(())
}