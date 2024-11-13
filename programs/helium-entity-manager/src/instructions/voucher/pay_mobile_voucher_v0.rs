use std::str::FromStr;

use account_compression_cpi::program::SplAccountCompression;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use bubblegum_cpi::get_asset_id;
use circuit_breaker::{CircuitBreaker, MintWindowedCircuitBreakerV0};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0, MintDataCreditsV0},
    burn_without_tracking_v0, mint_data_credits_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0, MintDataCreditsArgsV0,
};
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  DaoV0, SubDaoV0, TrackDcOnboardingFeesArgsV0,
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use shared_utils::{verify_compressed_nft, VerifyCompressedNftArgs};

use crate::{error::ErrorCode, maker_seeds, state::*, TESTING};

const PRICE_ORACLE: &str = "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PayMobileVoucherArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: PayMobileVoucherArgsV0)]
pub struct PayMobileVoucherV0<'info> {
  #[account(mut)]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_mobile(),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    mut,
    has_one = rewardable_entity_config,
    has_one = maker,
  )]
  pub mobile_voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
  #[account(
    mut,
    has_one = dao,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dc_mint,
    has_one = hnt_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked by loading with pyth. Also double checked by the has_one on data credits instance.
  #[account(
    address = Pubkey::from_str(PRICE_ORACLE).unwrap()
  )]
  pub dnt_price: Box<Account<'info, PriceUpdateV2>>,
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump = dc.data_credits_bump,
    has_one = dc_mint,
    has_one = hnt_price_oracle,
  )]
  pub dc: Account<'info, DataCreditsV0>,
  pub hnt_price_oracle: Box<Account<'info, PriceUpdateV2>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = maker,
  )]
  pub hnt_burner: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dc_mint,
    associated_token::authority = maker,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::authority = maker,
    associated_token::mint = dnt_mint
  )]
  pub dnt_burner: Account<'info, TokenAccount>,
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dc_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  #[account(
    has_one = dao,
    constraint = get_asset_id(&merkle_tree.key(), args.index.into()) == key_to_asset.asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub token_program: Program<'info, Token>,
  pub data_credits_program: Program<'info, DataCredits>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, PayMobileVoucherV0<'info>>,
  args: PayMobileVoucherArgsV0,
) -> Result<()> {
  verify_compressed_nft(VerifyCompressedNftArgs {
    data_hash: args.data_hash,
    creator_hash: args.creator_hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.hotspot_owner.key(),
    delegate: ctx.accounts.hotspot_owner.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  let fees = ctx
    .accounts
    .rewardable_entity_config
    .settings
    .mobile_device_fees(ctx.accounts.mobile_voucher.device_type)
    .ok_or(error!(ErrorCode::InvalidDeviceType))?;

  let dc_fee = fees.dc_onboarding_fee;
  if dc_fee > 0 {
    if ctx.accounts.dc_burner.amount < dc_fee {
      mint_data_credits_v0(
        CpiContext::new_with_signer(
          ctx.accounts.data_credits_program.to_account_info(),
          MintDataCreditsV0 {
            data_credits: ctx.accounts.dc.to_account_info(),
            hnt_price_oracle: ctx.accounts.hnt_price_oracle.to_account_info(),
            burner: ctx.accounts.hnt_burner.to_account_info(),
            recipient_token_account: ctx.accounts.dc_burner.to_account_info(),
            recipient: ctx.accounts.maker.to_account_info(),
            owner: ctx.accounts.maker.to_account_info(),
            hnt_mint: ctx.accounts.hnt_mint.to_account_info(),
            dc_mint: ctx.accounts.dc_mint.to_account_info(),
            circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
            circuit_breaker_program: ctx.accounts.circuit_breaker_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
          },
          &[maker_seeds!(ctx.accounts.maker)],
        ),
        MintDataCreditsArgsV0 {
          hnt_amount: None,
          dc_amount: Some(dc_fee - ctx.accounts.dc_burner.amount),
        },
      )?;
    }
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: ctx.accounts.dc.to_account_info(),
        burner: ctx.accounts.dc_burner.to_account_info(),
        owner: ctx.accounts.maker.to_account_info(),
        dc_mint: ctx.accounts.dc_mint.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
    };

    burn_without_tracking_v0(
      CpiContext::new_with_signer(
        ctx.accounts.data_credits_program.to_account_info(),
        cpi_accounts,
        &[maker_seeds!(ctx.accounts.maker)],
      ),
      BurnWithoutTrackingArgsV0 { amount: dc_fee },
    )?;
    track_dc_onboarding_fees_v0(
      CpiContext::new_with_signer(
        ctx.accounts.helium_sub_daos_program.to_account_info(),
        TrackDcOnboardingFeesV0 {
          hem_auth: ctx.accounts.rewardable_entity_config.to_account_info(),
          sub_dao: ctx.accounts.sub_dao.to_account_info(),
        },
        &[&[
          "rewardable_entity_config".as_bytes(),
          ctx.accounts.sub_dao.key().as_ref(),
          ctx.accounts.rewardable_entity_config.symbol.as_bytes(),
          &[ctx.accounts.rewardable_entity_config.bump_seed],
        ]],
      ),
      TrackDcOnboardingFeesArgsV0 {
        amount: fees.dc_onboarding_fee,
        add: true,
        symbol: ctx.accounts.rewardable_entity_config.symbol.clone(),
      },
    )?;
  }

  let dnt_fee = fees.mobile_onboarding_fee_usd;
  let mobile_price_oracle = &mut ctx.accounts.dnt_price;
  let current_time = Clock::get()?.unix_timestamp;
  require_gte!(
    mobile_price_oracle
      .price_message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceFeedStale
  );
  let mobile_price = mobile_price_oracle.price_message.ema_price;
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let mobile_price_with_conf = mobile_price
    .checked_sub(
      i64::try_from(
        mobile_price_oracle
          .price_message
          .ema_conf
          .checked_mul(2)
          .unwrap(),
      )
      .unwrap(),
    )
    .unwrap();
  // Exponent is a negative number, likely -8
  // Since the price is multiplied by an extra 10^8, and we're dividing by that price, need to also multiply
  // by the exponent
  let exponent_dec = 10_u64
    .checked_pow(u32::try_from(-mobile_price_oracle.price_message.exponent).unwrap())
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

  ctx.accounts.mobile_voucher.paid = true;
  ctx.accounts.mobile_voucher.dc_paid = dc_fee;

  Ok(())
}
