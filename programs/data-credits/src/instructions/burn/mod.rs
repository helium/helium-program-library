// Each instruction module exports a `handler` fn; the globs below collide on
// that name, but handlers are only ever called fully qualified.
#![allow(ambiguous_glob_reexports)]

pub mod burn_delegated_data_credits_v0;
pub mod burn_without_tracking_v0;
pub mod common;

pub use burn_delegated_data_credits_v0::*;
pub use burn_without_tracking_v0::*;
pub use common::*;
