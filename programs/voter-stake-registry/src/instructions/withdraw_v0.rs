use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{error::*, position_seeds, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct WithdrawArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgsV0)]
pub struct WithdrawV0<'info> {
  #[account(mut)]
  pub position_authority: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,

  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = position.bump_seed,
    constraint = position.num_active_votes == 0,
    has_one = registrar,
    has_one = mint,
    constraint = position.amount_unlocked(registrar.clock_unix_timestamp()) >= args.amount @ VsrError::InsufficientUnlockedTokens
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = position_authority,
    associated_token::mint = mint,
    associated_token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,

  #[account(
    mut,
    associated_token::authority = position,
    associated_token::mint = deposit_mint.key(),
  )]
  pub vault: Box<Account<'info, TokenAccount>>,
  pub deposit_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = position_authority,
    associated_token::mint = deposit_mint,
    associated_token::authority = position_authority
  )]
  pub destination: Box<Account<'info, TokenAccount>>,

  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

impl<'info> WithdrawV0<'info> {
  pub fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let program = self.token_program.to_account_info();
    let accounts = Transfer {
      from: self.vault.to_account_info(),
      to: self.destination.to_account_info(),
      authority: self.position.to_account_info(),
    };
    CpiContext::new(program, accounts)
  }
}

/// Withdraws tokens from a deposit entry, if they are unlocked
///
/// `deposit_entry_index`: The deposit entry to withdraw from.
pub fn handler(ctx: Context<WithdrawV0>, args: WithdrawArgsV0) -> Result<()> {
  let amount = args.amount;

  // Transfer the tokens to withdraw.
  let seeds = position_seeds!(ctx.accounts.position);
  transfer(ctx.accounts.transfer_ctx().with_signer(&[seeds]), amount)?;

  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;

  let mint_idx = registrar.voting_mint_config_index(ctx.accounts.destination.mint)?;

  let curr_ts = registrar.clock_unix_timestamp();

  require_eq!(
    mint_idx,
    position.voting_mint_config_idx as usize,
    VsrError::InvalidMint
  );

  // Bookkeeping for withdrawn funds.
  require_gte!(
    position.amount_deposited_native,
    amount,
    VsrError::InternalProgramError
  );
  position.amount_deposited_native = position
    .amount_deposited_native
    .checked_sub(amount)
    .unwrap();

  msg!(
    "Withdrew amount {} with lockup kind {:?} and {} seconds left",
    amount,
    position.lockup.kind,
    position.lockup.seconds_left(curr_ts),
  );

  Ok(())
}
