use anchor_lang::prelude::*;

declare_id!("treaRzaa4b98D1NQMQdQXzBupbgWhyJ2e1pXhJzkTwU");

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[program]
pub mod treasury_management {
  use super::*;
}