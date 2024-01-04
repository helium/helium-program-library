use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::{prelude::*, solana_program::hash::hash};
use std::str::FromStr;

use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  DaoV0, SubDaoV0, TrackDcOnboardingFeesArgsV0,
};

use account_compression_cpi::program::SplAccountCompression;
use bubblegum_cpi::get_asset_id;
use price_oracle::{calculate_current_price, PriceOracleV0};
use shared_utils::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OnboardMobileHotspotArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
  pub location: Option<u64>,
  pub device_type: MobileDeviceTypeV0,
}

#[derive(Accounts)]
#[instruction(args: OnboardMobileHotspotArgsV0)]
pub struct OnboardMobileHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,
  pub issuing_authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = MOBILE_HOTSPOT_INFO_SIZE,
    seeds = [
      b"mobile_info", 
      rewardable_entity_config.key().as_ref(),
      &hash(&key_to_asset.entity_key[..]).to_bytes()
    ],
    bump,
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  /// CHECK: Only loaded if location is being asserted
  #[account(mut)]
  pub dc_burner: UncheckedAccount<'info>,
  #[account(
    mut,
    associated_token::authority = payer,
    associated_token::mint = dnt_mint
  )]
  pub dnt_burner: Account<'info, TokenAccount>,

  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_mobile()
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump = maker_approval.bump_seed,
    has_one = maker,
    has_one = rewardable_entity_config,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  #[account(
    has_one = merkle_tree,
    has_one = issuing_authority,
    has_one = dao,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    has_one = dc_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    constraint = get_asset_id(&merkle_tree.key(), args.index.into()) == key_to_asset.asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(
    mut,
    has_one = dao,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  #[account(
    address = Pubkey::from_str("moraMdsjyPFz8Lp1RJGoW4bQriSF5mHE7Evxt7hytSF").unwrap()
  )]
  pub dnt_price: Box<Account<'info, PriceOracleV0>>,

  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump = dc.data_credits_bump,
    has_one = dc_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,

  pub compression_program: Program<'info, SplAccountCompression>,
  pub data_credits_program: Program<'info, DataCredits>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

impl<'info> OnboardMobileHotspotV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnWithoutTrackingV0<'info>> {
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.dc_burner.to_account_info(),
        owner: self.dc_fee_payer.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
    };

    CpiContext::new(self.data_credits_program.to_account_info(), cpi_accounts)
  }

  pub fn mobile_burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.dnt_mint.to_account_info(),
      from: self.dnt_burner.to_account_info(),
      authority: self.payer.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, OnboardMobileHotspotV0<'info>>,
  args: OnboardMobileHotspotArgsV0,
) -> Result<()> {
  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    u64::try_from(args.index).unwrap(),
  );

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
    .mobile_device_fees(args.device_type)
    .ok_or(error!(ErrorCode::InvalidDeviceType))?;
  let mut dc_fee = fees.dc_onboarding_fee;
  let location_fee = fees.location_staking_fee;

  ctx.accounts.mobile_info.set_inner(MobileHotspotInfoV0 {
    asset: asset_id,
    bump_seed: ctx.bumps["mobile_info"],
    location: None,
    is_full_hotspot: true,
    num_location_asserts: 0,
    is_active: false,
    dc_onboarding_fee_paid: fees.dc_onboarding_fee,
    device_type: args.device_type,
  });

  if let Some(location) = args.location {
    dc_fee = location_fee.checked_add(dc_fee).unwrap();

    ctx.accounts.mobile_info.location = Some(location);
    ctx.accounts.mobile_info.num_location_asserts = ctx
      .accounts
      .mobile_info
      .num_location_asserts
      .checked_add(1)
      .unwrap();
  }

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

  // burn the dc tokens
  burn_without_tracking_v0(
    ctx.accounts.burn_ctx(),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  // Burn the mobile tokens
  let dnt_fee = fees.mobile_onboarding_fee_usd;
  let mobile_price = calculate_current_price(
    &ctx.accounts.dnt_price.oracles,
    Clock::get()?.unix_timestamp,
  )
  .ok_or_else(|| error!(ErrorCode::NoOraclePrice))?;
  let mobile_fee = dnt_fee
    .checked_mul(1000000)
    .unwrap()
    .checked_div(mobile_price)
    .unwrap();
  burn(ctx.accounts.mobile_burn_ctx(), mobile_fee)?;

  Ok(())
}
