//! Defines PreciseNumber, a U192 wrapper with float-like operations
// Stolen from SPL math, but changing inner unit

use std::cmp::Ordering;
use std::convert::*;

use anchor_lang::prelude::msg;

use crate::signed_precise_number::SignedPreciseNumber;
use crate::uint::U192;

// Allows for easy swapping between different internal representations
pub type InnerUint = U192;

pub static ONE_PREC: PreciseNumber = PreciseNumber { value: one() };
pub static ZERO_PREC: PreciseNumber = PreciseNumber { value: zero() };
pub static TWO_PREC: PreciseNumber = PreciseNumber { value: two() };
pub static FOUR_PREC: PreciseNumber = PreciseNumber { value: four() };

/// The representation of the number one as a precise number as 10^18
pub const ONE: u128 = 1_000_000_000_000_000_000;

/// Struct encapsulating a fixed-point number that allows for decimal calculations
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreciseNumber {
  /// Wrapper over the inner value, which is multiplied by ONE
  pub value: InnerUint,
}

impl PartialOrd for PreciseNumber {
  fn partial_cmp(&self, other: &PreciseNumber) -> Option<Ordering> {
    Some(self.cmp(other))
  }
}

impl Ord for PreciseNumber {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    if self.less_than(other) {
      std::cmp::Ordering::Less
    } else if self.eq(other) {
      std::cmp::Ordering::Equal
    } else {
      std::cmp::Ordering::Greater
    }
  }
}

/// The precise-number 1 as a InnerUint. 24 decimals of precision
#[inline]
pub const fn one() -> InnerUint {
  // InnerUint::from(1_000_000_000_000_000_000_000_000_u128)
  U192([1000000000000000000_u64, 0_u64, 0_u64])
  // InnerUint::from(ONE)
}

#[inline]
pub const fn two() -> InnerUint {
  // InnerUint::from(1_000_000_000_000_000_000_000_000_u128)
  U192([2000000000000000000_u64, 0_u64, 0_u64])
  // InnerUint::from(ONE)
}

#[inline]
pub const fn four() -> InnerUint {
  U192([4000000000000000000_u64, 0_u64, 0_u64])
}

// 0.693147180369123816490000
#[inline]
pub const fn ln2hi() -> InnerUint {
  U192([13974485815783726801_u64, 3_u64, 0_u64])
}
pub const LN2HI: PreciseNumber = PreciseNumber { value: ln2hi() };
#[inline]

pub const fn ln2hi_scale() -> InnerUint {
  U192([7766279631452241920_u64, 5_u64, 0_u64])
}

pub const LN2HI_SCALE: PreciseNumber = PreciseNumber {
  value: ln2hi_scale(),
};

// 1.90821492927058770002e-10 /* 3dea39ef 35793c76 */
// Note that ln2lo is lower than our max precision, so we store both it and the thirty zeroes to scale by
#[inline]
pub const fn ln2lo() -> InnerUint {
  U192([3405790746697269248_u64, 1034445385942222_u64, 0_u64])
}
pub const LN2LO: PreciseNumber = PreciseNumber { value: ln2lo() };

#[inline]
pub const fn ln2lo_scale() -> InnerUint {
  U192([80237960548581376_u64, 10841254275107988496_u64, 293873_u64])
}

pub const LN2LO_SCALE: PreciseNumber = PreciseNumber {
  value: ln2lo_scale(),
};

// 6.666666666666735130e-01
#[inline]
pub const fn l1() -> InnerUint {
  U192([666666666666673513_u64, 0_u64, 0_u64])
}
pub const L1: PreciseNumber = PreciseNumber { value: l1() };

#[inline]
pub const fn l2() -> InnerUint {
  U192([399999999994094190_u64, 0_u64, 0_u64])
}
pub const L2: PreciseNumber = PreciseNumber { value: l2() };

#[inline]
pub const fn l3() -> InnerUint {
  U192([285714287436623914_u64, 0_u64, 0_u64])
}
pub const L3: PreciseNumber = PreciseNumber { value: l3() };

#[inline]
pub const fn l4() -> InnerUint {
  U192([222221984321497839_u64, 0_u64, 0_u64])
}
pub const L4: PreciseNumber = PreciseNumber { value: l4() };

