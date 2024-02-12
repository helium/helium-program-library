use std::str::FromStr;

use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::{prelude::*, solana_program::keccak};
use anchor_spl::token::Mint;
use bubblegum_cpi::{
  cpi::{
    accounts::{UpdateMetadata, VerifyCreator},
    update_metadata, verify_creator,
  },
  get_asset_id,
  program::Bubblegum,
  Collection, Creator as BCreator, MetadataArgs as BMetadataArgs, TokenProgramVersion,
  TokenStandard, TreeConfig, UpdateArgs,
};

use crate::{
  constants::ENTITY_METADATA_URL, data_only_config_seeds, key_to_asset_seeds, DataOnlyConfigV0,
  KeyToAssetV0, MakerV0,
};

pub const CONCURRENT_MERKLE_TREE_HEADER_SIZE_V1: usize = 2 + 54;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MetadataArgs {
  /// The name of the asset
  pub name: String,
  /// The symbol for the asset
  pub symbol: String,
  /// URI pointing to JSON representing the asset
  pub uri: String,
  pub creators: Vec<Creator>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct Creator {
  pub address: Pubkey,
  pub verified: bool,
  pub share: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempStandardizeEntityArgs {
  pub root: [u8; 32],
  pub index: u32,
  pub current_metadata: MetadataArgs,
}

#[derive(Accounts)]
#[instruction(args: TempStandardizeEntityArgs)]
pub struct TempStandardizeEntity<'info> {
  #[account(
    constraint = get_asset_id(
      &merkle_tree.key(),
      u64::from(args.index)
    ) == key_to_asset.asset
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  /// CHECK: Used in cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,
  /// CHECK: Signs as a verified creator to make searching easier
  #[account(mut)]
  pub maker: Option<Account<'info, MakerV0>>,
  pub data_only_config: Box<Account<'info, DataOnlyConfigV0>>,
  #[account(
      seeds = [merkle_tree.key().as_ref()],
      seeds::program = bubblegum_program.key(),
      bump,
  )]
  pub tree_authority: Box<Account<'info, TreeConfig>>,
  #[account(
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub authority: Signer<'info>,
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_metadata: UncheckedAccount<'info>,
  /// CHECK: This account is checked in the instruction
  pub leaf_owner: UncheckedAccount<'info>,
  pub payer: Signer<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  /// CHECK: Verified by constraint
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, TempStandardizeEntity<'info>>,
  args: TempStandardizeEntityArgs,
) -> Result<()> {
  let uri = format!(
    "{}/v2/{}/{}",
    ENTITY_METADATA_URL,
    args.current_metadata.symbol.to_lowercase(),
    ctx.accounts.key_to_asset.key()
  );
  let current_metadata = BMetadataArgs {
    name: args.current_metadata.name.clone(),
    symbol: args.current_metadata.symbol.clone(),
    uri: args.current_metadata.uri.clone(),
    collection: Some(Collection {
      key: ctx.accounts.collection.key(),
      verified: true,
    }),
    primary_sale_happened: true,
    is_mutable: true,
    edition_nonce: None,
    token_standard: Some(TokenStandard::NonFungible),
    uses: None,
    token_program_version: TokenProgramVersion::Original,
    creators: args
      .current_metadata
      .creators
      .iter()
      .map(|c| BCreator {
        address: c.address,
        verified: c.verified,
        share: c.share,
      })
      .collect(),
    seller_fee_basis_points: 0,
  };
  let maker_seeds: Option<Vec<Vec<u8>>> = ctx.accounts.maker.clone().map(|maker| {
    vec![
      b"maker".to_vec(),
      maker.dao.as_ref().to_vec(),
      maker.name.as_bytes().to_vec(),
      vec![maker.bump_seed],
    ]
  });

  let collection_seeds = maker_seeds.unwrap_or_else(|| {
    data_only_config_seeds!(ctx.accounts.data_only_config)
      .iter()
      .map(|slice| slice.to_vec())
      .collect()
  });
  let collection_seeds_slices: Vec<&[u8]> =
    collection_seeds.iter().map(|vec| vec.as_slice()).collect();
  let signer_seeds: &[&[u8]] = &collection_seeds_slices;
  let new_creators = vec![
    BCreator {
      address: args.current_metadata.creators[0].address,
      verified: true,
      share: 100,
    },
    BCreator {
      address: ctx.accounts.key_to_asset.key(),
      verified: args.current_metadata.creators.len() == 2,
      share: 0,
    },
  ];
  update_metadata(
    CpiContext::new(
      ctx.accounts.bubblegum_program.to_account_info(),
      UpdateMetadata {
        tree_authority: ctx.accounts.tree_authority.to_account_info(),
        authority: ctx.accounts.maker.as_ref().map_or_else(
          || ctx.accounts.data_only_config.to_account_info(),
          |f| f.to_account_info(),
        ),
        collection_mint: ctx.accounts.collection.to_account_info(),
        collection_metadata: ctx.accounts.collection_metadata.to_account_info(),
        collection_authority_record_pda: ctx.accounts.bubblegum_program.to_account_info(),
        leaf_owner: ctx.accounts.leaf_owner.to_account_info(),
        leaf_delegate: ctx.accounts.leaf_owner.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
        compression_program: ctx.accounts.compression_program.to_account_info(),
        token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec())
    .with_signer(&[signer_seeds]),
    args.root,
    u64::from(args.index),
    args.index,
    current_metadata,
    UpdateArgs {
      name: None,
      symbol: None,
      uri: Some(uri.clone()),
      creators: Some(new_creators.clone()),
      seller_fee_basis_points: None,
      primary_sale_happened: None,
      is_mutable: None,
    },
  )?;

  let new_metadata = BMetadataArgs {
    name: args.current_metadata.name.clone(),
    symbol: args.current_metadata.symbol.clone(),
    uri: uri.clone(),
    collection: Some(Collection {
      key: ctx.accounts.collection.key(),
      verified: true,
    }),
    primary_sale_happened: true,
    is_mutable: true,
    edition_nonce: None,
    token_standard: Some(TokenStandard::NonFungible),
    uses: None,
    token_program_version: TokenProgramVersion::Original,
    creators: new_creators,
    seller_fee_basis_points: 0,
  };

  // Verify key to asset
  if args.current_metadata.creators.len() < 2 {
    let key_to_asset_signer: &[&[&[u8]]] = &[key_to_asset_seeds!(ctx.accounts.key_to_asset)];

    // The merkle tree has changed since the last instruction. Get the new root to use for verify_creator otherwise
    // you will get a `LeafContentsModified` error.
    let merkle_tree_bytes = ctx.accounts.merkle_tree.try_borrow_data()?;
    let (header_bytes, rest) = merkle_tree_bytes.split_at(CONCURRENT_MERKLE_TREE_HEADER_SIZE_V1);
    let max_depth_bytes: [u8; 4] = header_bytes[1 + 1 + 4..(1 + 1 + 4 + 4)].try_into().unwrap();
    let max_depth = u32::from_le_bytes(max_depth_bytes);
    let active_index = rest[8];
    let changelog_idx = 8
      + 8
      + 8
      + usize::from(active_index) * (32 + 32 * usize::try_from(max_depth).unwrap() + 4 + 4);
    let mut new_root = [0u8; 32];
    new_root.copy_from_slice(&rest[changelog_idx..(changelog_idx + 32)]);
    drop(merkle_tree_bytes);

    let context = CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info(),
      VerifyCreator {
        tree_authority: ctx.accounts.tree_authority.to_account_info(),
        leaf_owner: ctx.accounts.leaf_owner.to_account_info(),
        leaf_delegate: ctx.accounts.leaf_owner.to_account_info(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        creator: ctx.accounts.key_to_asset.to_account_info(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
        compression_program: ctx.accounts.compression_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      key_to_asset_signer,
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec());

    verify_creator(
      context,
      new_root,
      hash_metadata(&new_metadata)?,
      hash_creators(&new_metadata.creators)?,
      u64::from(args.index),
      args.index,
      new_metadata,
    )?;
  }
  Ok(())
}

pub fn hash_creators(creators: &[BCreator]) -> Result<[u8; 32]> {
  // Convert creator Vec to bytes Vec.
  let creator_data = creators
    .iter()
    .map(|c| [c.address.as_ref(), &[c.verified as u8], &[c.share]].concat())
    .collect::<Vec<_>>();
  // Calculate new creator hash.
  Ok(
    keccak::hashv(
      creator_data
        .iter()
        .map(|c| c.as_slice())
        .collect::<Vec<&[u8]>>()
        .as_ref(),
    )
    .to_bytes(),
  )
}

pub fn hash_metadata(metadata: &BMetadataArgs) -> Result<[u8; 32]> {
  let metadata_args_hash = keccak::hashv(&[metadata.try_to_vec()?.as_slice()]);
  // Calculate new data hash.
  Ok(
    keccak::hashv(&[
      &metadata_args_hash.to_bytes(),
      &metadata.seller_fee_basis_points.to_le_bytes(),
    ])
    .to_bytes(),
  )
}
