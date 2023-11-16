use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::types::CollectionDetails;
use mpl_token_metadata::types::DataV2;
use nft_delegation::DelegationConfigV0;
use shared_utils::create_metadata_accounts_v3;
use shared_utils::token_metadata::{
  create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata,
};
use spl_governance::state::realm;
use std::mem::size_of;

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct InitializeRegistrarArgsV0 {
  pub position_update_authority: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct InitializeRegistrarV0<'info> {
  /// The voting registrar. There can only be a single registrar
  /// per governance realm and governing mint.
  #[account(
    init,
    seeds = [realm.key().as_ref(), b"registrar".as_ref(), realm_governing_token_mint.key().as_ref()],
    bump,
    payer = payer,
    space = 8 + size_of::<Registrar>() + 60
  )]
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = registrar,
    mint::freeze_authority = registrar,
    seeds = ["collection".as_bytes(), registrar.key().as_ref()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = collection,
    associated_token::authority = registrar,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,

  /// An spl-governance realm
  ///
  /// CHECK: realm is validated in the instruction:
  /// realm is validated in the instruction:
  /// - realm is owned by the governance_program_id
  /// - realm_governing_token_mint must be the community or council mint
  /// - realm_authority is realm.authority
  pub realm: UncheckedAccount<'info>,

  /// CHECK: May be any instance of spl-governance
  /// The program id of the spl-governance program the realm belongs to.
  pub governance_program_id: UncheckedAccount<'info>,
  /// Either the realm community mint or the council mint.
  pub realm_governing_token_mint: Account<'info, Mint>,
  pub realm_authority: Signer<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub token_metadata_program: Program<'info, Metadata>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub delegation_config: Option<Account<'info, DelegationConfigV0>>,
}

impl<'info> InitializeRegistrarV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.collection.to_account_info(),
      to: self.token_account.to_account_info(),
      authority: self.registrar.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

/// Creates a new voting registrar.
///
/// `vote_weight_decimals` is the number of decimals used on the vote weight. It must be
/// larger or equal to all token mints used for voting.
///
/// To use the registrar, call ConfigVotingMint to register token mints that may be
/// used for voting.
pub fn handler(ctx: Context<InitializeRegistrarV0>, args: InitializeRegistrarArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    ctx.accounts.realm.to_account_info().key.as_ref(),
    b"registrar",
    ctx
      .accounts
      .realm_governing_token_mint
      .to_account_info()
      .key
      .as_ref(),
    &[ctx.bumps["registrar"]],
  ]];

  token::mint_to(ctx.accounts.mint_ctx().with_signer(signer_seeds), 1)?;

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        mint_authority: ctx.accounts.registrar.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.registrar.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: String::from("Voting Escrow Collection"),
      symbol: String::from("VSR"),
      uri: "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/vsr.json"
        .to_string(),
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None,
    },
    true,
    Some(CollectionDetails::V1 { size: 0 }),
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
        mint: ctx.accounts.collection.to_account_info().clone(),
        update_authority: ctx.accounts.registrar.to_account_info().clone(),
        mint_authority: ctx.accounts.registrar.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    Some(0),
  )?;

  ctx.accounts.registrar.set_inner(Registrar {
    realm: ctx.accounts.realm.key(),
    realm_governing_token_mint: ctx.accounts.realm_governing_token_mint.key(),
    realm_authority: ctx.accounts.realm_authority.key(),
    collection: ctx.accounts.collection.key(),
    time_offset: 0,
    position_update_authority: args.position_update_authority,
    governance_program_id: ctx.accounts.governance_program_id.key(),
    bump_seed: ctx.bumps["registrar"],
    collection_bump_seed: ctx.bumps["collection"],
    reserved1: [0; 4],
    reserved2: [0; 3],
    voting_mints: Vec::new(),
    delegation_config: ctx
      .accounts
      .delegation_config
      .clone()
      .map(|k| k.key())
      .unwrap_or_default(),
  });

  // Verify that "realm_authority" is the expected authority on "realm"
  // and that the mint matches one of the realm mints too.
  let realm = realm::get_realm_data_for_governing_token_mint(
    &ctx.accounts.governance_program_id.key(),
    &ctx.accounts.realm.to_account_info(),
    &ctx.accounts.realm_governing_token_mint.key(),
  )?;

  require_keys_eq!(
    realm.authority.unwrap(),
    ctx.accounts.realm_authority.key(),
    VsrError::InvalidRealmAuthority
  );

  Ok(())
}
