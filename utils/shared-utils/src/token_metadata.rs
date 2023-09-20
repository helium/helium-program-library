use anchor_lang::{prelude::*, solana_program};
use mpl_token_metadata::{
  state::{CollectionDetails, DataV2},
  ID,
};

#[derive(Accounts)]
pub struct CreateMetadataAccountsV3<'info> {
  pub metadata: AccountInfo<'info>,
  pub mint: AccountInfo<'info>,
  pub mint_authority: AccountInfo<'info>,
  pub payer: AccountInfo<'info>,
  pub update_authority: AccountInfo<'info>,
  pub system_program: AccountInfo<'info>,
  pub rent: AccountInfo<'info>,
}

pub fn create_metadata_accounts_v3<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, CreateMetadataAccountsV3<'info>>,
  data: DataV2,
  is_mutable: bool,
  update_authority_is_signer: bool,
  details: Option<CollectionDetails>,
) -> Result<()> {
  let DataV2 {
    name,
    symbol,
    uri,
    creators,
    seller_fee_basis_points,
    collection,
    uses,
  } = data;
  let ix = mpl_token_metadata::instruction::create_metadata_accounts_v3(
    ID,
    *ctx.accounts.metadata.key,
    *ctx.accounts.mint.key,
    *ctx.accounts.mint_authority.key,
    *ctx.accounts.payer.key,
    *ctx.accounts.update_authority.key,
    name,
    symbol,
    uri,
    creators,
    seller_fee_basis_points,
    update_authority_is_signer,
    is_mutable,
    collection,
    uses,
    details,
  );
  solana_program::program::invoke_signed(
    &ix,
    &ToAccountInfos::to_account_infos(&ctx),
    ctx.signer_seeds,
  )
  .map_err(Into::into)
}

#[derive(Clone)]
pub struct Metadata;

impl anchor_lang::Id for Metadata {
  fn id() -> Pubkey {
    ID
  }
}

#[derive(Accounts)]
pub struct CreateMasterEditionV3<'info> {
  pub edition: AccountInfo<'info>,
  pub mint: AccountInfo<'info>,
  pub update_authority: AccountInfo<'info>,
  pub mint_authority: AccountInfo<'info>,
  pub payer: AccountInfo<'info>,
  pub metadata: AccountInfo<'info>,
  pub token_program: AccountInfo<'info>,
  pub system_program: AccountInfo<'info>,
  pub rent: AccountInfo<'info>,
}

pub fn create_master_edition_v3<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, CreateMasterEditionV3<'info>>,
  max_supply: Option<u64>,
) -> Result<()> {
  let ix = mpl_token_metadata::instruction::create_master_edition_v3(
    ID,
    *ctx.accounts.edition.key,
    *ctx.accounts.mint.key,
    *ctx.accounts.update_authority.key,
    *ctx.accounts.mint_authority.key,
    *ctx.accounts.metadata.key,
    *ctx.accounts.payer.key,
    max_supply,
  );
  solana_program::program::invoke_signed(
    &ix,
    &ToAccountInfos::to_account_infos(&ctx),
    ctx.signer_seeds,
  )
  .map_err(Into::into)
}

#[derive(Accounts)]
pub struct UpdateMetadataAccountsV2<'info> {
  pub metadata: AccountInfo<'info>,
  pub update_authority: AccountInfo<'info>,
}

pub fn update_metadata_accounts_v2<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, UpdateMetadataAccountsV2<'info>>,
  data: Option<DataV2>,
  new_update_authority: Pubkey,
  is_mutable: bool,
  primary_sale_happened: bool,
) -> Result<()> {
  let ix = mpl_token_metadata::instruction::update_metadata_accounts_v2(
    ID,
    *ctx.accounts.metadata.key,
    *ctx.accounts.update_authority.key,
    Some(new_update_authority),
    data,
    Some(primary_sale_happened),
    Some(is_mutable),
  );
  solana_program::program::invoke_signed(
    &ix,
    &ToAccountInfos::to_account_infos(&ctx),
    ctx.signer_seeds,
  )
  .map_err(Into::into)
}

#[derive(Accounts)]
pub struct VerifyCollectionItem<'info> {
  pub payer: AccountInfo<'info>,
  pub metadata: AccountInfo<'info>,
  pub collection_authority: AccountInfo<'info>,
  pub collection_mint: AccountInfo<'info>,
  pub collection_metadata: AccountInfo<'info>,
  pub collection_master_edition: AccountInfo<'info>,
}

pub fn verify_collection_item<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, VerifyCollectionItem<'info>>,
  collection_authority_record: Option<Pubkey>,
) -> Result<()> {
  let ix = mpl_token_metadata::instruction::verify_collection(
    ID,
    *ctx.accounts.metadata.key,
    *ctx.accounts.collection_authority.key,
    *ctx.accounts.payer.key,
    *ctx.accounts.collection_mint.key,
    *ctx.accounts.collection_metadata.key,
    *ctx.accounts.collection_master_edition.key,
    collection_authority_record,
  );
  solana_program::program::invoke_signed(
    &ix,
    &ToAccountInfos::to_account_infos(&ctx),
    ctx.signer_seeds,
  )
  .map_err(Into::into)
}
