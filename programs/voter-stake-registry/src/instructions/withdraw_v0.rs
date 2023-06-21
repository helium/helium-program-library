use crate::error::*;
use crate::position_seeds;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{self, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct WithdrawArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgsV0)]
pub struct WithdrawV0<'info> {
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
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub position_authority: Signer<'info>,

  #[account(
    mut,
    associated_token::authority = position,
    associated_token::mint = deposit_mint.key(),
  )]
  pub vault: Box<Account<'info, TokenAccount>>,
  pub deposit_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    constraint = destination.mint == deposit_mint.key()
  )]
  pub destination: Box<Account<'info, TokenAccount>>,

  pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawV0<'info> {
  pub fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, token::Transfer<'info>> {
    let program = self.token_program.to_account_info();
    let accounts = token::Transfer {
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
/// `amount` is in units of the native currency being withdrawn.
pub fn handler(ctx: Context<WithdrawV0>, args: WithdrawArgsV0) -> Result<()> {
  let amount = args.amount;

  // Transfer the tokens to withdraw.
  let seeds = position_seeds!(ctx.accounts.position);
  token::transfer(ctx.accounts.transfer_ctx().with_signer(&[seeds]), amount)?;

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
