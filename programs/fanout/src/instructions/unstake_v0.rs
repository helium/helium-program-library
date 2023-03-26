use crate::{state::*, voucher_seeds};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct UnstakeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  /// CHECK: Destination may be any address.
  #[account(mut)]
  pub sol_destination: UncheckedAccount<'info>,
  // checking the PDA address it just an extra precaution,
  // the other constraints must be exhaustive
  #[account(
    mut,
    close = sol_destination,
    has_one = mint,
    has_one = fanout,
    has_one = stake_account
  )]
  pub voucher: Box<Account<'info, FanoutVoucherV0>>,
  #[account(mut)]
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    has_one = membership_mint
  )]
  pub fanout: Box<Account<'info, FanoutV0>>,
  pub membership_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    token::mint = mint,
    token::authority = voucher_authority,
    constraint = voucher_token_account.amount > 0
  )]
  pub voucher_token_account: Box<Account<'info, TokenAccount>>,
  pub voucher_authority: Signer<'info>,

  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = membership_mint,
    associated_token::authority = voucher_authority,
  )]
  pub to_account: Box<Account<'info, TokenAccount>>,
  pub stake_account: Box<Account<'info, TokenAccount>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

impl<'info> UnstakeV0<'info> {
  fn unstake_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
      from: self.stake_account.to_account_info(),
      to: self.to_account.to_account_info(),
      authority: self.voucher.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    CpiContext::new(
      self.token_program.to_account_info(),
      Burn {
        mint: self.mint.to_account_info(),
        from: self.voucher_token_account.to_account_info(),
        authority: self.voucher_authority.to_account_info(),
      },
    )
  }
}

/// Close an empty voucher
pub fn handler(ctx: Context<UnstakeV0>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[voucher_seeds!(ctx.accounts.voucher)];
  ctx.accounts.fanout.total_staked_shares = ctx
    .accounts
    .fanout
    .total_staked_shares
    .checked_sub(ctx.accounts.stake_account.amount)
    .unwrap();

  // Give back the stake and burn the receipt
  token::transfer(
    ctx.accounts.unstake_ctx().with_signer(signer_seeds),
    ctx.accounts.stake_account.amount,
  )?;
  token::burn(ctx.accounts.burn_ctx(), 1)?;

  Ok(())
}
