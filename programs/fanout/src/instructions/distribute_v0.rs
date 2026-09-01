use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::ErrorCode, fanout_seeds, FanoutV0, FanoutVoucherV0, TWELVE_PREC};

#[derive(Accounts)]
pub struct DistributeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    mut,
    has_one = token_account,
    has_one = fanout_mint,
  )]
  pub fanout: Box<Account<'info, FanoutV0>>,
  pub fanout_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Just verified on associated token and receipt
  pub owner: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = fanout_mint,
    associated_token::authority = owner,
    constraint = to_account.key() != token_account.key() @ ErrorCode::InvalidDestination,
  )]
  pub to_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["fanout_voucher".as_bytes(), mint.key().as_ref()],
    bump = voucher.bump_seed,
    has_one = fanout,
    has_one = mint
  )]
  pub voucher: Box<Account<'info, FanoutVoucherV0>>,

  pub mint: Box<Account<'info, Mint>>,
  #[account(
    associated_token::mint = mint,
    associated_token::authority = owner,
    constraint = receipt_account.amount > 0
  )]
  pub receipt_account: Box<Account<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

impl<'info> DistributeV0<'info> {
  fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
      from: self.token_account.to_account_info(),
      to: self.to_account.to_account_info(),
      authority: self.fanout.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<DistributeV0>) -> Result<()> {
  let curr_balance = ctx.accounts.token_account.amount;
  ctx.accounts.fanout.accrue_inflow(curr_balance)?;

  let dist_amount = ctx.accounts.fanout.owed_to(&ctx.accounts.voucher)?;

  let mut dist_amount_u64: u64 = dist_amount
    .checked_div(TWELVE_PREC)
    .unwrap()
    .try_into()
    .unwrap();

  // Account for dust
  let dust: u64 = dist_amount
    .checked_sub(
      u128::from(dist_amount_u64)
        .checked_mul(TWELVE_PREC)
        .unwrap(),
    )
    .unwrap()
    .try_into()
    .unwrap();

  let new_dust = dust + ctx.accounts.voucher.total_dust;
  let whole_dust = new_dust
    .checked_div(u64::try_from(TWELVE_PREC).unwrap())
    .unwrap();
  if whole_dust >= 1 {
    dist_amount_u64 += whole_dust;
    ctx.accounts.voucher.total_dust = new_dust
      .checked_sub(u64::try_from(TWELVE_PREC).unwrap())
      .unwrap();
  } else {
    ctx.accounts.voucher.total_dust = new_dust;
  }

  let signer_seeds: &[&[u8]] = fanout_seeds!(ctx.accounts.fanout);
  token::transfer(
    ctx.accounts.transfer_ctx().with_signer(&[signer_seeds]),
    dist_amount_u64,
  )?;

  // The snapshot tracks the balance that has already been folded into
  // `total_inflow`, so it drops by what this distribution took out of the vault.
  ctx.accounts.fanout.last_snapshot_amount = ctx
    .accounts
    .fanout
    .last_snapshot_amount
    .checked_sub(dist_amount_u64)
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
  ctx.accounts.voucher.total_inflow = ctx.accounts.fanout.total_inflow;
  ctx.accounts.voucher.total_distributed = ctx
    .accounts
    .voucher
    .total_distributed
    .checked_add(dist_amount_u64)
    .unwrap();

  Ok(())
}
