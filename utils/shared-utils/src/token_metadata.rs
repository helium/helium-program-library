use anchor_lang::prelude::*;
use mpl_token_metadata::{
  instructions::{
    CreateMasterEditionV3Cpi, CreateMasterEditionV3CpiAccounts,
    CreateMasterEditionV3InstructionArgs, CreateMetadataAccountV3Cpi,
    CreateMetadataAccountV3CpiAccounts, CreateMetadataAccountV3InstructionArgs,
    InstructionAccountInfo, UpdateMetadataAccountV2Cpi, UpdateMetadataAccountV2CpiAccounts,
    UpdateMetadataAccountV2InstructionArgs, VerifyCollectionCpi, VerifyCollectionCpiAccounts,
    VerifySizedCollectionItemCpi, VerifySizedCollectionItemCpiAccounts,
  },
  types::{CollectionDetails, DataV2},
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
  pub token_metadata_program: Program<'info, Metadata>,
}

pub fn create_metadata_accounts_v3<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, CreateMetadataAccountsV3<'info>>,
  data: DataV2,
  is_mutable: bool,
  details: Option<CollectionDetails>,
) -> Result<()> {
  let cpi = CreateMetadataAccountV3Cpi::new(
    &ctx.accounts.token_metadata_program,
    CreateMetadataAccountV3CpiAccounts {
      metadata: &ctx.accounts.metadata,
      mint: &ctx.accounts.mint,
      mint_authority: &ctx.accounts.mint_authority,
      payer: &ctx.accounts.payer,
      update_authority: &ctx.accounts.update_authority,
      system_program: &ctx.accounts.system_program,
      rent: None,
    },
    CreateMetadataAccountV3InstructionArgs {
      data,
      is_mutable,
      collection_details: details,
    },
  );
  if ctx.accounts.update_authority.is_signer {
    cpi
      .invoke_signed_with_remaining_accounts(
        ctx.signer_seeds,
        &[InstructionAccountInfo::ReadonlySigner(
          &ctx.accounts.update_authority,
        )],
      )
      .map_err(Into::into)
  } else {
    cpi.invoke_signed(ctx.signer_seeds).map_err(Into::into)
  }
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
  pub token_metadata_program: Program<'info, Metadata>,
}

pub fn create_master_edition_v3<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, CreateMasterEditionV3<'info>>,
  max_supply: Option<u64>,
) -> Result<()> {
  CreateMasterEditionV3Cpi::new(
    &ctx.accounts.token_metadata_program,
    CreateMasterEditionV3CpiAccounts {
      edition: &ctx.accounts.edition,
      mint: &ctx.accounts.mint,
      update_authority: &ctx.accounts.update_authority,
      mint_authority: &ctx.accounts.mint_authority,
      payer: &ctx.accounts.payer,
      metadata: &ctx.accounts.metadata,
      token_program: &ctx.accounts.token_program,
      system_program: &ctx.accounts.system_program,
      rent: None,
    },
    CreateMasterEditionV3InstructionArgs { max_supply },
  )
  .invoke_signed(ctx.signer_seeds)
  .map_err(Into::into)
}

#[derive(Accounts)]
pub struct UpdateMetadataAccountsV2<'info> {
  pub metadata: AccountInfo<'info>,
  pub update_authority: AccountInfo<'info>,
  pub token_metadata_program: Program<'info, Metadata>,
}

pub fn update_metadata_accounts_v2<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, UpdateMetadataAccountsV2<'info>>,
  data: Option<DataV2>,
  new_update_authority: Pubkey,
  is_mutable: bool,
  primary_sale_happened: bool,
) -> Result<()> {
  UpdateMetadataAccountV2Cpi::new(
    &ctx.accounts.token_metadata_program,
    UpdateMetadataAccountV2CpiAccounts {
      metadata: &ctx.accounts.metadata,
      update_authority: &ctx.accounts.update_authority,
    },
    UpdateMetadataAccountV2InstructionArgs {
      data,
      new_update_authority: Some(new_update_authority),
      is_mutable: Some(is_mutable),
      primary_sale_happened: Some(primary_sale_happened),
    },
  )
  .invoke_signed(ctx.signer_seeds)
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
  pub token_metadata_program: Program<'info, Metadata>,
}

pub fn verify_collection_item<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, VerifyCollectionItem<'info>>,
) -> Result<()> {
  VerifyCollectionCpi::new(
    &ctx.accounts.token_metadata_program,
    VerifyCollectionCpiAccounts {
      payer: &ctx.accounts.payer,
      metadata: &ctx.accounts.metadata,
      collection_authority: &ctx.accounts.collection_authority,
      collection_mint: &ctx.accounts.collection_mint,
      collection: &ctx.accounts.collection_metadata,
      collection_master_edition_account: &ctx
        .accounts
        .collection_master_edition
        .to_account_info()
        .clone(),
      collection_authority_record: None,
    },
  )
  .invoke_signed(ctx.signer_seeds)
  .map_err(Into::into)
}

pub fn verify_sized_collection_item<'info>(
  ctx: CpiContext<'_, '_, '_, 'info, VerifyCollectionItem<'info>>,
) -> Result<()> {
  VerifySizedCollectionItemCpi::new(
    &ctx.accounts.token_metadata_program,
    VerifySizedCollectionItemCpiAccounts {
      payer: &ctx.accounts.payer,
      metadata: &ctx.accounts.metadata,
      collection_authority: &ctx.accounts.collection_authority,
      collection_mint: &ctx.accounts.collection_mint,
      collection: &ctx.accounts.collection_metadata,
      collection_master_edition_account: &ctx
        .accounts
        .collection_master_edition
        .to_account_info()
        .clone(),
      collection_authority_record: None,
    },
  )
  .invoke_signed(ctx.signer_seeds)
  .map_err(Into::into)
}
