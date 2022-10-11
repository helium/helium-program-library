use crate::{
  precise_number::{
    InnerUint, PreciseNumber, HALF, LN2HI, LN2HI_SCALE, LN2LO, LN2LO_SCALE, ONE_PREC, TWO_PREC,
  },
  uint::U192,
};

/// Struct encapsulating a signed fixed-point number that allows for decimal calculations
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignedPreciseNumber {
  pub value: PreciseNumber,
  pub is_negative: bool,
}

#[inline]
pub const fn p1() -> InnerUint {
  U192([166666666666666019_u64, 0_u64, 0_u64])
}
pub const P1: SignedPreciseNumber = SignedPreciseNumber {
  value: PreciseNumber { value: p1() },
  is_negative: false,
};

#[inline]
pub const fn p2() -> InnerUint {
  U192([2777777777701559_u64, 0_u64, 0_u64])
}
pub const P2: SignedPreciseNumber = SignedPreciseNumber {
  value: PreciseNumber { value: p2() },
  is_negative: true,
};

#[inline]
pub const fn p3() -> InnerUint {
  U192([66137563214379_u64, 0_u64, 0_u64])
}
pub const P3: SignedPreciseNumber = SignedPreciseNumber {
  value: PreciseNumber { value: p3() },
  is_negative: false,
};

#[inline]
pub const fn p4() -> InnerUint {
  U192([1653390220546_u64, 0_u64, 0_u64])
}
pub const P4: SignedPreciseNumber = SignedPreciseNumber {
  value: PreciseNumber { value: p4() },
  is_negative: true,
};

#[inline]
pub const fn p5() -> InnerUint {
  U192([41381367970_u64, 0_u64, 0_u64])
}
pub const P5: SignedPreciseNumber = SignedPreciseNumber {
  value: PreciseNumber { value: p5() },
  is_negative: false,
};

#[inline]
pub const fn halfln2() -> InnerUint {
  U192([346573590279972640_u64, 0_u64, 0_u64])
}
pub const HALFLN2: PreciseNumber = PreciseNumber { value: halfln2() };

#[inline]
pub const fn threehalfln2() -> InnerUint {
  U192([1039720770839917900_u64, 0_u64, 0_u64])
}
pub const THREEHALFLN2: PreciseNumber = PreciseNumber {
  value: threehalfln2(),
};

#[inline]
pub const fn invln2() -> InnerUint {
  U192([1442695040888963387_u64, 0_u64, 0_u64])
}
pub const INVLN2: PreciseNumber = PreciseNumber { value: invln2() };

impl SignedPreciseNumber {
  pub fn negate(&self) -> SignedPreciseNumber {
    SignedPreciseNumber {
      value: self.value.clone(),
      is_negative: !self.is_negative,
    }
  }

  pub fn checked_mul(&self, rhs: &Self) -> Option<SignedPreciseNumber> {
    Some(SignedPreciseNumber {
      value: self.value.checked_mul(&rhs.value)?,
      is_negative: (self.is_negative || rhs.is_negative) && !(self.is_negative && rhs.is_negative),
    })
  }

  pub fn checked_div(&self, rhs: &Self) -> Option<SignedPreciseNumber> {
    Some(SignedPreciseNumber {
      value: self.value.checked_div(&rhs.value)?,
      is_negative: (self.is_negative || rhs.is_negative) && !(self.is_negative && rhs.is_negative),
    })
  }

  pub fn checked_add(&self, rhs: &Self) -> Option<SignedPreciseNumber> {
    let lhs_negative = self.is_negative;
    let rhs_negative = rhs.is_negative;

    if rhs_negative && lhs_negative {
      Some(Self {
        value: self.value.checked_add(&rhs.value)?,
        is_negative: true,
      })
    } else if rhs_negative {
      if rhs.value.greater_than(&self.value) {
        Some(Self {
          value: rhs.value.checked_sub(&self.value)?,
          is_negative: true,
        })
      } else {
        Some(Self {
          value: self.value.checked_sub(&rhs.value)?,
          is_negative: false,
        })
      }
    } else if lhs_negative {
      if self.value.greater_than(&rhs.value) {
        Some(Self {
          value: self.value.checked_sub(&rhs.value)?,
          is_negative: true,
        })
      } else {
        Some(Self {
          value: rhs.value.checked_sub(&self.value)?,
          is_negative: false,
        })
      }
    } else {
      Some(Self {
        value: self.value.checked_add(&rhs.value)?,
        is_negative: false,
      })
    }
  }

