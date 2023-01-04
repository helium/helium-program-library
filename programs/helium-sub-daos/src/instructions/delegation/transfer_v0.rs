use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;
use voter_stake_registry::program::VoterStakeRegistry;
use voter_stake_registry::{
  cpi::{accounts::TransferV0 as VsrTransferV0, transfer_v0},
  state::{PositionV0, Registrar},
  TransferArgsV0 as VsrTransferArgsV0,
};

#[derive(Accounts)]
pub struct TransferV0<'info> {
  pub registrar: AccountLoader<'info, Registrar>,
  #[account(
    has_one = registrar,
    seeds = ["dao".as_bytes(), deposit_mint.key().as_ref()],
    bump = dao.bump_seed
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = source_position.bump_seed,
    has_one = registrar,
    has_one = mint
  )]
  pub source_position: Box<Account<'info, PositionV0>>,
  /// CHECK: This account needs to be closed. You can't transfer while delegated
  #[account(
    seeds = ["delegated_position".as_bytes(), source_position.key().as_ref()],
    bump,
    constraint = source_delegated_position.data_is_empty() && source_delegated_position.lamports() == 0 @ ErrorCode::PositionChangeWhileDelegated
  )]
  pub source_delegated_position: UncheckedAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub position_authority: Signer<'info>,
  #[account(
    mut,
    has_one = registrar,
  )]
  pub target_position: Box<Account<'info, PositionV0>>,
  /// CHECK: This account needs to be closed. You can't transfer while delegated
  #[account(
    seeds = ["delegated_position".as_bytes(), target_position.key().as_ref()],
    bump,
    constraint = target_delegated_position.data_is_empty() && target_delegated_position.lamports() == 0 @ ErrorCode::PositionChangeWhileDelegated
  )]
  pub target_delegated_position: UncheckedAccount<'info>,
  pub deposit_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::authority = source_position,
    associated_token::mint = deposit_mint,
  )]
  pub source_vault: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::authority = target_position,
    associated_token::mint = deposit_mint,
  )]
  pub target_vault: Box<Account<'info, TokenAccount>>,
  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TransferArgsV0 {
  pub amount: u64,
}

pub fn handler(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
  transfer_v0(
    CpiContext::new_with_signer(
      ctx.accounts.vsr_program.to_account_info(),
      VsrTransferV0 {
        registrar: ctx.accounts.registrar.to_account_info(),
        position_update_authority: ctx.accounts.dao.to_account_info(),
        source_position: ctx.accounts.source_position.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        position_token_account: ctx.accounts.position_token_account.to_account_info(),
        position_authority: ctx.accounts.position_authority.to_account_info(),
        target_position: ctx.accounts.target_position.to_account_info(),
        deposit_mint: ctx.accounts.deposit_mint.to_account_info(),
        source_vault: ctx.accounts.source_vault.to_account_info(),
        target_vault: ctx.accounts.target_vault.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
      },
      &[&[
        b"dao",
        ctx.accounts.dao.hnt_mint.key().as_ref(),
        &[ctx.accounts.dao.bump_seed],
      ]],
    ),
    VsrTransferArgsV0 {
      amount: args.amount,
    },
  )?;

  Ok(())
}
