//! Large uint types

// required for clippy
#![allow(clippy::assign_op_pattern)]
#![allow(clippy::ptr_offset_with_cast)]
#![allow(clippy::manual_range_contains)]
#![allow(clippy::manual_div_ceil)]
// construct_uint! in uint 0.9.5 emits trailing semicolons in expression
// position, denied under future_incompatible on newer toolchains
#![allow(semicolon_in_expressions_from_macros)]

use uint::construct_uint;

construct_uint! {
    pub struct U256(4);
}
construct_uint! {
    pub struct U192(3);
}
