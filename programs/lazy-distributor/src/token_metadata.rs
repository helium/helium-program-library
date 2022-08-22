use anchor_lang::prelude::*;
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
