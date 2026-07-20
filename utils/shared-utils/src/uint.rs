//! Large uint types

// required for clippy
#![allow(clippy::assign_op_pattern)]
#![allow(clippy::ptr_offset_with_cast)]
#![allow(clippy::manual_range_contains)]
#![allow(clippy::manual_div_ceil)]
// The `uint` crate's construct_uint! expansion (uint_full_mul_reg!) trips
// semicolon_in_expressions_from_macros on the host x86_64 `anchor idl build`.
// The lint fires inside third-party macro code we can't edit, and uint 0.9.5
// (latest 0.9) still emits it; the generated code is correct. Revisit if uint
// publishes a fix.
#![allow(semicolon_in_expressions_from_macros)]

use uint::construct_uint;

construct_uint! {
    pub struct U256(4);
}
construct_uint! {
    pub struct U192(3);
}
