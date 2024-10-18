use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token,
  token::{Mint, Token, TokenAccount},
};

use crate::{error::*, position_seeds, state::*};

#[derive(Accounts)]
pub struct TransferV0<'info> {
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: Checked conditionally based on registrar
  #[account(
    constraint = registrar.position_update_authority.map(|k|
      k == *position_update_authority.key
    ).unwrap_or(true) @ VsrError::UnauthorizedPositionUpdateAuthority,
  )]
  pub position_update_authority: Signer<'info>,
  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = source_position.bump_seed,
    constraint = source_position.num_active_votes == 0 @ VsrError::ActiveVotesExist,
    has_one = registrar,
    has_one = mint,
    constraint = source_position.key() != target_position.key() @ VsrError::SamePosition,
    constraint = !source_position.is_frozen() @ VsrError::PositionFrozen,
  )]
  pub source_position: Box<Account<'info, PositionV0>>,
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
    constraint = target_position.num_active_votes == 0 @ VsrError::ActiveVotesExist,
    constraint = !target_position.is_frozen() @ VsrError::PositionFrozen,
  )]
  pub target_position: Box<Account<'info, PositionV0>>,
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
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TransferArgsV0 {
  pub amount: u64,
}

impl<'info> TransferV0<'info> {
  pub fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, token::Transfer<'info>> {
    let program = self.token_program.to_account_info();
    let accounts = token::Transfer {
      from: self.source_vault.to_account_info(),
      to: self.target_vault.to_account_info(),
      authority: self.source_position.to_account_info(),
    };
    CpiContext::new(program, accounts)
  }
}

/// Transfers locked tokens from the source position to the target position.
///
/// The target position must have equal or longer lockup period, and be of a kind
/// that is at least equally strict.
///
/// The primary usecases are:
/// - consolidating multiple small deposit entries into a single big one for cleanup
/// - transfering a small part of a big "constant" lockup position into a "cliff"
///   locked position to start the unlocking process (reset_lockup could only
///   change the whole position to "cliff")
pub fn handler(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
  let TransferArgsV0 { amount } = args;
  let registrar = &ctx.accounts.registrar;
  let source_position = &mut ctx.accounts.source_position;
  let target_position = &mut ctx.accounts.target_position;
  let curr_ts = registrar.clock_unix_timestamp();

  let source_seconds_left = source_position.lockup.seconds_left(curr_ts);
  let source_strictness = source_position.lockup.kind.strictness();
  let source_mint_idx = source_position.voting_mint_config_idx;

  source_position.amount_deposited_native = source_position
    .amount_deposited_native
    .checked_sub(amount)
    .unwrap();

  // Check target compatibility
  let config = &registrar.voting_mints[usize::from(source_mint_idx)];
  let mint_id = config.mint;
  require_eq!(
    ctx.accounts.deposit_mint.key(),
    mint_id,
    VsrError::InvalidMint
  );
  require_eq!(
    target_position.voting_mint_config_idx,
    source_mint_idx,
    VsrError::InvalidMint
  );
  require_gte!(
    target_position.lockup.seconds_left(curr_ts),
    source_seconds_left,
    VsrError::InvalidLockupPeriod
  );
  require_gte!(
    target_position.lockup.kind.strictness(),
    source_strictness,
    VsrError::InvalidLockupKind
  );

  require!(
    curr_ts >= target_position.genesis_end
      || curr_ts <= config.genesis_vote_power_multiplier_expiration_ts,
    VsrError::NoDepositOnGenesisPositions
  );

  // Add target amounts
  target_position.amount_deposited_native = target_position
    .amount_deposited_native
    .checked_add(amount)
    .unwrap();

  token::transfer(
    ctx
      .accounts
      .transfer_ctx()
      .with_signer(&[position_seeds!(ctx.accounts.source_position)]),
    amount,
  )?;

  Ok(())
}
