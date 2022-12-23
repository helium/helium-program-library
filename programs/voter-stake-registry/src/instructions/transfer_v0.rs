use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct TransferV0<'info> {
  pub registrar: AccountLoader<'info, Registrar>,

  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = source_position.bump_seed,
    constraint = source_position.num_active_votes == 0,
    has_one = registrar,
    has_one = mint
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
    associated_token::authority = source_position,
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
  let registrar = &ctx.accounts.registrar.load()?;
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
  let config = registrar.voting_mints[usize::from(source_mint_idx)];
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
    curr_ts >= target_position.genesis_end || curr_ts <= config.genesis_vote_power_multiplier_expiration_ts,
    VsrError::NoDepositOnGenesisPositions
  );

  // Add target amounts
  target_position.amount_deposited_native = target_position
    .amount_deposited_native
    .checked_add(amount)
    .unwrap();
  Ok(())
}
