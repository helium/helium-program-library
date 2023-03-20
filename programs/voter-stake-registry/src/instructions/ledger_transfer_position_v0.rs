use crate::position_seeds;
use crate::state::*;
use crate::TESTING;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token;
use anchor_spl::token::FreezeAccount;
use anchor_spl::token::ThawAccount;
use anchor_spl::token::Transfer;
use anchor_spl::token::{Mint, Token, TokenAccount};
use std::str::FromStr;

// In practice, this is the migration service which approves the legal attestation that
// this is a same owner wallet-to-wallet transfer
pub const APPROVER_KEY: &str = if TESTING {
  "mgrV3eMgfw7ocu38dSfLBjAjs4QqZtzLeaMKnTZ7QBa"
} else {
  "mgrArTL62g582wWV6iM4fwU1LKnbUikDN6akKJ76pzK"
};

#[derive(Accounts)]
pub struct LedgerTransferPositionV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(has_one = mint)]
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
  pub to: Signer<'info>,

  #[account(
    address = Pubkey::from_str(APPROVER_KEY).unwrap()
  )]
  pub approver: Signer<'info>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> LedgerTransferPositionV0<'info> {
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
pub fn handler(ctx: Context<LedgerTransferPositionV0>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[position_seeds!(ctx.accounts.position)];

  // Thaw the source
  token::thaw_account(ctx.accounts.thaw_ctx().with_signer(signer_seeds))?;
  // Transfer to dest
  token::transfer(ctx.accounts.transfer_ctx(), 1)?;
  // Freeze the dest
  token::freeze_account(ctx.accounts.freeze_ctx().with_signer(signer_seeds))?;

  Ok(())
}
