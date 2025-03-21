pub mod burn;
pub mod change_delegated_sub_dao_v0;
pub mod delegate_data_credits_v0;
pub mod genesis_issue_delegated_data_credits_v0;
pub mod initialize_data_credits_v0;
pub mod issue_data_credits_v0;
pub mod mint_data_credits_v0;
pub mod update_data_credits_v0;

use anchor_lang::solana_program::hash::hash;
pub use burn::*;
pub use change_delegated_sub_dao_v0::*;
pub use delegate_data_credits_v0::*;
pub use genesis_issue_delegated_data_credits_v0::*;
pub use initialize_data_credits_v0::*;
pub use issue_data_credits_v0::*;
pub use mint_data_credits_v0::*;
pub use update_data_credits_v0::*;

pub fn hash_name(name: &str) -> [u8; 32] {
  hash(name.as_bytes()).to_bytes()
}
