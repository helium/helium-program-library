use anchor_lang::{prelude::*, solana_program};
use mpl_token_metadata::state::{
  Collection as MplCollection, CollectionDetails as MplCollectionDetails,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct Collection {
  pub verified: bool,
  pub key: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum CollectionDetails {
  V1 { size: u64 },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CreateMetadataAccountArgs {
  /// The name of the asset
  pub name: String,
  /// The symbol for the asset
  pub symbol: String,
  /// URI pointing to JSON representing the asset
  pub uri: String,
  pub collection: Option<Collection>,
  pub collection_details: Option<CollectionDetails>,
}

#[derive(Accounts)]
pub struct CreateMetadataAccount<'info> {
  /// CHECK: Checked with cpi
  pub metadata_account: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub mint: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub mint_authority: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub payer: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub update_authority: AccountInfo<'info>,
  /// CHECK: Checked with cpi
  pub system_program: AccountInfo<'info>,
  /// CHECK: Checked with cpi
  pub rent: AccountInfo<'info>,
}

pub fn create_metadata_account_v3<'a, 'b, 'c, 'info>(
  ctx: CpiContext<'a, 'b, 'c, 'info, CreateMetadataAccount<'info>>,
  args: CreateMetadataAccountArgs,
) -> Result<()> {
  let collection: Option<MplCollection> = args.collection.map(|c| MplCollection {
    key: c.key,
    verified: c.verified,
  });

  let collection_details: Option<MplCollectionDetails> = match args.collection_details {
    Some(cd) => match cd {
      CollectionDetails::V1 { size: s } => Some(MplCollectionDetails::V1 { size: s }),
    },
    None => None,
  };

  let ix = mpl_token_metadata::instruction::create_metadata_accounts_v3(
    mpl_token_metadata::ID,
    *ctx.accounts.metadata_account.key,
    *ctx.accounts.mint.key,
    *ctx.accounts.mint_authority.key,
    *ctx.accounts.payer.key,
    *ctx.accounts.update_authority.key,
    args.name,
    args.symbol,
    args.uri,
    None,
    0,
    true,
    true,
    collection,
    None,
    collection_details,
  );

  solana_program::program::invoke_signed(
    &ix,
    &[
      ctx.accounts.metadata_account.clone(),
      ctx.accounts.mint.clone(),
      ctx.accounts.mint_authority.clone(),
      ctx.accounts.payer.clone(),
      ctx.accounts.update_authority.clone(),
      ctx.program.clone(),
      ctx.accounts.system_program.clone(),
      ctx.accounts.rent.clone(),
    ],
    ctx.signer_seeds,
  )
  .map_err(|e| e.into())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CreateMasterEditionArgs {
  pub max_supply: Option<u64>,
}

#[derive(Accounts)]
pub struct CreateMasterEdition<'info> {
  /// CHECK: Checked with cpi  
  pub edition: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub mint: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub update_authority: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub mint_authority: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub metadata: AccountInfo<'info>,
  /// CHECK: Checked with cpi  
  pub payer: AccountInfo<'info>,
  /// CHECK: Checked with cpi
  pub system_program: AccountInfo<'info>,
  /// CHECK: Checked with cpi
  pub token_program: AccountInfo<'info>,
  /// CHECK: Checked with cpi
  pub rent: AccountInfo<'info>,
}

pub fn create_master_edition_v3<'a, 'b, 'c, 'info>(
  ctx: CpiContext<'a, 'b, 'c, 'info, CreateMasterEdition<'info>>,
  args: CreateMasterEditionArgs,
) -> Result<()> {
  let ix = mpl_token_metadata::instruction::create_master_edition_v3(
    mpl_token_metadata::ID,
    *ctx.accounts.edition.key,
    *ctx.accounts.mint.key,
    *ctx.accounts.update_authority.key,
    *ctx.accounts.mint_authority.key,
    *ctx.accounts.metadata.key,
    *ctx.accounts.payer.key,
    args.max_supply,
  );

  solana_program::program::invoke_signed(
    &ix,
    &[
      ctx.accounts.edition.clone(),
      ctx.accounts.mint.clone(),
      ctx.accounts.update_authority.clone(),
      ctx.accounts.mint_authority.clone(),
      ctx.accounts.payer.clone(),
      ctx.accounts.metadata.clone(),
      ctx.program.clone(),
      ctx.accounts.token_program.clone(),
      ctx.accounts.system_program.clone(),
      ctx.accounts.rent.clone(),
    ],
    ctx.signer_seeds,
  )
  .map_err(|e| e.into())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct VerifySizedCollectionItemArgs {
  pub collection_authority_record: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct VerifySizedCollectionItem<'info> {
  /// CHECK: Checked with cpi  
  pub metadata: AccountInfo<'info>,
  /// CHECK: Checked with cpi    
  pub collection_authority: AccountInfo<'info>,
  /// CHECK: Checked with cpi    
  pub payer: AccountInfo<'info>,
  /// CHECK: Checked with cpi    
  pub collection_mint: AccountInfo<'info>,
  /// CHECK: Checked with cpi    
  pub collection_metadata: AccountInfo<'info>,
  /// CHECK: Checked with cpi    
  pub collection_master_edition_account: AccountInfo<'info>,
}

pub fn verify_sized_collection_item<'a, 'b, 'c, 'info>(
  ctx: CpiContext<'a, 'b, 'c, 'info, VerifySizedCollectionItem<'info>>,
  args: VerifySizedCollectionItemArgs,
) -> Result<()> {
  let ix = mpl_token_metadata::instruction::verify_sized_collection_item(
    mpl_token_metadata::ID,
    *ctx.accounts.metadata.key,
    *ctx.accounts.collection_authority.key,
    *ctx.accounts.payer.key,
    *ctx.accounts.collection_mint.key,
    *ctx.accounts.collection_metadata.key,
    *ctx.accounts.collection_master_edition_account.key,
    args.collection_authority_record,
  );

  solana_program::program::invoke_signed(
    &ix,
    &[
      ctx.accounts.metadata.clone(),
      ctx.accounts.collection_authority.clone(),
      ctx.accounts.payer.clone(),
      ctx.accounts.collection_mint.clone(),
      ctx.accounts.collection_metadata.clone(),
      ctx.accounts.collection_master_edition_account.clone(),
      ctx.program.clone(),
    ],
    ctx.signer_seeds,
  )
  .map_err(|e| e.into())
}
