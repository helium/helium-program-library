use anchor_lang::prelude::*;

pub mod close_auto_top_off_v0;
pub mod initialize_auto_top_off_v0;
pub mod schedule_task_v0;
pub mod top_off_v0;
pub mod update_auto_top_off_v0;

pub use close_auto_top_off_v0::*;
pub use initialize_auto_top_off_v0::*;
pub use schedule_task_v0::*;
pub use top_off_v0::*;
pub use update_auto_top_off_v0::*;

pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey =
  pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

#[cfg(feature = "devnet")]
pub const TUKTUK_PYTH_SIGNER: Pubkey = pubkey!("tpyi2GNQyuWRBFy9uwNkEqEoxfc7zMbd6QieBZqhKir");
#[cfg(feature = "devnet")]
pub const TUKTUK_PYTH_URL: &str = "https://tuktuk-pyth.web.test-helium.com/v1/write";

#[cfg(not(feature = "devnet"))]
pub const TUKTUK_PYTH_SIGNER: Pubkey = pubkey!("tpyi2GNQyuWRBFy9uwNkEqEoxfc7zMbd6QieBZqhKir");
#[cfg(not(feature = "devnet"))]
pub const TUKTUK_PYTH_URL: &str = "https://tuktuk-pyth.web.helium.io/v1/write";
