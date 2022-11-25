use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use angry_purple_tiger::AnimalName;
use data_credits::HeliumSubDaos;
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnFromIssuanceV0},
    burn_from_issuance_v0,
  },
  BurnFromIssuanceArgsV0, DataCreditsV0,
};
use mpl_bubblegum::state::{metaplex_adapter::TokenStandard, TreeConfig};
use mpl_bubblegum::{
  cpi::{accounts::MintToCollectionV1, mint_to_collection_v1},
  program::Bubblegum,
};
use mpl_bubblegum::{
  state::metaplex_adapter::{Collection, MetadataArgs, TokenProgramVersion},
  utils::get_asset_id,
};
use spl_account_compression::{program::SplAccountCompression, Wrapper};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueHotspotArgsV0 {
  pub hotspot_key: String,
  pub is_full_hotspot: bool,
}

#[derive(Accounts)]
#[instruction(args: IssueHotspotArgsV0)]
pub struct IssueHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dc_fee_payer: Signer<'info>,
  pub maker: Signer<'info>,
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
  #[account(
    has_one = collection,
    has_one = dc_mint,
    has_one = merkle_tree
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
  #[account(
    mut,
    seeds = ["hotspot_issuer".as_bytes(), hotspot_config.key().as_ref(), maker.key().as_ref()],
    bump = hotspot_issuer.bump_seed,
    has_one = hotspot_config,
    has_one = maker,
  )]
  pub hotspot_issuer: Box<Account<'info, HotspotIssuerV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<HotspotStorageV0>(),
    seeds = [
      "storage".as_bytes(),
      &hash(args.hotspot_key.as_bytes()).to_bytes()
    ],
    bump
  )]
  pub storage: Box<Account<'info, HotspotStorageV0>>,
  #[account(
      mut,
      seeds = [merkle_tree.key().as_ref()],
      seeds::program = bubblegum_program.key(),
      bump,
  )]
  pub tree_authority: Box<Account<'info, TreeConfig>>,
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

  /// CHECK: Verified by cpi  
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump,
    has_one = dc_mint
  )]
  pub dc: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  /// CHECK: Verified by cpi
  pub dc_mint: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dc_mint,
    associated_token::authority = dc_fee_payer,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,

  /// CHECK: Verified by constraint  
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  /// CHECK: Verified by constraint  
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Wrapper>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> IssueHotspotV0<'info> {
  fn mint_to_collection_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintToCollectionV1<'info>> {
    let cpi_accounts = MintToCollectionV1 {
      tree_authority: self.tree_authority.to_account_info(),
      leaf_delegate: self.recipient.to_account_info(),
      leaf_owner: self.recipient.to_account_info(),
      merkle_tree: self.merkle_tree.to_account_info(),
      payer: self.payer.to_account_info(),
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
  fn burn_dc_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnFromIssuanceV0<'info>> {
    let cpi_accounts = BurnFromIssuanceV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.dc_burner.to_account_info(),
        owner: self.dc_fee_payer.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        rent: self.rent.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
      authority: self.hotspot_config.to_account_info(),
    };
    CpiContext::new(self.data_credits_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<IssueHotspotV0>, args: IssueHotspotArgsV0) -> Result<()> {
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
  burn_from_issuance_v0(
    ctx.accounts.burn_dc_ctx().with_signer(hotspot_config_seeds),
    BurnFromIssuanceArgsV0 {
      amount: ctx.accounts.hotspot_config.dc_fee,
      symbol: ctx.accounts.hotspot_config.symbol.clone(),
      sub_dao: ctx.accounts.hotspot_config.sub_dao,
      authority_bump: ctx.accounts.hotspot_config.bump_seed,
    },
  )?;

  let metadata = MetadataArgs {
    name: animal_name.to_string(),
    symbol: String::from("HOTSPOT"),
    uri: format!(
      "https://mobile-metadata.test-helium.com/{}",
      args.hotspot_key
    ),
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

  ctx.accounts.hotspot_issuer.count += 1;

  ctx.accounts.storage.set_inner(HotspotStorageV0 {
    asset: asset_id,
    hotspot_key: args.hotspot_key,
    location: None,
    elevation: None,
    gain: None,
    is_full_hotspot: args.is_full_hotspot,
    bump_seed: ctx.bumps["storage"],
  });

  Ok(())
}
