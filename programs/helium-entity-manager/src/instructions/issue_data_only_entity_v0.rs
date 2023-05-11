use std::cmp::min;
use std::str::FromStr;

use crate::state::*;
use crate::ECC_VERIFIER;
use crate::{constants::HOTSPOT_METADATA_URL, error::ErrorCode};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction::{self};
use anchor_spl::token::Mint;
use angry_purple_tiger::AnimalName;
use helium_sub_daos::DaoV0;
use mpl_bubblegum::state::metaplex_adapter::{
  Collection, Creator, MetadataArgs, TokenProgramVersion,
};
use mpl_bubblegum::state::{metaplex_adapter::TokenStandard, TreeConfig};
use mpl_bubblegum::utils::get_asset_id;
use mpl_bubblegum::{
  cpi::{
    accounts::{CreateTree, MintToCollectionV1},
    create_tree, mint_to_collection_v1,
  },
  program::Bubblegum,
};
use spl_account_compression::{program::SplAccountCompression, Noop};

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
  )]
  pub data_only_config: Box<Account<'info, DataOnlyConfigV0>>,
  /// CHECK: Signs as a verified creator to make searching easier
  #[account(
    seeds = [b"entity_creator", dao.key().as_ref()],
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

  /// CHECK: Only used if previous tree is full, and is then checked in cpi
  #[account(mut)]
  pub new_merkle_tree: UncheckedAccount<'info>,
  /// CHECK: Only used if previous tree is full, and is then checked in cpi
  #[account(
    mut,
    seeds = [merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  pub new_tree_authority: AccountInfo<'info>,
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

  let dao = ctx.accounts.dao.key();
  let data_only_seeds: &[&[&[u8]]] = &[&[
    b"data_only_config",
    dao.as_ref(),
    &[ctx.accounts.data_only_config.bump_seed],
  ]];
  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    ctx.accounts.tree_authority.num_minted,
  );

  let name = animal_name.to_string();
  let metadata = MetadataArgs {
    name: name[..min(name.len(), 32)].to_owned(),
    symbol: String::from("HOTSPOT"),
    uri: format!("{}/{}", HOTSPOT_METADATA_URL, key_str),
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
    creators: vec![Creator {
      address: ctx.accounts.entity_creator.key(),
      verified: true,
      share: 100,
    }],
    seller_fee_basis_points: 0,
  };
  let entity_creator_seeds: &[&[&[u8]]] = &[&[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ]];
  let mut creator = ctx.accounts.entity_creator.to_account_info();
  creator.is_signer = true;

  // if previous merkle tree is full, then swap it out with a new one paid for by the escrow
  if !ctx.accounts.tree_authority.contains_mint_capacity(1) {
    create_tree(
      CpiContext::new_with_signer(
        ctx.accounts.bubblegum_program.to_account_info().clone(),
        CreateTree {
          tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
          merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
          payer: ctx.accounts.data_only_escrow.to_account_info().clone(),
          tree_creator: ctx.accounts.data_only_config.to_account_info().clone(),
          log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
          compression_program: ctx.accounts.compression_program.to_account_info().clone(),
          system_program: ctx.accounts.system_program.to_account_info().clone(),
        },
        data_only_seeds,
      ),
      ctx.accounts.data_only_config.new_tree_depth,
      ctx.accounts.data_only_config.new_tree_buffer_size,
      None,
    )?;
    ctx.accounts.data_only_config.merkle_tree = ctx.accounts.merkle_tree.key();
  }
  mint_to_collection_v1(
    ctx
      .accounts
      .mint_to_collection_ctx()
      .with_remaining_accounts(vec![creator])
      .with_signer(&[data_only_seeds[0], entity_creator_seeds[0]]),
    metadata,
  )?;

  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: asset_id,
    dao: ctx.accounts.dao.key(),
    entity_key: args.entity_key,
    bump_seed: ctx.bumps["key_to_asset"],
  });

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
