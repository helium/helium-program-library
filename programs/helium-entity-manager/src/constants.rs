#[cfg(feature = "devnet")]
pub const HOTSPOT_METADATA_URL: &str = "https://entities.nft.test-helium.com";

#[cfg(not(feature = "devnet"))]
pub const HOTSPOT_METADATA_URL: &str = "https://entities.nft.helium.io";
