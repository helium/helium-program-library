//! Large uint types

// required for clippy
#![allow(clippy::assign_op_pattern)]
#![allow(clippy::ptr_offset_with_cast)]
#![allow(clippy::manual_range_contains)]
#![allow(clippy::manual_div_ceil)]
// uint's construct_uint! expands macros with trailing semicolons in expression
// position; newer rustc denies this by default (rust-lang/rust#79813).
#![allow(semicolon_in_expressions_from_macros)]

use uint::construct_uint;

construct_uint! {
    pub struct U256(4);
}
construct_uint! {
    pub struct U192(3);
}
