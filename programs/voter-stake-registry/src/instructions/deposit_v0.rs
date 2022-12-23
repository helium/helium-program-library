use crate::error::VsrError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{self, Token, TokenAccount};

#[derive(Accounts)]
pub struct DepositV0<'info> {
  pub registrar: AccountLoader<'info, Registrar>,

  #[account(
    mut,
    has_one = registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,

  #[account(
        mut,
        associated_token::authority = position,
        associated_token::mint = mint.key(),
    )]
  pub vault: Box<Account<'info, TokenAccount>>,

  pub mint: Box<Account<'info, Mint>>,

  #[account(
        mut,
        constraint = deposit_token.owner == deposit_authority.key(),
        has_one = mint
    )]
  pub deposit_token: Box<Account<'info, TokenAccount>>,
  pub deposit_authority: Signer<'info>,

  pub token_program: Program<'info, Token>,
}

impl<'info> DepositV0<'info> {
  pub fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, token::Transfer<'info>> {
    let program = self.token_program.to_account_info();
    let accounts = token::Transfer {
      from: self.deposit_token.to_account_info(),
      to: self.vault.to_account_info(),
      authority: self.deposit_authority.to_account_info(),
    };
    CpiContext::new(program, accounts)
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DepositArgsV0 {
  pub amount: u64,
}

/// Adds tokens to a deposit entry.
///
/// Tokens will be transfered from deposit_token to vault using the deposit_authority.
///
/// The deposit entry must have been initialized with create_deposit_entry.
///
/// `amount`: Number of native tokens to transfer.
pub fn handler(ctx: Context<DepositV0>, args: DepositArgsV0) -> Result<()> {
  let DepositArgsV0 { amount } = args;
  if amount == 0 {
    return Ok(());
  }

  // Deposit tokens into the vault and increase the lockup amount too.
  token::transfer(ctx.accounts.transfer_ctx(), amount)?;

  let registrar = &ctx.accounts.registrar.load()?;
  let position = &mut ctx.accounts.position;

  position.amount_deposited_native = position
    .amount_deposited_native
    .checked_add(amount)
    .unwrap();

  // Get the exchange rate entry associated with this deposit.
  let mint_idx = registrar.voting_mint_config_index(ctx.accounts.deposit_token.mint)?;
  require_eq!(
    mint_idx,
    position.voting_mint_config_idx as usize,
    VsrError::InvalidMint
  );

  let curr_ts = registrar.clock_unix_timestamp();

  let config = registrar.voting_mints[mint_idx];

  require!(
    curr_ts >= position.genesis_end || curr_ts <= config.genesis_vote_power_multiplier_expiration_ts,
    VsrError::NoDepositOnGenesisPositions
  );

  msg!(
    "Deposited amount {} with lockup kind {:?} and {} seconds left",
    amount,
    position.lockup.kind,
    position.lockup.seconds_left(curr_ts),
  );

  Ok(())
}