#[inline]
pub const fn l5() -> InnerUint {
  U192([181835721616180501_u64, 0_u64, 0_u64])
}
pub const L5: PreciseNumber = PreciseNumber { value: l5() };

pub const fn l6() -> InnerUint {
  U192([153138376992093733_u64, 0_u64, 0_u64])
}
pub const L6: PreciseNumber = PreciseNumber { value: l6() };

#[inline]
pub const fn l7() -> InnerUint {
  U192([147981986051165859_u64, 0_u64, 0_u64])
}
pub const L7: PreciseNumber = PreciseNumber { value: l7() };

#[inline]
pub const fn sqrt2overtwo() -> InnerUint {
  U192([707106781186547600_u64, 0_u64, 0_u64])
}
pub const SQRT2OVERTWO: PreciseNumber = PreciseNumber {
  value: sqrt2overtwo(),
};

#[inline]
pub const fn half() -> InnerUint {
  U192([500000000000000000_u64, 0_u64, 0_u64])
}
pub const HALF: PreciseNumber = PreciseNumber { value: half() };

/// The number 0 as a PreciseNumber, used for easier calculations.
#[inline]
pub const fn zero() -> InnerUint {
  U192([0_u64, 0_u64, 0_u64])
}

impl PreciseNumber {
  pub fn signed(self) -> SignedPreciseNumber {
    SignedPreciseNumber {
      value: self,
      is_negative: false,
    }
  }

  /// Correction to apply to avoid truncation errors on division.  Since
  /// integer operations will always floor the result, we artifically bump it
  /// up by one half to get the expect result.
  fn rounding_correction() -> InnerUint {
    InnerUint::from(ONE / 2)
  }

  pub fn zero() -> Self {
    Self { value: zero() }
  }

  pub fn one() -> Self {
    Self { value: one() }
  }

  /// Create a precise number from an imprecise u128, should always succeed
  pub fn new(value: u128) -> Option<Self> {
    let value = InnerUint::from(value).checked_mul(one())?;
    Some(Self { value })
  }

  /// Convert a precise number back to u128
  pub fn to_imprecise(&self) -> Option<u128> {
    self
      .value
      .checked_add(Self::rounding_correction())?
      .checked_div(one())
      .map(|v| v.as_u128())
  }

  /// Checks that two PreciseNumbers are equal within some tolerance
  pub fn almost_eq(&self, rhs: &Self, precision: InnerUint) -> bool {
    let (difference, _) = self.unsigned_sub(rhs);
    difference.value < precision
  }

  /// Checks that a number is less than another
  pub fn less_than(&self, rhs: &Self) -> bool {
    self.value < rhs.value
  }

  /// Checks that a number is greater than another
  pub fn greater_than(&self, rhs: &Self) -> bool {
    self.value > rhs.value
  }

  /// Checks that a number is less than another
  pub fn less_than_or_equal(&self, rhs: &Self) -> bool {
    self.value <= rhs.value
  }

  /// Checks that a number is greater than another
  pub fn greater_than_or_equal(&self, rhs: &Self) -> bool {
    self.value >= rhs.value
  }

  /// Floors a precise value to a precision of ONE
  pub fn floor(&self) -> Option<Self> {
    let value = self.value.checked_div(one())?.checked_mul(one())?;
    Some(Self { value })
  }

  /// Ceiling a precise value to a precision of ONE
  pub fn ceiling(&self) -> Option<Self> {
    let value = self
      .value
      .checked_add(one().checked_sub(InnerUint::from(1))?)?
      .checked_div(one())?
      .checked_mul(one())?;
    Some(Self { value })
  }

  /// Performs a checked division on two precise numbers
  pub fn checked_div(&self, rhs: &Self) -> Option<Self> {
    if *rhs == Self::zero() {
      return None;
    }
    match self.value.checked_mul(one()) {
      Some(v) => {
        let value = v
          .checked_add(Self::rounding_correction())?
          .checked_div(rhs.value)?;
        Some(Self { value })
      }
      None => {
        let value = self
          .value
          .checked_add(Self::rounding_correction())?
          .checked_div(rhs.value)?
          .checked_mul(one())?;
        Some(Self { value })
      }
    }
  }

