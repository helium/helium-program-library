use crate::{error::ErrorCode, maker_seeds, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{CircuitBreaker, MintWindowedCircuitBreakerV0};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0, MintDataCreditsV0},
    burn_without_tracking_v0, mint_data_credits_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0, MintDataCreditsArgsV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};

#[derive(Accounts)]
pub struct MobileVoucherPayDcV0<'info> {
  #[account(mut)]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(mut)]
  pub payer: Signer<'info>,
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
  #[account(
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  /// CHECK: Checked by loading with pyth. Also double checked by the has_one on data credits instance.
  pub hnt_price_oracle: AccountInfo<'info>,
  #[account(
    has_one = dc_mint,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump = dc.data_credits_bump,
    has_one = dc_mint,
    has_one = hnt_price_oracle,
    has_one = hnt_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,
  #[account(
    mut,
    associated_token::authority = maker,
    associated_token::mint = hnt_mint,
  )]
  pub burner: Account<'info, TokenAccount>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dc_mint,
    associated_token::authority = maker,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dc_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub token_program: Program<'info, Token>,
  pub data_credits_program: Program<'info, DataCredits>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<MobileVoucherPayDcV0>) -> Result<()> {
  let fees = ctx
    .accounts
    .rewardable_entity_config
    .settings
    .mobile_device_fees(ctx.accounts.mobile_hotspot_voucher.device_type)
    .ok_or(error!(ErrorCode::InvalidDeviceType))?;

  let dc_fee = fees.dc_onboarding_fee;
  require_gte!(
    // Extra decimal
    dc_fee * 10,
    ctx.accounts.maker.expected_onboard_amount,
    ErrorCode::TooMuchBorrowed
  );

  if dc_fee > 0 {
    mint_data_credits_v0(
      CpiContext::new_with_signer(
        ctx.accounts.data_credits_program.to_account_info(),
        MintDataCreditsV0 {
          data_credits: ctx.accounts.dc.to_account_info(),
          hnt_price_oracle: ctx.accounts.hnt_price_oracle.to_account_info(),
          burner: ctx.accounts.burner.to_account_info(),
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
        dc_amount: Some(dc_fee),
        hnt_amount: None,
      },
    )?;
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
  }

  ctx.accounts.mobile_hotspot_voucher.paid_dc = true;

  Ok(())
}
