use crate::error::ErrorCode;
use crate::state::*;
use crate::token_metadata::{
  create_master_edition_v3, create_metadata_account_v3, CollectionDetails, CreateMasterEdition,
  CreateMasterEditionArgs, CreateMetadataAccount, CreateMetadataAccountArgs,
};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use helium_sub_daos::SubDaoV0;
use mpl_bubblegum::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
};
use spl_account_compression::{program::SplAccountCompression, Wrapper};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotConfigArgsV0 {
  pub name: String,
  pub symbol: String,
  pub metadata_url: String,
  pub onboarding_server: Pubkey,
  pub min_gain: i32,
  pub max_gain: i32,
  pub full_location_staking_fee: u64,
  pub dataonly_location_staking_fee: u64,
  pub max_depth: u32,
  pub max_buffer_size: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeHotspotConfigArgsV0)]
pub struct InitializeHotspotConfigV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = hotspot_config,
    mint::freeze_authority = hotspot_config,
    seeds = ["collection".as_bytes(), sub_dao.key().as_ref(), args.symbol.as_bytes()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,

  #[account(
    has_one = authority
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,

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
    associated_token::authority = hotspot_config,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init,
    payer = payer,
    space = 60 + std::mem::size_of::<HotspotConfigV0>(),
    seeds = ["hotspot_config".as_bytes(), sub_dao.key().as_ref(), args.symbol.as_bytes()],
    bump,
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
  pub dc_mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    seeds = [merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  /// CHECK: Checked by cpi
  pub tree_authority: AccountInfo<'info>,

  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: Signer<'info>,

  /// CHECK: Checked with constraints
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Wrapper>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> InitializeHotspotConfigV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.collection.to_account_info(),
      to: self.token_account.to_account_info(),
      authority: self.hotspot_config.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(
  ctx: Context<InitializeHotspotConfigV0>,
  args: InitializeHotspotConfigArgsV0,
) -> Result<()> {
  require!(args.name.len() <= 32, ErrorCode::InvalidStringLength);
  require!(args.symbol.len() <= 10, ErrorCode::InvalidStringLength);
  require!(
    args.metadata_url.len() <= 200,
    ErrorCode::InvalidStringLength
  );

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_config",
    ctx.accounts.sub_dao.to_account_info().key.as_ref(),
    args.symbol.as_bytes(),
    &[ctx.bumps["hotspot_config"]],
  ]];

  token::mint_to(ctx.accounts.mint_ctx().with_signer(signer_seeds), 1)?;

  create_metadata_account_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMetadataAccount {
        metadata_account: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        mint_authority: ctx.accounts.hotspot_config.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.hotspot_config.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    CreateMetadataAccountArgs {
      name: args.name,
      symbol: args.symbol.clone(),
      uri: args.metadata_url,
      collection: None,
      collection_details: Some(CollectionDetails::V1 { size: 0 }),
    },
  )?;

  create_master_edition_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMasterEdition {
        edition: ctx.accounts.master_edition.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        update_authority: ctx.accounts.hotspot_config.to_account_info().clone(),
        mint_authority: ctx.accounts.hotspot_config.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    CreateMasterEditionArgs {
      max_supply: Some(0),
    },
  )?;

  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.hotspot_config.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      signer_seeds,
    ),
    args.max_depth,
    args.max_buffer_size,
    None,
  )?;

  ctx.accounts.hotspot_config.set_inner(HotspotConfigV0 {
    sub_dao: ctx.accounts.sub_dao.key(),
    symbol: args.symbol.clone(),
    collection: ctx.accounts.collection.key(),
    dc_mint: ctx.accounts.dc_mint.key(),
    onboarding_server: args.onboarding_server,
    authority: ctx.accounts.authority.key(),
    bump_seed: ctx.bumps["hotspot_config"],
    collection_bump_seed: ctx.bumps["collection"],
    merkle_tree: ctx.accounts.merkle_tree.key(),
    min_gain: args.min_gain,
    max_gain: args.max_gain,
    full_location_staking_fee: args.full_location_staking_fee,
    dataonly_location_staking_fee: args.dataonly_location_staking_fee,
  });

  Ok(())
}
