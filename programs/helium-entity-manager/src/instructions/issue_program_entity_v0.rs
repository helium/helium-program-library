use crate::state::*;
use crate::{constants::ENTITY_METADATA_URL, error::ErrorCode};
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::token::Mint;
use bubblegum_cpi::{
  cpi::{accounts::MintToCollectionV1, mint_to_collection_v1},
  get_asset_id,
  program::Bubblegum,
  Collection, Creator, MetadataArgs, TokenProgramVersion, TokenStandard, TreeConfig,
};
use helium_sub_daos::DaoV0;
use mpl_token_metadata::state::{MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH, MAX_URI_LENGTH};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueProgramEntityArgsV0 {
  pub entity_key: Vec<u8>,
  pub key_serialization: KeySerialization,
  pub name: String,
  pub symbol: String,
  pub approver_seeds: Vec<Vec<u8>>,
  pub metadata_url: Option<String>,
}

pub fn program_address(seeds: Vec<Vec<u8>>, pid: &Pubkey) -> Result<Pubkey> {
  let binding = seeds.iter().map(|s| s.as_ref()).collect::<Vec<&[u8]>>();
  let seeds_bytes: &[&[u8]] = binding.as_slice();
  Pubkey::create_program_address(seeds_bytes, pid).map_err(|_| error!(ErrorCode::InvalidSeeds))
}

#[derive(Accounts)]
#[instruction(args: IssueProgramEntityArgsV0)]
pub struct IssueProgramEntityV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    address = program_address(args.approver_seeds, &program_approval.program_id)?
  )]
  pub program_approver: Signer<'info>,
  #[account(
    has_one = dao,
  )]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
  pub collection_authority: Signer<'info>,
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
  /// CHECK: Checked via seeds
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

impl<'info> IssueProgramEntityV0<'info> {
  fn mint_to_collection_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintToCollectionV1<'info>> {
    let cpi_accounts = MintToCollectionV1 {
      tree_authority: self.tree_authority.to_account_info(),
      leaf_delegate: self.recipient.to_account_info(),
      leaf_owner: self.recipient.to_account_info(),
      merkle_tree: self.merkle_tree.to_account_info(),
      payer: self.payer.to_account_info(),
      tree_delegate: self.program_approver.to_account_info(),
      log_wrapper: self.log_wrapper.to_account_info(),
      compression_program: self.compression_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
      collection_authority: self.collection_authority.to_account_info(),
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

pub fn handler(ctx: Context<IssueProgramEntityV0>, args: IssueProgramEntityArgsV0) -> Result<()> {
  require!(
    args.name.len() <= MAX_NAME_LENGTH,
    ErrorCode::InvalidStringLength
  );
  require!(
    args.symbol.len() <= MAX_SYMBOL_LENGTH,
    ErrorCode::InvalidStringLength
  );

  let key_str = match args.key_serialization {
    KeySerialization::B58 => bs58::encode(&args.entity_key).into_string(),
    KeySerialization::UTF8 => std::str::from_utf8(&args.entity_key).unwrap().to_string(),
  };

  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    ctx.accounts.tree_authority.num_minted,
  );

  let metadata_uri = format!("{}/{}", ENTITY_METADATA_URL, key_str);
  require!(
    metadata_uri.len() <= MAX_URI_LENGTH,
    ErrorCode::InvalidStringLength
  );
  let mut metadata = MetadataArgs {
    name: args.name,
    symbol: args.symbol,
    uri: metadata_uri,
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

  if let Some(metadata_url) = args.metadata_url {
    let formated_metadata_url = format!("{}/{}", metadata_url, key_str);

    require!(
      formated_metadata_url.len() <= 200,
      ErrorCode::InvalidStringLength
    );

    metadata.uri = formated_metadata_url;
  }

  let entity_creator_seeds: &[&[&[u8]]] = &[&[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ]];

  let mut creator = ctx.accounts.entity_creator.to_account_info();
  creator.is_signer = true;
  mint_to_collection_v1(
    ctx
      .accounts
      .mint_to_collection_ctx()
      .with_remaining_accounts(vec![creator])
      .with_signer(&[entity_creator_seeds[0]]),
    metadata,
  )?;

  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: asset_id,
    dao: ctx.accounts.dao.key(),
    entity_key: args.entity_key,
    bump_seed: ctx.bumps["key_to_asset"],
    key_serialization: args.key_serialization,
  });

  Ok(())
}
