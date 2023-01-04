use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::token::Mint;
use angry_purple_tiger::AnimalName;
use mpl_bubblegum::state::metaplex_adapter::TokenStandard;
use mpl_bubblegum::state::metaplex_adapter::{Collection, MetadataArgs, TokenProgramVersion};
use mpl_bubblegum::utils::get_asset_id;
use mpl_bubblegum::{
  cpi::{accounts::MintToCollectionV1, mint_to_collection_v1},
  program::Bubblegum,
  state::TreeConfig,
};
use spl_account_compression::{program::SplAccountCompression, Noop};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GenesisIssueHotspotArgsV0 {
  pub hotspot_key: String,
  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
  pub is_full_hotspot: bool,
}

#[derive(Accounts)]
#[instruction(args: GenesisIssueHotspotArgsV0)]
pub struct GenesisIssueHotspotV0<'info> {
  #[account(
    mut,
    seeds = [b"lazy_signer", b"testhelium9"],
    seeds::program = lazy_transactions::ID,
    bump,
  )]
  pub lazy_signer: Signer<'info>,
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(mut)]
  pub collection_metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  pub collection_master_edition: UncheckedAccount<'info>,
  #[account(
    has_one = collection,
    has_one = merkle_tree
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
  #[account(
    init,
    payer = lazy_signer,
    space = 8 + 60 + std::mem::size_of::<IotHotspotInfoV0>(),
    seeds = [
      "iot_info".as_bytes(),
      hotspot_config.key().as_ref(),
      &hash(args.hotspot_key.as_bytes()).to_bytes()
    ],
    bump
  )]
  pub info: Box<Account<'info, IotHotspotInfoV0>>,
  /// CHECK: Handled by cpi
  #[account(mut)]
  pub tree_authority: Account<'info, TreeConfig>,
  /// CHECK: Used in cpi
  pub recipient: AccountInfo<'info>,
  /// CHECK: Used in cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,
  #[account(
    seeds = ["collection_cpi".as_bytes()],
    seeds::program = bubblegum_program.key(),
    bump,
  )]
  /// CHECK: Used in cpi
  pub bubblegum_signer: UncheckedAccount<'info>,

  /// CHECK: Verified by constraint  
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
}

impl<'info> GenesisIssueHotspotV0<'info> {
  fn mint_to_collection_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintToCollectionV1<'info>> {
    let cpi_accounts = MintToCollectionV1 {
      tree_authority: self.tree_authority.to_account_info(),
      leaf_delegate: self.recipient.to_account_info(),
      leaf_owner: self.recipient.to_account_info(),
      merkle_tree: self.merkle_tree.to_account_info(),
      payer: self.lazy_signer.to_account_info(),
      tree_delegate: self.hotspot_config.to_account_info(),
      log_wrapper: self.log_wrapper.to_account_info(),
      compression_program: self.compression_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
      collection_authority: self.hotspot_config.to_account_info(),
      collection_authority_record_pda: self.bubblegum_program.to_account_info(),
      collection_mint: self.collection.to_account_info(),
      collection_metadata: self.collection_metadata.to_account_info(),
      edition_account: self.collection_master_edition.to_account_info(),
      bubblegum_signer: self.bubblegum_signer.to_account_info(),
      token_metadata_program: self.token_metadata_program.to_account_info(),
    };
    CpiContext::new(self.bubblegum_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<GenesisIssueHotspotV0>, args: GenesisIssueHotspotArgsV0) -> Result<()> {
  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    ctx.accounts.tree_authority.num_minted,
  );
  let animal_name: AnimalName = args
    .hotspot_key
    .parse()
    .map_err(|_| error!(ErrorCode::InvalidEccCompact))?;

  let hotspot_config_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_config",
    ctx.accounts.hotspot_config.sub_dao.as_ref(),
    ctx.accounts.hotspot_config.symbol.as_bytes(),
    &[ctx.accounts.hotspot_config.bump_seed],
  ]];

  let metadata = MetadataArgs {
    name: animal_name.to_string(),
    symbol: String::from("HOTSPOT"),
    uri: format!("https://iot-metadata.oracle.test-helium.com/{}", args.hotspot_key),
    collection: Some(Collection {
      key: ctx.accounts.collection.key(),
      verified: false, // Verified in cpi
    }),
    primary_sale_happened: true,
    is_mutable: true,
    edition_nonce: None,
    token_standard: Some(TokenStandard::NonFungible),
    uses: None,
    token_program_version: TokenProgramVersion::Original,
    creators: vec![],
    seller_fee_basis_points: 0,
  };
  mint_to_collection_v1(
    ctx
      .accounts
      .mint_to_collection_ctx()
      .with_signer(hotspot_config_seeds),
    metadata,
  )?;

  ctx.accounts.info.set_inner(IotHotspotInfoV0 {
    asset: asset_id,
    hotspot_key: args.hotspot_key,
    location: args.location,
    bump_seed: ctx.bumps["info"],
    elevation: args.elevation,
    gain: args.gain,
    is_full_hotspot: args.is_full_hotspot,
  });

  Ok(())
}
