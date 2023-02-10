use crate::{position_seeds, state::*};
use anchor_lang::prelude::*;
use anchor_spl::metadata::Metadata;
use anchor_spl::token::{self, Burn, Mint, ThawAccount, Token, TokenAccount};

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
    has_one = registrar,
    constraint = position.amount_deposited_native == 0,
    constraint = position.num_active_votes == 0,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    has_one = collection
  )]
  pub registrar: Box<Account<'info, Registrar>>,
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_metadata: UncheckedAccount<'info>,
  #[account(mut)]
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), mint.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  /// CHECK: Checked by cpi
  pub metadata: UncheckedAccount<'info>,
  #[account(
    mut,
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
  let signer_seeds: &[&[&[u8]]] = &[position_seeds!(ctx.accounts.position)];
  token::thaw_account(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      ThawAccount {
        account: ctx.accounts.position_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.position.to_account_info(),
      },
    )
    .with_signer(signer_seeds),
  )?;

  token::burn(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.position_token_account.to_account_info(),
        authority: ctx.accounts.position_authority.to_account_info(),
      },
    ),
    1,
  )?;
  Ok(())
}
