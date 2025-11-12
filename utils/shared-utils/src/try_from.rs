#[macro_export]
macro_rules! try_from {
  ($ty: ty, $acc: expr) => {{
    let account_info = $acc.as_ref();
    <$ty>::try_from(unsafe {
      core::mem::transmute::<
        &anchor_lang::prelude::AccountInfo<'_>,
        &anchor_lang::prelude::AccountInfo<'_>,
      >(account_info)
    })
  }};
}