  /// Performs a multiplication on two precise numbers
  pub fn checked_mul(&self, rhs: &Self) -> Option<Self> {
    match self.value.checked_mul(rhs.value) {
      Some(v) => {
        let value = v
          .checked_add(Self::rounding_correction())?
          .checked_div(one())?;
        Some(Self { value })
      }
      None => {
        let value = if self.value >= rhs.value {
          self.value.checked_div(one())?.checked_mul(rhs.value)?
        } else {
          rhs.value.checked_div(one())?.checked_mul(self.value)?
        };
        Some(Self { value })
      }
    }
  }

  /// Performs addition of two precise numbers
  pub fn checked_add(&self, rhs: &Self) -> Option<Self> {
    let value = self.value.checked_add(rhs.value)?;
    Some(Self { value })
  }

  /// Subtracts the argument from self
  pub fn checked_sub(&self, rhs: &Self) -> Option<Self> {
    let value = self.value.checked_sub(rhs.value)?;
    Some(Self { value })
  }

  pub fn unsigned_sub(&self, rhs: &Self) -> (Self, bool) {
    match self.value.checked_sub(rhs.value) {
      None => {
        let value = rhs.value.checked_sub(self.value).unwrap();
        (Self { value }, true)
      }
      Some(value) => (Self { value }, false),
    }
  }

  // Frexp breaks f into a normalized fraction
  // and an integral power of two.
  // It returns frac and exp satisfying f == frac × 2**exp,
  // with the absolute value of frac in the interval [½, 1).
  //
  // Special cases are:
  //	Frexp(±0) = ±0, 0
  //	Frexp(±Inf) = ±Inf, 0
  //	Frexp(NaN) = NaN, 0
  fn frexp(&self) -> Option<(Self, i64)> {
    if self.eq(&ZERO_PREC) {
      Some((ZERO_PREC.clone(), 0))
    } else if self.less_than(&ONE_PREC) {
      let first_leading = self.value.0[0].leading_zeros();
      let one_leading = ONE_PREC.value.0[0].leading_zeros();
      let bits = i64::from(first_leading.checked_sub(one_leading).unwrap());
      let frac = PreciseNumber {
        value: self.value << bits,
      };
      if frac.less_than(&HALF) {
        Some((frac.checked_mul(&TWO_PREC).unwrap(), -bits - 1))
      } else {
        Some((frac, -bits))
      }
    } else {
      let bits = 128_i64.checked_sub(i64::from(self.to_imprecise()?.leading_zeros()))?;
      let frac = PreciseNumber {
        value: self.value >> bits,
      };
      if frac.less_than(&HALF) {
        Some((frac.checked_mul(&TWO_PREC).unwrap(), bits - 1))
      } else {
        Some((frac, bits))
      }
    }
  }

