use crate::position_seeds;
use crate::registrar_seeds;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
  verify_sized_collection_item, CreateMetadataAccountsV3, Metadata, VerifySizedCollectionItem,
};
use anchor_spl::token;
use anchor_spl::token::FreezeAccount;
use anchor_spl::token::{Mint, MintTo, Token, TokenAccount};
use mpl_token_metadata::state::Collection;
use mpl_token_metadata::state::DataV2;
use shared_utils::create_metadata_accounts_v3;
use std::convert::TryFrom;
use std::mem::size_of;

#[cfg(feature = "devnet")]
const URL: &str = "https://positions.nft.test-helium.com";

#[cfg(not(feature = "devnet"))]
const URL: &str = "https://positions.nft.helium.io";


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializePositionArgsV0 {
  pub kind: LockupKind,
  pub periods: u32,
}

#[derive(Accounts)]
pub struct InitializePositionV0<'info> {
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
  /// CHECK: Handled By cpi account
  #[account(
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_master_edition: UncheckedAccount<'info>,

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
    constraint = mint.supply == 0,
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
    associated_token::authority = recipient,
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,

  /// CHECK: needed for token account init
  pub recipient: UncheckedAccount<'info>,
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

impl<'info> InitializePositionV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.mint.to_account_info(),
      to: self.position_token_account.to_account_info(),
      authority: self.position.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn freeze_ctx(&self) -> CpiContext<'_, '_, '_, 'info, FreezeAccount<'info>> {
    let cpi_accounts = FreezeAccount {
      account: self.position_token_account.to_account_info(),
      mint: self.mint.to_account_info(),
      authority: self.position.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

/// Initializes a new deposit entry.
///
/// Initializes a deposit entry with the requested settings.
/// Will error if the deposit entry is already in use.
///
/// - `deposit_entry_index`: deposit entry to use
/// - `kind`: Type of lockup to use.
/// - `periods`: How long to lock up, depending on `kind`. See LockupKind::period_secs()
pub fn handler(ctx: Context<InitializePositionV0>, args: InitializePositionArgsV0) -> Result<()> {
  // Load accounts.
  let registrar = &ctx.accounts.registrar;

  // Get the exchange rate entry associated with this deposit.
  let mint_idx = registrar.voting_mint_config_index(ctx.accounts.deposit_mint.key())?;
  // Get the mint config associated with this deposit.
  let mint_config = &registrar.voting_mints[mint_idx];

  let curr_ts = registrar.clock_unix_timestamp();
  let start_ts = curr_ts;

  let lockup = Lockup::new_from_periods(args.kind, curr_ts, start_ts, args.periods)?;
  let genesis_end = if curr_ts <= mint_config.genesis_vote_power_multiplier_expiration_ts {
    i64::try_from(lockup.total_seconds()).unwrap() + curr_ts
  } else {
    0
  };

  ctx.accounts.position.set_inner(PositionV0 {
    registrar: ctx.accounts.registrar.key(),
    mint: ctx.accounts.mint.key(),
    bump_seed: ctx.bumps["position"],
    amount_deposited_native: 0,
    voting_mint_config_idx: u8::try_from(mint_idx).unwrap(),
    lockup,
    genesis_end,
    num_active_votes: 0,
  });

  let signer_seeds: &[&[&[u8]]] = &[position_seeds!(ctx.accounts.position)];

  token::mint_to(ctx.accounts.mint_ctx().with_signer(signer_seeds), 1)?;

  token::freeze_account(ctx.accounts.freeze_ctx().with_signer(signer_seeds))?;

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
        "{}/{}",
        URL,
        ctx.accounts.mint.key()
      ),
      seller_fee_basis_points: 0,
      creators: None,
      collection: Some(Collection {
        key: ctx.accounts.registrar.collection.key(),
        verified: false, // Verified in cpi
      }),
      uses: None,
    },
    true,
    true,
    None,
  )?;

  let verify_signer_seeds: &[&[&[u8]]] = &[registrar_seeds!(ctx.accounts.registrar)];

  verify_sized_collection_item(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      VerifySizedCollectionItem {
        payer: ctx.accounts.payer.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        collection_authority: ctx.accounts.registrar.to_account_info().clone(),
        collection_mint: ctx.accounts.collection.to_account_info().clone(),
        collection_metadata: ctx.accounts.collection_metadata.to_account_info().clone(),
        collection_master_edition: ctx
          .accounts
          .collection_master_edition
          .to_account_info()
          .clone(),
      },
      verify_signer_seeds,
    ),
    None,
  )?;

  Ok(())
}
