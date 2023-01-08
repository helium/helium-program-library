use anchor_lang::{
  prelude::*,
  solana_program::{self, keccak},
};
use anchor_spl::metadata::CreateMetadataAccountsV3;
use mpl_token_metadata::{
  state::{CollectionDetails, DataV2},
  ID,
};

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub enum TokenProgramVersion {
  Original,
  Token2022,
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct Creator {
  pub address: Pubkey,
  pub verified: bool,
  // In percentages, NOT basis points ;) Watch out!
  pub share: u8,
}

impl Creator {
  pub fn adapt(&self) -> mpl_token_metadata::state::Creator {
    mpl_token_metadata::state::Creator {
      address: self.address,
      verified: self.verified,
      share: self.share,
    }
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub enum TokenStandard {
  NonFungible,        // This is a master edition
  FungibleAsset,      // A token with metadata that can also have attrributes
  Fungible,           // A token with simple metadata
  NonFungibleEdition, // This is a limited edition
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub enum UseMethod {
  Burn,
  Multiple,
  Single,
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct Uses {
  // 17 bytes + Option byte
  pub use_method: UseMethod, //1
  pub remaining: u64,        //8
  pub total: u64,            //8
}

impl Uses {
  pub fn adapt(&self) -> mpl_token_metadata::state::Uses {
    mpl_token_metadata::state::Uses {
      use_method: match self.use_method {
        UseMethod::Burn => mpl_token_metadata::state::UseMethod::Burn,
        UseMethod::Multiple => mpl_token_metadata::state::UseMethod::Multiple,
        UseMethod::Single => mpl_token_metadata::state::UseMethod::Single,
      },
      remaining: self.remaining,
      total: self.total,
    }
  }
}

#[repr(C)]
#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct Collection {
  pub verified: bool,
  pub key: Pubkey,
}

impl Collection {
  pub fn adapt(&self) -> mpl_token_metadata::state::Collection {
    mpl_token_metadata::state::Collection {
      verified: self.verified,
      key: self.key,
    }
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct MetadataArgs {
  /// The name of the asset
  pub name: String,
  /// The symbol for the asset
  pub symbol: String,
  /// URI pointing to JSON representing the asset
  pub uri: String,
  /// Royalty basis points that goes to creators in secondary sales (0-10000)
  pub seller_fee_basis_points: u16,
  // Immutable, once flipped, all sales of this metadata are considered secondary.
  pub primary_sale_happened: bool,
  // Whether or not the data struct is mutable, default is not
  pub is_mutable: bool,
  /// nonce for easy calculation of editions, if present
  pub edition_nonce: Option<u8>,
  /// Since we cannot easily change Metadata, we add the new DataV2 fields here at the end.
  pub token_standard: Option<TokenStandard>,
  /// Collection
  pub collection: Option<Collection>,
  /// Uses
  pub uses: Option<Uses>,
  pub token_program_version: TokenProgramVersion,
  pub creators: Vec<Creator>,
}

pub fn hash_creators(creators: &[Creator]) -> Result<[u8; 32]> {
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

pub fn hash_metadata(metadata: &MetadataArgs) -> Result<[u8; 32]> {
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
