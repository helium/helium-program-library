use crate::ConversionTargetV0;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};

use crate::ConversionEscrowV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeEscrowArgsV0 {
  pub oracle: Pubkey,
  pub targets: Vec<ConversionTargetArgV0>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ConversionTargetArgV0 {
  pub mint: Pubkey,
  pub oracle: Pubkey,
  /// How much slippage to allow from the oracle price
  pub slippage_bps: u16,
}

#[derive(Accounts)]
#[instruction(args: InitializeEscrowArgsV0)]
pub struct InitializeEscrowV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: The owner of this account. Can fully withdraw
  pub owner: Signer<'info>,
  #[account(
    init,
    payer = payer,
    seeds = [b"conversion_escrow", mint.key().as_ref(), owner.key().as_ref()],
    bump,
    space = std::mem::size_of::<ConversionEscrowV0>() + 60 + std::mem::size_of::<ConversionTargetV0>() * args.targets.len(),
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
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<InitializeEscrowV0>, args: InitializeEscrowArgsV0) -> Result<()> {
  ctx
    .accounts
    .conversion_escrow
    .set_inner(ConversionEscrowV0 {
      oracle: args.oracle,
      escrow: ctx.accounts.escrow.key(),
      mint: ctx.accounts.mint.key(),
      targets: args
        .targets
        .iter()
        .map(|t| ConversionTargetV0 {
          reserverd: [0; 8],
          mint: t.mint,
          oracle: t.oracle,
          slipage_bps: t.slippage_bps,
        })
        .collect(),
      owner: ctx.accounts.owner.key(),
      bump_seed: ctx.bumps["conversion_escrow"],
    });

  Ok(())
}
