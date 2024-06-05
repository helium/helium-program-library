use std::cmp::min;
use std::str::FromStr;

use crate::data_only_config_seeds;
use crate::key_to_asset_seeds;
use crate::state::*;
use crate::ECC_VERIFIER;
use crate::{constants::ENTITY_METADATA_URL, error::ErrorCode};
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction::{self};
use anchor_spl::token::Mint;
use angry_purple_tiger::AnimalName;
use bubblegum_cpi::{
  cpi::{accounts::MintToCollectionV1, mint_to_collection_v1},
  get_asset_id,
  program::Bubblegum,
  Collection, Creator, MetadataArgs, TokenProgramVersion, TokenStandard, TreeConfig,
};
use helium_sub_daos::DaoV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueDataOnlyEntityArgsV0 {
  pub entity_key: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: IssueDataOnlyEntityArgsV0)]
pub struct IssueDataOnlyEntityV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(address = Pubkey::from_str(ECC_VERIFIER).unwrap())]
  pub ecc_verifier: Signer<'info>,
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
    mut,
    seeds = ["data_only_config".as_bytes(), dao.key().as_ref()],
    bump,
    has_one = collection,
    has_one = merkle_tree,
    has_one = dao,
  )]
  pub data_only_config: Box<Account<'info, DataOnlyConfigV0>>,
  /// CHECK: Signs as a verified creator to make searching easier
  #[account(
    seeds = ["entity_creator".as_bytes(), dao.key().as_ref()],
    bump,
  )]
  pub entity_creator: UncheckedAccount<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<KeyToAssetV0>() + 1 + args.entity_key.len(),
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
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

  /// CHECK: checked with seeds
  #[account(mut,
    seeds = [
      "data_only_escrow".as_bytes(),
      data_only_config.key().as_ref(),
    ],
    bump
  )]
  pub data_only_escrow: AccountInfo<'info>,
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

impl<'info> IssueDataOnlyEntityV0<'info> {
  fn mint_to_collection_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintToCollectionV1<'info>> {
    let cpi_accounts = MintToCollectionV1 {
      tree_authority: self.tree_authority.to_account_info(),
      leaf_delegate: self.recipient.to_account_info(),
      leaf_owner: self.recipient.to_account_info(),
      merkle_tree: self.merkle_tree.to_account_info(),
      payer: self.payer.to_account_info(),
      tree_delegate: self.data_only_config.to_account_info(),
      log_wrapper: self.log_wrapper.to_account_info(),
      compression_program: self.compression_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
      collection_authority: self.data_only_config.to_account_info(),
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

pub fn handler(ctx: Context<IssueDataOnlyEntityV0>, args: IssueDataOnlyEntityArgsV0) -> Result<()> {
  let key_str = bs58::encode(args.entity_key.clone()).into_string();
  let animal_name: AnimalName = key_str
    .parse()
    .map_err(|_| error!(ErrorCode::InvalidEccCompact))?;

  let data_only_seeds: &[&[&[u8]]] = &[data_only_config_seeds!(ctx.accounts.data_only_config)];
  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    ctx.accounts.tree_authority.num_minted,
  );
  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: asset_id,
    dao: ctx.accounts.dao.key(),
    entity_key: args.entity_key,
    bump_seed: ctx.bumps["key_to_asset"],
    key_serialization: KeySerialization::B58,
  });

  let name = animal_name.to_string();
  let metadata = MetadataArgs {
    name: name[..min(name.len(), 32)].to_owned(),
    symbol: String::from("HOTSPOT"),
    uri: format!(
      "{}/v2/hotspot/{}",
      ENTITY_METADATA_URL,
      ctx.accounts.key_to_asset.key()
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
    creators: vec![
      Creator {
        address: ctx.accounts.entity_creator.key(),
        verified: true,
        share: 100,
      },
      Creator {
        address: ctx.accounts.key_to_asset.key(),
        verified: true,
        share: 0,
      },
    ],
    seller_fee_basis_points: 0,
  };
  let entity_creator_seeds: &[&[&[u8]]] = &[&[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ]];
  let mut creator = ctx.accounts.entity_creator.to_account_info();
  creator.is_signer = true;
  let mut key_to_asset_creator = ctx.accounts.key_to_asset.to_account_info();
  key_to_asset_creator.is_signer = true;
  let key_to_asset_signer: &[&[u8]] = key_to_asset_seeds!(ctx.accounts.key_to_asset);

  mint_to_collection_v1(
    ctx
      .accounts
      .mint_to_collection_ctx()
      .with_remaining_accounts(vec![creator, key_to_asset_creator])
      .with_signer(&[
        data_only_seeds[0],
        entity_creator_seeds[0],
        key_to_asset_signer,
      ]),
    metadata,
  )?;

  invoke(
    &system_instruction::transfer(
      ctx.accounts.payer.key,
      ctx.accounts.data_only_escrow.key,
      ctx.accounts.data_only_config.new_tree_fee_lamports,
    ),
    &[
      ctx.accounts.payer.to_account_info().clone(),
      ctx.accounts.data_only_escrow.to_account_info().clone(),
      ctx.accounts.system_program.to_account_info().clone(),
    ],
  )?;
  Ok(())
}