  // Modified from the original to support precise numbers instead of floats
  /*
    Floating-point logarithm.
    Borrowed from https://arm-software.github.io/golang-utils/src/math/log.go.html
  */
  // The original C code, the long comment, and the constants
  // below are from FreeBSD's /usr/src/lib/msun/src/e_log.c
  // and came with this notice. The go code is a simpler
  // version of the original C.
  //
  // ====================================================
  // Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
  //
  // Developed at SunPro, a Sun Microsystems, Inc. business.
  // Permission to use, copy, modify, and distribute this
  // software is freely granted, provided that this notice
  // is preserved.
  // ====================================================
  //
  // __ieee754_log(x)
  // Return the logarithm of x
  //
  // Method :
  //   1. Argument Reduction: find k and f such that
  //			x = 2**k * (1+f),
  //	   where  sqrt(2)/2 < 1+f < sqrt(2) .
  //
  //   2. Approximation of log(1+f).
  //	Let s = f/(2+f) ; based on log(1+f) = log(1+s) - log(1-s)
  //		 = 2s + 2/3 s**3 + 2/5 s**5 + .....,
  //	     	 = 2s + s*R
  //      We use a special Reme algorithm on [0,0.1716] to generate
  //	a polynomial of degree 14 to approximate R.  The maximum error
  //	of this polynomial approximation is bounded by 2**-58.45. In
  //	other words,
  //		        2      4      6      8      10      12      14
  //	    R(z) ~ L1*s +L2*s +L3*s +L4*s +L5*s  +L6*s  +L7*s
  //	(the values of L1 to L7 are listed in the program) and
  //	    |      2          14          |     -58.45
  //	    | L1*s +...+L7*s    -  R(z) | <= 2
  //	    |                             |
  //	Note that 2s = f - s*f = f - hfsq + s*hfsq, where hfsq = f*f/2.
  //	In order to guarantee error in log below 1ulp, we compute log by
  //		log(1+f) = f - s*(f - R)		(if f is not too large)
  //		log(1+f) = f - (hfsq - s*(hfsq+R)).	(better accuracy)
  //
  //	3. Finally,  log(x) = k*Ln2 + log(1+f).
  //			    = k*Ln2_hi+(f-(hfsq-(s*(hfsq+R)+k*Ln2_lo)))
  //	   Here Ln2 is split into two floating point number:
  //			Ln2_hi + Ln2_lo,
  //	   where n*Ln2_hi is always exact for |n| < 2000.
  //
  // Special cases:
  //	log(x) is NaN with signal if x < 0 (including -INF) ;
  //	log(+INF) is +INF; log(0) is -INF with signal;
  //	log(NaN) is that NaN with no signal.
  //
  // Accuracy:
  //	according to an error analysis, the error is always less than
  //	1 ulp (unit in the last place).
  //
  // Constants:
  // The hexadecimal values are the intended ones for the following
  // constants. The decimal values may be used, provided that the
  // compiler will convert from decimal to binary accurately enough
  // to produce the hexadecimal values shown.
  // Frexp breaks f into a normalized fraction
  // and an integral power of two.
  // It returns frac and exp satisfying f == frac × 2**exp,
  // with the absolute value of frac in the interval [½, 1).
  //
  // Log returns the natural logarithm of x.
  //
  // Special cases are:
  //	Log(+Inf) = +Inf
  //	Log(0) = -Inf
  //	Log(x < 0) = NaN
  pub fn log(&self) -> Option<SignedPreciseNumber> {
    if self.eq(&ZERO_PREC) {
      return None;
    }

    if self.eq(&ONE_PREC) {
      return Some(SignedPreciseNumber {
        value: ZERO_PREC.clone(),
        is_negative: false,
      });
    }

    let (f1_init, ki_init) = self.frexp()?;

    let (f1, ki) = if f1_init.less_than(&SQRT2OVERTWO) {
      let new_f1 = f1_init.checked_mul(&TWO_PREC)?;
      let new_k1 = ki_init.checked_sub(1)?;
      (new_f1, new_k1)
    } else {
      (f1_init, ki_init)
    };

    let f = f1.signed().checked_sub(&PreciseNumber::one().signed())?;

    let s_divisor = PreciseNumber { value: two() }.signed().checked_add(&f)?;
    let s = &f.checked_div(&s_divisor)?;
    let s2 = s.checked_mul(s)?.value;
    let s4 = s2.checked_mul(&s2)?;
    // s2 * (L1 + s4*(L3+s4*(L5+s4*L7)))
    let t1 = s2.checked_mul(&L1.checked_add(&s4.checked_mul(
      &L3.checked_add(&s4.checked_mul(&L5.checked_add(&s4.checked_mul(&L7)?)?)?)?,
    )?)?)?;

    // s4 * (L2 + s4*(L4+s4*L6))
    let t2 =
      s4.checked_mul(&L2.checked_add(&s4.checked_mul(&L4.checked_add(&s4.checked_mul(&L6)?)?)?)?)?;

    let r = t1.checked_add(&t2)?;
    let hfsq = f
      .checked_mul(&f)?
      .checked_div(&PreciseNumber { value: two() }.signed())?;
    let k = SignedPreciseNumber {
      value: PreciseNumber::new(u128::try_from(ki.abs()).ok()?)?,
      is_negative: ki < 0,
    };

    // k*Ln2Hi - ((hfsq - (s*(hfsq+R) + k*Ln2Lo)) - f)
    let kl2hi = k
      .checked_mul(&LN2HI.signed())?
      .checked_div(&LN2HI_SCALE.signed())?;
    let shfsqr = s.checked_mul(&hfsq.checked_add(&r.signed())?)?;
    let kl2lo = k
      .checked_mul(&LN2LO.signed())?
      .checked_div(&LN2LO_SCALE.signed())?;

    let shfsqr_kl2lo = shfsqr.checked_add(&kl2lo)?;
    let hfsq_shfsqr_kl2lo = hfsq.checked_sub(&shfsqr_kl2lo)?;
    let f_hfsq_shfsqr_kl2lo = hfsq_shfsqr_kl2lo.checked_sub(&f)?;

    kl2hi.checked_sub(&f_hfsq_shfsqr_kl2lo)
  }

