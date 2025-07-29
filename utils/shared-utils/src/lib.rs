pub mod compressed_nfts;
pub mod error;
pub mod precise_number;
pub mod resize_to_fit;
pub mod signed_precise_number;
pub mod uint;

use anchor_lang::{prelude::Pubkey, pubkey};
pub use compressed_nfts::*;
pub use error::*;
pub use precise_number::*;
pub use resize_to_fit::*;
pub use signed_precise_number::*;

pub use crate::uint::*;

#[cfg(feature = "devnet")]
pub const ORACLE_URL: &str = "https://hnt-rewards.oracle.test-helium.com";
#[cfg(feature = "devnet")]
pub const ORACLE_SIGNER: Pubkey = pubkey!("dor5y9KAG6mVGFquXr8ipmm7GVLZefiNiCjvER58kPB");

#[cfg(not(feature = "devnet"))]
pub const ORACLE_URL: &str = "https://hnt-rewards.oracle.helium.io";
#[cfg(not(feature = "devnet"))]
pub const ORACLE_SIGNER: Pubkey = pubkey!("orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q");
