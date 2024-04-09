use std::str::FromStr;

use crate::{error::ErrorCode, maker_seeds, state::*, TESTING};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use helium_sub_daos::SubDaoV0;
use pyth_sdk_solana::load_price_feed_from_account_info;

#[cfg(feature = "devnet")]
const PRICE_ORACLE: &str = "BmUdxoioVgoRTontomX8nBjWbnLevtxeuBYaLipP8GTQ";
#[cfg(not(feature = "devnet"))]
const PRICE_ORACLE: &str = "JBaTytFv1CmGNkyNiLu16jFMXNZ49BGfy4bYAYZdkxg5";

#[derive(Accounts)]
pub struct MobileVoucherPayMobileV0<'info> {
  #[account(mut)]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_mobile(),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    mut,
    has_one = rewardable_entity_config,
    has_one = maker,
    has_one = verified_owner,
  )]
  pub mobile_hotspot_voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
  pub verified_owner: Signer<'info>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked by loading with pyth. Also double checked by the has_one on data credits instance.
  #[account(
    address = Pubkey::from_str(PRICE_ORACLE).unwrap()
  )]
  pub dnt_price: AccountInfo<'info>,
  #[account(
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    associated_token::authority = maker,
    associated_token::mint = dnt_mint
  )]
  pub dnt_burner: Account<'info, TokenAccount>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<MobileVoucherPayMobileV0>) -> Result<()> {
  let fees = ctx
    .accounts
    .rewardable_entity_config
    .settings
    .mobile_device_fees(ctx.accounts.mobile_hotspot_voucher.device_type)
    .ok_or(error!(ErrorCode::InvalidDeviceType))?;
  let dnt_fee = fees.mobile_onboarding_fee_usd;
  require_gte!(
    dnt_fee,
    ctx.accounts.maker.expected_onboard_amount,
    ErrorCode::TooMuchBorrowed
  );

  let mobile_price_oracle =
    load_price_feed_from_account_info(&ctx.accounts.dnt_price).map_err(|e| {
      msg!("Pyth error {}", e);
      error!(ErrorCode::PythError)
    })?;
  let current_time = Clock::get()?.unix_timestamp;
  let mobile_price = mobile_price_oracle
    .get_ema_price_no_older_than(current_time, if TESTING { 6000000 } else { 10 * 60 })
    .ok_or_else(|| error!(ErrorCode::PythPriceNotFound))?;
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let mobile_price_with_conf = mobile_price
    .price
    .checked_sub(i64::try_from(mobile_price.conf.checked_mul(2).unwrap()).unwrap())
    .unwrap();
  // Exponent is a negative number, likely -8
  // Since the price is multiplied by an extra 10^8, and we're dividing by that price, need to also multiply
  // by the exponent
  let exponent_dec = 10_u64
    .checked_pow(u32::try_from(-mobile_price.expo).unwrap())
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

  require_gt!(mobile_price_with_conf, 0);
  let mobile_fee = dnt_fee
    .checked_mul(exponent_dec)
    .unwrap()
    .checked_div(mobile_price_with_conf.try_into().unwrap())
    .unwrap();
  if mobile_fee > 0 {
    let signer_seeds = maker_seeds!(ctx.accounts.maker);
    burn(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Burn {
          mint: ctx.accounts.dnt_mint.to_account_info(),
          from: ctx.accounts.dnt_burner.to_account_info(),
          authority: ctx.accounts.maker.to_account_info(),
        },
        &[signer_seeds],
      ),
      mobile_fee,
    )?;
  }

  ctx.accounts.maker.expected_onboard_amount = 0;
  ctx.accounts.mobile_hotspot_voucher.paid_mobile = true;

  Ok(())
}
