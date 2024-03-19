use crate::errors::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use pyth_sdk_solana::load_price_feed_from_account_info;

use crate::ConversionEscrowV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeEscrowArgsV0 {
  pub slippage_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeEscrowV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: The owner of this account. Can fully withdraw
  pub owner: UncheckedAccount<'info>,
  /// CHECK: The authority to issue dc conversions with funds from this account
  pub convert_authority: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    seeds = [b"conversion_escrow", mint.key().as_ref(), owner.key().as_ref()],
    bump,
    space = ConversionEscrowV0::INIT_SPACE + 60,
  )]
  pub conversion_escrow: Box<Account<'info, ConversionEscrowV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    associated_token::authority = conversion_escrow,
    associated_token::mint = mint
  )]
  pub escrow: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub oracle: AccountInfo<'info>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<InitializeEscrowV0>, args: InitializeEscrowArgsV0) -> Result<()> {
  load_price_feed_from_account_info(&ctx.accounts.oracle).map_err(|e| {
    msg!("Pyth error {}", e);
    error!(ErrorCode::PythError)
  })?;

  ctx
    .accounts
    .conversion_escrow
    .set_inner(ConversionEscrowV0 {
      oracle: ctx.accounts.oracle.key(),
      escrow: ctx.accounts.escrow.key(),
      mint: ctx.accounts.escrow.mint.key(),
      slipage_bps: args.slippage_bps,
      owner: ctx.accounts.owner.key(),
      bump_seed: ctx.bumps["conversion_escrow"],
    });

  Ok(())
}