  /*
  b = pow/frac
  y = a^b
  ln (y) = bln (a)
  y = e^(b ln (a))
  */
  pub fn pow(&self, exp: &Self) -> Option<Self> {
    if self.eq(&ZERO_PREC) {
      return Some(ZERO_PREC.clone());
    }

    let lg = self.log()?;
    let x = exp.clone().signed().checked_mul(&lg)?;
    x.exp()
  }

  pub fn print(&self) {
    let whole = self.floor().unwrap().to_imprecise().unwrap();
    let decimals = self
      .checked_sub(&PreciseNumber::new(whole).unwrap())
      .unwrap()
      .checked_mul(&PreciseNumber::new(ONE).unwrap())
      .unwrap()
      .to_imprecise()
      .unwrap();
    msg!("{}.{:0>width$}", whole, decimals, width = 18);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_pow() {
    let precision = InnerUint::from(5_000_000_000_000_u128); // correct to at least 12 decimal places
    let test = PreciseNumber::new(8).unwrap();
    let sqrt = test.pow(&HALF).unwrap();
    let expected = PreciseNumber::new(28284271247461903)
      .unwrap()
      .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
      .unwrap();
    assert!(sqrt.almost_eq(&expected, precision));

    let test2 = PreciseNumber::new(55)
      .unwrap()
      .checked_div(&PreciseNumber::new(100).unwrap())
      .unwrap();
    let squared = test2.pow(&TWO_PREC).unwrap();
    let expected = PreciseNumber::new(3025)
      .unwrap()
      .checked_div(&PreciseNumber::new(10000).unwrap())
      .unwrap();
    assert!(squared.almost_eq(&expected, precision));
  }

  #[test]
  fn test_log() {
    let precision = InnerUint::from(5_000_000_000_u128); // correct to at least 9 decimal places

    let test = PreciseNumber::new(9).unwrap();
    let log = test.log().unwrap().value;
    let expected = PreciseNumber::new(21972245773362196)
      .unwrap()
      .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
      .unwrap();
    assert!(log.almost_eq(&expected, precision));

    let test2 = PreciseNumber::new(2).unwrap();
    assert!(test2.log().unwrap().value.almost_eq(
      &PreciseNumber::new(6931471805599453)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let test3 = &PreciseNumber::new(12)
      .unwrap()
      .checked_div(&PreciseNumber::new(10).unwrap())
      .unwrap();
    assert!(test3.log().unwrap().value.almost_eq(
      &PreciseNumber::new(1823215567939546)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let test5 = &PreciseNumber::new(15)
      .unwrap()
      .checked_div(&PreciseNumber::new(10).unwrap())
      .unwrap();
    assert!(test5.log().unwrap().value.almost_eq(
      &PreciseNumber::new(4054651081081644)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let test6 = PreciseNumber::new(4)
      .unwrap()
      .checked_div(&PreciseNumber::new(1000000).unwrap())
      .unwrap();
    assert!(test6.log().unwrap().value.almost_eq(
      &PreciseNumber::new(12429216196844383)
        .unwrap()
        .checked_div(&PreciseNumber::new(1000000000000000).unwrap())
        .unwrap(),
      precision
    ));
  }

  #[test]
  fn test_floor() {
    let whole_number = PreciseNumber::new(2).unwrap();
    let mut decimal_number = PreciseNumber::new(2).unwrap();
    decimal_number.value += InnerUint::from(1);
    let floor = decimal_number.floor().unwrap();
    let floor_again = floor.floor().unwrap();
    assert_eq!(whole_number.value, floor.value);
    assert_eq!(whole_number.value, floor_again.value);
  }

  #[test]
  fn test_ceiling() {
    let whole_number = PreciseNumber::new(2).unwrap();
    let mut decimal_number = PreciseNumber::new(2).unwrap();
    decimal_number.value -= InnerUint::from(1);
    let ceiling = decimal_number.ceiling().unwrap();
    let ceiling_again = ceiling.ceiling().unwrap();
    assert_eq!(whole_number.value, ceiling.value);
    assert_eq!(whole_number.value, ceiling_again.value);
  }

  // // Keep around for testing. Can drop a debugger and find out the binary for the inner unit
  // #[test]
  // fn get_constants() {
  //   let one = PreciseNumber { value: InnerUint::from(ONE) };
  //   let two = PreciseNumber::new(2).unwrap();
  //   let sqrt_two_over_two = PreciseNumber::new(7071067811865476).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000).unwrap()
  //   ).unwrap();
  //   // Purposefully take 2 decimals off of ln2hi to keep precision
  //   let ln2hi = PreciseNumber::new(693147180369123816490_u128).unwrap().checked_div(
  //     &PreciseNumber::new(1_000_000_000_000_000_000_0).unwrap()
  //   ).unwrap();
  //   let ln2scale = &PreciseNumber::new(100).unwrap();
  //   let extraprecisescale = &PreciseNumber::new(1000000000).unwrap();

  //   let ln2lo_scale = &PreciseNumber::new(100000000000000000000000000).unwrap();
  //   let ln2lo = PreciseNumber::new(19082149292705877_u128).unwrap();
  //   let l1 = PreciseNumber::new(6666666666666735130_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();
  //   let l2 = PreciseNumber::new(3999999999940941908_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();
  //   let l3 = PreciseNumber::new(2857142874366239149_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();
  //   let l4 = PreciseNumber::new(2222219843214978396_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();
  //   let l5 = PreciseNumber::new(1818357216161805012_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();
  //   let l6 = PreciseNumber::new(1531383769920937332_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();
  //   let l7 = PreciseNumber::new(1479819860511658591_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000).unwrap()
  //   ).unwrap();

  //   let invln2 = PreciseNumber::new(144269504088896338700_u128).unwrap().checked_div(
  //     &PreciseNumber::new(100000000000000000000).unwrap()
  //   ).unwrap();

  //   let halfln2 = PreciseNumber::new(34657359027997264_u128).unwrap().checked_div(
  //     &PreciseNumber::new(100000000000000000).unwrap()
  //   ).unwrap();

  //   let threehalfln2 = PreciseNumber::new(10397207708399179_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000).unwrap()
  //   ).unwrap();

  //   let half = PreciseNumber::new(5_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10).unwrap()
  //   ).unwrap();

  //   let p1 = PreciseNumber::new(166666666666666019037_u128).unwrap().checked_div(
  //     &PreciseNumber::new(1000000000000000000000).unwrap()
  //   ).unwrap();

  //   let p2 = PreciseNumber::new(277777777770155933842_u128).unwrap().checked_div(
  //     &PreciseNumber::new(100000000000000000000000).unwrap()
  //   ).unwrap();

  //   let p3 = PreciseNumber::new(661375632143793436117_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000000000).unwrap()
  //   ).unwrap();

  //   let p4 = PreciseNumber::new(165339022054652515390_u128).unwrap().checked_div(
  //     &PreciseNumber::new(100000000000000000000000000).unwrap()
  //   ).unwrap();

  //   let p5 = PreciseNumber::new(413813679705723846039_u128).unwrap().checked_div(
  //     &PreciseNumber::new(10000000000000000000000000000).unwrap()
  //   ).unwrap();

  //   l1.print();
  //   l2.print();
  //   l3.print();
  //   l4.print();
  //   l5.print();
  //   l6.print();
  //   l7.print();
  //   ln2hi.print();
  //   ln2lo.print();
  //   ln2lo_scale.print();
  //   sqrt_two_over_two.print();

  //   let s = 1;
  // }
}
