use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token,
  token::{FreezeAccount, Mint, ThawAccount, Token, TokenAccount, Transfer},
};

use crate::{position_seeds, state::*};

#[derive(Accounts)]
pub struct TransferPositionV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    has_one = mint,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = position.bump_seed,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    mut,
    constraint = mint.supply == 1,
    mint::decimals = 0,
    mint::authority = position,
    mint::freeze_authority = position,
  )]
  pub mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    associated_token::mint = mint,
    associated_token::authority = from,
  )]
  pub from_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = to,
  )]
  pub to_token_account: Box<Account<'info, TokenAccount>>,

  pub from: Signer<'info>,
  /// CHECK: Destination may be any address.
  pub to: UncheckedAccount<'info>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> TransferPositionV0<'info> {
  fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
      from: self.from_token_account.to_account_info(),
      to: self.to_token_account.to_account_info(),
      authority: self.from.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn freeze_ctx(&self) -> CpiContext<'_, '_, '_, 'info, FreezeAccount<'info>> {
    let cpi_accounts = FreezeAccount {
      account: self.to_token_account.to_account_info(),
      mint: self.mint.to_account_info(),
      authority: self.position.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn thaw_ctx(&self) -> CpiContext<'_, '_, '_, 'info, ThawAccount<'info>> {
    let cpi_accounts = ThawAccount {
      account: self.from_token_account.to_account_info(),
      mint: self.mint.to_account_info(),
      authority: self.position.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

/// NOTE: This endpoint must only be used by those transferring a position from one wallet
/// they own to another wallet they own. The approver checks this legal requirement.
pub fn handler(ctx: Context<TransferPositionV0>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[position_seeds!(ctx.accounts.position)];

  // Thaw the source
  token::thaw_account(ctx.accounts.thaw_ctx().with_signer(signer_seeds))?;
  // Transfer to dest
  token::transfer(ctx.accounts.transfer_ctx(), 1)?;
  // Freeze the dest
  token::freeze_account(ctx.accounts.freeze_ctx().with_signer(signer_seeds))?;

  Ok(())
}
