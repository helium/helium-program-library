use mpl_token_metadata::utils::try_from_slice_checked;
use std::io::Write;
use std::ops::Deref;

pub use mpl_token_metadata::ID;

#[derive(Clone)]
pub struct Metadata(mpl_token_metadata::state::Metadata);

impl Deref for Metadata {
  type Target = mpl_token_metadata::state::Metadata;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

impl anchor_lang::AccountDeserialize for Metadata {
  fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
    Metadata::try_deserialize_unchecked(buf)
  }

  fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
    try_from_slice_checked(
      buf,
      mpl_token_metadata::state::Key::MetadataV1,
      mpl_token_metadata::state::MAX_METADATA_LEN,
    )
    .map(Metadata)
    .map_err(|e| e.into())
  }
}

impl anchor_lang::AccountSerialize for Metadata {
  fn try_serialize<W: Write>(&self, _writer: &mut W) -> Result<()> {
    // no-op
    Ok(())
  }
}

impl anchor_lang::Owner for Metadata {
  fn owner() -> Pubkey {
    ID
  }
}

use anchor_lang::prelude::*;

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
