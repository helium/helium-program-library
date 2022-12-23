use crate::error::*;
use crate::position_seeds;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
  create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
  CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token;
use anchor_spl::token::{Mint, MintTo, Token, TokenAccount};
use mpl_token_metadata::state::DataV2;
use std::convert::TryFrom;
use std::mem::size_of;

#[derive(Accounts)]
pub struct InitializePositionV0<'info> {
  pub registrar: AccountLoader<'info, Registrar>,

  // checking the PDA address it just an extra precaution,
  // the other constraints must be exhaustive
  #[account(
    init,
    payer = payer,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump,
    space = 8 + size_of::<PositionV0>() + 60,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    mut,
    mint::decimals = 0,
    mint::authority = position,
    mint::freeze_authority = position,
  )]
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
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = position_authority,
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,

  /// The authority controling the voter. Must be the same as the
  /// `governing_token_owner` in the token owner record used with
  /// spl-governance.
  pub position_authority: Signer<'info>,
  #[account(
    init_if_needed,
    associated_token::authority = position,
    associated_token::mint = deposit_mint,
    payer = payer
  )]
  pub vault: Box<Account<'info, TokenAccount>>,

  #[account(mut)]
  pub payer: Signer<'info>,

  pub deposit_mint: Box<Account<'info, Mint>>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_metadata_program: Program<'info, Metadata>,
  pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializePositionArgsV0 {
  pub kind: LockupKind,
  pub start_ts: Option<u64>,
  pub periods: u32,
}

impl Default for LockupKind {
  fn default() -> Self {
    LockupKind::None
  }
}

/// Initializes a new deposit entry.
///
/// Initializes a deposit entry with the requested settings.
/// Will error if the deposit entry is already in use.
///
/// - `deposit_entry_index`: deposit entry to use
/// - `kind`: Type of lockup to use.
/// - `start_ts`: Start timestamp in seconds, defaults to current clock.
///    The lockup will end after `start + periods * period_secs()`.
///
/// - `periods`: How long to lock up, depending on `kind`. See LockupKind::period_secs()
pub fn handler(ctx: Context<InitializePositionV0>, args: InitializePositionArgsV0) -> Result<()> {
  // Load accounts.
  let registrar = &ctx.accounts.registrar.load()?;

  // Get the exchange rate entry associated with this deposit.
  let mint_idx = registrar.voting_mint_config_index(ctx.accounts.deposit_mint.key())?;

  let curr_ts = registrar.clock_unix_timestamp();
  let start_ts = if let Some(v) = args.start_ts {
    i64::try_from(v).unwrap()
  } else {
    curr_ts
  };

  let lockup = Lockup::new_from_periods(args.kind, curr_ts, start_ts, args.periods)?;
  ctx.accounts.position.set_inner(PositionV0 {
    registrar: ctx.accounts.registrar.key(),
    mint: ctx.accounts.mint.key(),
    bump_seed: ctx.bumps["position"],
    amount_deposited_native: 0,
    voting_mint_config_idx: u8::try_from(mint_idx).unwrap(),
    lockup,
    num_active_votes: 0,
  });

  // Get the mint config associated with this deposit.
  let mint_config = registrar.voting_mints[mint_idx];

  if args.kind != LockupKind::None {
    require_gte!(
      ctx.accounts.position.lockup.total_seconds(),
      mint_config.minimum_required_lockup_secs,
      VsrError::DepositLockupLessThanVotingMintConfigMinRequired
    );
  }

  let signer_seeds: &[&[&[u8]]] = &[position_seeds!(ctx.accounts.position)];

  token::mint_to(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.position_token_account.to_account_info(),
        authority: ctx.accounts.position.to_account_info(),
      },
      signer_seeds,
    ),
    1,
  )?;

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.mint.to_account_info().clone(),
        mint_authority: ctx.accounts.position.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.position.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: String::from("Voting Escrow Token Position"),
      symbol: String::from("VSR"),
      uri: format!(
        "https://vsr-metadata.test-helium.com/{}",
        ctx.accounts.mint.key()
      ),
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None,
    },
    true,
    true,
    None,
  )?;

  create_master_edition_v3(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      CreateMasterEditionV3 {
        edition: ctx.accounts.master_edition.to_account_info().clone(),
        mint: ctx.accounts.mint.to_account_info().clone(),
        update_authority: ctx.accounts.position.to_account_info().clone(),
        mint_authority: ctx.accounts.position.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    Some(0),
  )?;

  Ok(())
}
