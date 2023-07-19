#[cfg(feature = "devnet")]
pub const ENTITY_METADATA_URL: &str = "https://entities.nft.test-helium.com/v1";

#[cfg(not(feature = "devnet"))]
pub const ENTITY_METADATA_URL: &str = "https://entities.nft.helium.io/v1";
