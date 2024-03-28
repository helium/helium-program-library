use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use conversion_escrow::{
  cpi::{accounts::InitializeEscrowV0, initialize_escrow_v0},
  program::ConversionEscrow,
  ConversionTargetArgV0, InitializeEscrowArgsV0,
};

use crate::{maker_seeds, MakerV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeMakerEscrowArgsV0 {
  pub oracle: Pubkey,
  pub targets: Vec<MConversionTargetArgV0>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MConversionTargetArgV0 {
  pub mint: Pubkey,
  pub oracle: Pubkey,
  /// How much slippage to allow from the oracle price
  pub slippage_bps: u16,
}

#[derive(Accounts)]
#[instruction(args: InitializeMakerEscrowArgsV0)]
pub struct InitializeMakerEscrowV0<'info> {
  #[account(
    has_one = update_authority,
  )]
  pub maker: Account<'info, MakerV0>,
  pub update_authority: Signer<'info>,
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Checked in CPI
  #[account(
    mut,
    seeds = [b"conversion_escrow", mint.key().as_ref(), maker.key().as_ref()],
    bump,
    seeds::program = conversion_escrow_program.key(),
  )]
  pub conversion_escrow: UncheckedAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked in CPI
  #[account(mut)]
  pub escrow: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub conversion_escrow_program: Program<'info, ConversionEscrow>,
}

pub fn handler(
  ctx: Context<InitializeMakerEscrowV0>,
  args: InitializeMakerEscrowArgsV0,
) -> Result<()> {
  initialize_escrow_v0(
    CpiContext::new_with_signer(
      ctx.accounts.conversion_escrow_program.to_account_info(),
      InitializeEscrowV0 {
        payer: ctx.accounts.payer.to_account_info(),
        owner: ctx.accounts.maker.to_account_info(),
        update_authority: ctx.accounts.update_authority.to_account_info(),
        conversion_escrow: ctx.accounts.conversion_escrow.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        escrow: ctx.accounts.escrow.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
      &[maker_seeds!(ctx.accounts.maker)],
    ),
    InitializeEscrowArgsV0 {
      oracle: args.oracle,
      targets: args
        .targets
        .iter()
        .map(|t| ConversionTargetArgV0 {
          mint: t.mint,
          oracle: t.oracle,
          slippage_bps: t.slippage_bps,
        })
        .collect(),
    },
  )?;

  Ok(())
}