  pub fn checked_sub(&self, rhs: &Self) -> Option<SignedPreciseNumber> {
    self.checked_add(&rhs.clone().negate())
  }

  pub fn floor(&self) -> Option<SignedPreciseNumber> {
    Some(Self {
      value: self.value.floor()?,
      is_negative: self.is_negative,
    })
  }

  // Modified from the original to support precise numbers instead of floats
  /* origin: FreeBSD /usr/src/lib/msun/src/e_exp.c */
  /*
   * ====================================================
   * Copyright (C) 2004 by Sun Microsystems, Inc. All rights reserved.
   *
   * Permission to use, copy, modify, and distribute this
   * software is freely granted, provided that this notice
   * is preserved.
   * ====================================================
   */
  /* exp(x)
   * Returns the exponential of x.
   *
   * Method
   *   1. Argument reduction:
   *      Reduce x to an r so that |r| <= 0.5*ln2 ~ 0.34658.
   *      Given x, find r and integer k such that
   *
   *               x = k*ln2 + r,  |r| <= 0.5*ln2.
   *
   *      Here r will be represented as r = hi-lo for better
   *      accuracy.
   *
   *   2. Approximation of exp(r) by a special rational function on
   *      the interval [0,0.34658]:
   *      Write
   *          R(r**2) = r*(exp(r)+1)/(exp(r)-1) = 2 + r*r/6 - r**4/360 + ...
   *      We use a special Remez algorithm on [0,0.34658] to generate
   *      a polynomial of degree 5 to approximate R. The maximum error
   *      of this polynomial approximation is bounded by 2**-59. In
   *      other words,
   *          R(z) ~ 2.0 + P1*z + P2*z**2 + P3*z**3 + P4*z**4 + P5*z**5
   *      (where z=r*r, and the values of P1 to P5 are listed below)
   *      and
   *          |                  5          |     -59
   *          | 2.0+P1*z+...+P5*z   -  R(z) | <= 2
   *          |                             |
   *      The computation of exp(r) thus becomes
   *                              2*r
   *              exp(r) = 1 + ----------
   *                            R(r) - r
   *                                 r*c(r)
   *                     = 1 + r + ----------- (for better accuracy)
   *                                2 - c(r)
   *      where
   *                              2       4             10
   *              c(r) = r - (P1*r  + P2*r  + ... + P5*r   ).
   *
   *   3. Scale back to obtain exp(x):
   *      From step 1, we have
   *         exp(x) = 2^k * exp(r)
   *
   * Special cases:
   *      exp(INF) is INF, exp(NaN) is NaN;
   *      exp(-INF) is 0, and
   *      for finite argument, only exp(0)=1 is exact.
   *
   * Accuracy:
   *      according to an error analysis, the error is always less than
   *      1 ulp (unit in the last place).
   *
   * Misc. info.
   *      For IEEE double
   *          if x >  709.782712893383973096 then exp(x) overflows
   *          if x < -745.133219101941108420 then exp(x) underflows
   */

