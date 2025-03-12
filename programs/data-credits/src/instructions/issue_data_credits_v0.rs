use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{freeze_account, transfer, FreezeAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::DataCreditsErrors, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueDataCreditsArgsV0 {
  amount: u64,
}

#[derive(Accounts)]
#[instruction(args: IssueDataCreditsArgsV0)]
pub struct IssueDataCreditsV0<'info> {
  #[account(
    has_one = dc_mint,
    seeds = ["dc".as_bytes(), dc_mint.key().as_ref()],
    bump = data_credits.data_credits_bump
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  /// CHECK: Just needed for ata
  pub to: AccountInfo<'info>,
  /// CHECK: Just needed for ata
  #[account(mut)]
  pub from: Signer<'info>,
  #[account(
    init_if_needed,
    payer = from,
    associated_token::authority = from,
    associated_token::mint = dc_mint,
    constraint = from_account.key() != to_account.key()
  )]
  pub from_account: Account<'info, TokenAccount>,
  #[account(
    init_if_needed,
    payer = from,
    associated_token::authority = to,
    associated_token::mint = dc_mint
  )]
  pub to_account: Account<'info, TokenAccount>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

// Transfer data credits to someone and freeze them. This is only used during genesis
pub fn handler(ctx: Context<IssueDataCreditsV0>, args: IssueDataCreditsArgsV0) -> Result<()> {
  if cfg!(feature = "no-genesis") {
    return Err(DataCreditsErrors::NoGenesis.into());
  }

  let signer_seeds: &[&[&[u8]]] = &[&[
    "dc".as_bytes(),
    ctx.accounts.dc_mint.to_account_info().key.as_ref(),
    &[ctx.accounts.data_credits.data_credits_bump],
  ]];

  transfer(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.from_account.to_account_info(),
        to: ctx.accounts.to_account.to_account_info(),
        authority: ctx.accounts.from.to_account_info(),
      },
    ),
    args.amount,
  )?;

  freeze_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    FreezeAccount {
      account: ctx.accounts.to_account.to_account_info(),
      mint: ctx.accounts.dc_mint.to_account_info(),
      authority: ctx.accounts.data_credits.to_account_info(),
    },
    signer_seeds,
  ))?;

  Ok(())
}
