use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::metadata::Metadata;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct BurnNft<'info> {
  /// CHECK: Checked with cpi
  pub metadata: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub owner: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub mint: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub token: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub spl_token: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub edition: AccountInfo<'info>,
}

pub fn burn_nft<'a, 'b, 'c, 'info>(
  ctx: CpiContext<'a, 'b, 'c, 'info, BurnNft<'info>>,
) -> Result<()> {
  let ix = mpl_token_metadata::instruction::burn_nft(
    mpl_token_metadata::ID,
    *ctx.accounts.metadata.key,
    *ctx.accounts.owner.key,
    *ctx.accounts.mint.key,
    *ctx.accounts.token.key,
    *ctx.accounts.edition.key,
    *ctx.accounts.spl_token.key,
    None,
  );

  solana_program::program::invoke_signed(
    &ix,
    &[
      ctx.accounts.metadata.clone(),
      ctx.accounts.mint.clone(),
      ctx.accounts.owner.clone(),
      ctx.accounts.token.clone(),
      ctx.accounts.edition.clone(),
      ctx.program.clone(),
      ctx.accounts.spl_token.clone(),
    ],
    ctx.signer_seeds,
  )
  .map_err(|e| e.into())
}

#[derive(Accounts)]
pub struct ClosePositionV0<'info> {
  /// CHECK: Destination may be any address.
  #[account(mut)]
  pub sol_destination: UncheckedAccount<'info>,
  // checking the PDA address it just an extra precaution,
  // the other constraints must be exhaustive
  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = position.bump_seed,
    close = sol_destination,
    has_one = mint,
    constraint = position.amount_deposited_native == 0,
    constraint = position.num_active_votes == 0,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), mint.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  /// CHECK: Checked by cpi
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), mint.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub position_authority: Signer<'info>,
  pub token_program: Program<'info, Token>,
  pub token_metadata_program: Program<'info, Metadata>,
}

/// Close an empty position
pub fn handler(ctx: Context<ClosePositionV0>) -> Result<()> {
  burn_nft(CpiContext::new(
    ctx
      .accounts
      .token_metadata_program
      .to_account_info()
      .clone(),
    BurnNft {
      metadata: ctx.accounts.metadata.to_account_info().clone(),
      owner: ctx.accounts.position_authority.to_account_info().clone(),
      mint: ctx.accounts.mint.to_account_info().clone(),
      token: ctx
        .accounts
        .position_token_account
        .to_account_info()
        .clone(),
      spl_token: ctx.accounts.token_program.to_account_info().clone(),
      edition: ctx.accounts.master_edition.to_account_info().clone(),
    },
  ))?;
  Ok(())
}
