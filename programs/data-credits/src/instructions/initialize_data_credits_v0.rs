use crate::errors::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, SetAuthority};
use anchor_spl::token::{Mint, Token};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDataCreditsArgsV0 {
  authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeDataCreditsArgsV0)]
pub struct InitializeDataCreditsV0<'info> {
  #[account(
    init, // prevents from reinit attack
    payer = payer,
    space = 60 + std::mem::size_of::<DataCreditsV0>(),
    seeds = ["dc".as_bytes(), dc_mint.key().as_ref()],
    bump,
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,

  pub mint_authority: Signer<'info>,
  pub freeze_authority: Signer<'info>,

  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["account_payer".as_bytes()],
    bump,
  )]
  pub account_payer: AccountInfo<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeDataCreditsV0>,
  args: InitializeDataCreditsArgsV0,
) -> Result<()> {
  ctx.accounts.data_credits.dc_mint = ctx.accounts.dc_mint.key();
  ctx.accounts.data_credits.hnt_mint = ctx.accounts.hnt_mint.key();
  ctx.accounts.data_credits.authority = args.authority;

  ctx.accounts.data_credits.data_credits_bump = *ctx
    .bumps
    .get("data_credits")
    .ok_or(DataCreditsErrors::BumpNotAvailable)?;

  ctx.accounts.data_credits.account_payer = ctx.accounts.account_payer.key();
  ctx.accounts.data_credits.account_payer_bump = *ctx
    .bumps
    .get("account_payer")
    .ok_or(DataCreditsErrors::BumpNotAvailable)?;

  msg!("Claiming mint and freeze authority");
  let dc_authority = Some(*ctx.accounts.data_credits.to_account_info().key);
  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.dc_mint.to_account_info(),
        current_authority: ctx.accounts.mint_authority.to_account_info(),
      },
    ),
    AuthorityType::MintTokens,
    dc_authority,
  )?;
  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.dc_mint.to_account_info(),
        current_authority: ctx.accounts.freeze_authority.to_account_info(),
      },
    ),
    AuthorityType::FreezeAccount,
    dc_authority,
  )?;
  Ok(())
}
