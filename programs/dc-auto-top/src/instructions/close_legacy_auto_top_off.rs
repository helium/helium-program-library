use anchor_lang::{prelude::*, solana_program::system_program};
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Token, TokenAccount},
};

use crate::auto_top_off_seeds;

const AUTHORITY: Pubkey = pubkey!("89oNwxpAssUhCHcMYd5zNrqGcGtW5kdPTfazTnNnRqst");
const HNT_MINT: Pubkey = pubkey!("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux");

#[derive(Accounts)]
pub struct CloseLegacyAutoTopOff<'info> {
  #[account(mut, address = AUTHORITY)]
  pub authority: Signer<'info>,
  #[account(
    mut,
    seeds = [b"auto_top_off", delegated_data_credits.key().as_ref(), authority.key().as_ref()],
    bump
)]
  /// CHECK: It won't deserialize because it isn't zcp.
  pub auto_top_off: UncheckedAccount<'info>,
  /// CHECK: We trust the authoirty here (it's our own multisig)
  pub delegated_data_credits: UncheckedAccount<'info>,
  #[account(
    mut,
    associated_token::mint = HNT_MINT,
    associated_token::authority = auto_top_off,
  )]
  pub hnt_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = HNT_MINT,
    associated_token::authority = authority,
  )]
  pub authority_hnt_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub dc_account: Box<Account<'info, TokenAccount>>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn close<'info>(info: AccountInfo<'info>, sol_destination: AccountInfo<'info>) -> Result<()> {
  // Transfer tokens from the account to the sol_destination.
  let dest_starting_lamports = sol_destination.lamports();
  **sol_destination.lamports.borrow_mut() =
    dest_starting_lamports.checked_add(info.lamports()).unwrap();
  **info.lamports.borrow_mut() = 0;

  info.assign(&system_program::ID);
  info.realloc(0, false).map_err(Into::into)
}

pub fn handler(ctx: Context<CloseLegacyAutoTopOff>) -> Result<()> {
  let bump: u8 = ctx.bumps.auto_top_off;
  let delegated_data_credits = ctx.accounts.delegated_data_credits.key();
  let authority = ctx.accounts.authority.key();
  let seeds: &[&[&[u8]]] = &[auto_top_off_seeds!(delegated_data_credits, authority, bump)];

  close(
    ctx.accounts.auto_top_off.to_account_info(),
    ctx.accounts.authority.to_account_info(),
  )?;

  let remaining_hnt_balance = ctx.accounts.hnt_account.amount;
  if remaining_hnt_balance > 0 {
    anchor_spl::token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::Transfer {
          from: ctx.accounts.hnt_account.to_account_info(),
          to: ctx.accounts.authority_hnt_account.to_account_info(),
          authority: ctx.accounts.auto_top_off.to_account_info(),
        },
        seeds,
      ),
      remaining_hnt_balance,
    )?;
  }

  // Close the HNT account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.hnt_account.to_account_info(),
      destination: ctx.accounts.authority.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    seeds,
  ))?;
  // Close the DC account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.dc_account.to_account_info(),
      destination: ctx.accounts.authority.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    seeds,
  ))?;

  Ok(())
}