  /// Calculate the exponential of `x`, that is, *e* raised to the power `x`
  /// (where *e* is the base of the natural system of logarithms, approximately 2.71828).
  /// Note that precision can start to get inaccurate for larger numbers (> 20).
  pub fn exp(&self) -> Option<PreciseNumber> {
    let hi: Self;
    let lo: Self;
    let k: Self;
    let x: Self;

    /* argument reduction */
    /* if |x| > 0.5 ln2 */
    if self.value.greater_than(&HALFLN2) {
      /* if |x| >= 1.5 ln2 */
      if self.value.greater_than_or_equal(&THREEHALFLN2) {
        k = INVLN2
          .signed()
          .checked_mul(self)?
          .checked_add(&Self {
            value: HALF,
            is_negative: self.is_negative,
          })?
          .floor()?;

        // A K larger than this value will cause less than 9 decimals of precision
        // if k.value.to_imprecise()? > 29 {
        //   return None
        // }
      } else {
        k = Self {
          value: PreciseNumber::one(),
          is_negative: self.is_negative,
        }
      }
      hi = self.checked_sub(
        &k.checked_mul(&LN2HI.signed())?
          .checked_div(&LN2HI_SCALE.signed())?,
      )?;

      lo = k
        .checked_mul(&LN2LO.signed())?
        .checked_div(&LN2LO_SCALE.signed())?;
      x = hi.checked_sub(&lo)?
    } else {
      x = self.clone();
      k = PreciseNumber::zero().signed();
      hi = self.clone();
      lo = PreciseNumber::zero().signed()
    }

    /* x is now in primary range */
    let xx = x.checked_mul(&x)?;
    // c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
    let p4p5 = P4.checked_add(&xx.checked_mul(&P5)?)?;
    let p3p4p5 = P3.checked_add(&xx.checked_mul(&p4p5)?)?;
    let p2p3p4p5 = P2.checked_add(&xx.checked_mul(&p3p4p5)?)?;
    let p1p2p3p4p5 = P1.checked_add(&xx.checked_mul(&p2p3p4p5)?)?;
    let c = x.checked_sub(&p1p2p3p4p5.checked_mul(&xx)?)?;

    // y = 1. + (x * c / (2. - c) - lo + hi);
    let y = ONE_PREC.clone().signed().checked_add(
      &x.checked_mul(&c)?
        .checked_div(&TWO_PREC.clone().signed().checked_sub(&c)?)?
        .checked_sub(&lo)?
        .checked_add(&hi)?,
    )?;

    if k.value.eq(&PreciseNumber::zero()) {
      Some(y.value)
    } else {
      let bits = k.value.to_imprecise()?;

      if k.is_negative {
        Some(PreciseNumber {
          value: y.value.value >> bits,
        })
      } else {
        Some(PreciseNumber {
          value: y.value.value << bits,
        })
      }
    }
  }

  pub fn print(&self) {
    self.value.print()
  }
}
#[cfg(test)]
mod tests {
  use crate::precise_number::half;

  use super::*;

  #[test]

  fn test_exp() {
    let precision = InnerUint::from(1_000_000_000_u128); // correct to at least 9 decimal places

    let half = PreciseNumber { value: half() }.signed();
    assert!(half.exp().unwrap().almost_eq(
      &PreciseNumber::new(16487212707001282)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let three_half = PreciseNumber::new(15)
      .unwrap()
      .checked_div(&PreciseNumber::new(10).unwrap())
      .unwrap()
      .signed();
    assert!(three_half.exp().unwrap().almost_eq(
      &PreciseNumber::new(44816890703380645)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let point_one = PreciseNumber::new(1)
      .unwrap()
      .checked_div(&PreciseNumber::new(10).unwrap())
      .unwrap()
      .signed();
    assert!(point_one.exp().unwrap().almost_eq(
      &PreciseNumber::new(11051709180756477)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let negative = PreciseNumber::new(55)
      .unwrap()
      .checked_div(&PreciseNumber::new(100).unwrap())
      .unwrap()
      .signed()
      .negate();
    assert!(negative.exp().unwrap().almost_eq(
      &PreciseNumber::new(5769498103804866)
        .unwrap()
        .checked_div(&PreciseNumber::new(10000000000000000).unwrap())
        .unwrap(),
      precision
    ));

    let test = PreciseNumber::new(19).unwrap().signed();
    assert!(test.exp().unwrap().almost_eq(
      &PreciseNumber::new(178482300963187260)
        .unwrap()
        .checked_div(&PreciseNumber::new(1000000000).unwrap())
        .unwrap(),
      precision
    ));
  }
}
