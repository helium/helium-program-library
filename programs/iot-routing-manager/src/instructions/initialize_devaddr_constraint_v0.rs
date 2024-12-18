use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{burn, Burn, Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};

use crate::{DevaddrConstraintV0, IotRoutingManagerV0, NetIdV0, OrganizationV0};

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDevaddrConstraintArgsV0 {
  pub num_blocks: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeDevaddrConstraintArgsV0)]
pub struct InitializeDevaddrConstraintV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(mut)]
  pub net_id: Box<Account<'info, NetIdV0>>,
  #[account(
    has_one = iot_mint,
    has_one = iot_price_oracle,
  )]
  pub routing_manager: Box<Account<'info, IotRoutingManagerV0>>,
  #[account(
    has_one = net_id,
    has_one = routing_manager,
    has_one = authority,
    constraint = organization.approved @ ErrorCode::OrganizationNotApproved,
  )]
  pub organization: Box<Account<'info, OrganizationV0>>,
  #[account(mut)]
  pub iot_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = iot_mint,
    associated_token::authority = payer,
  )]
  pub payer_iot_account: Box<Account<'info, TokenAccount>>,
  #[account(
    constraint = iot_price_oracle.verification_level == VerificationLevel::Full @ ErrorCode::PythPriceFeedStale,
  )]
  pub iot_price_oracle: Box<Account<'info, PriceUpdateV2>>,
  #[account(
    init,
    payer = payer,
    seeds = [b"devaddr_constraint", organization.key().as_ref(), &net_id.current_addr_offset.to_le_bytes()[..]],
    bump,
    space = 8 + DevaddrConstraintV0::INIT_SPACE + 60
  )]
  pub devaddr_constraint: Box<Account<'info, DevaddrConstraintV0>>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeDevaddrConstraintV0>,
  args: InitializeDevaddrConstraintArgsV0,
) -> Result<()> {
  let start_addr = ctx.accounts.net_id.current_addr_offset;
  let end_addr = start_addr + (args.num_blocks * 8) as u64;

  // Increment end_addr by 1
  // Since start_addr and end_addr of multiple devaddrs cant overlap
  if end_addr > ctx.accounts.net_id.current_addr_offset {
    ctx.accounts.net_id.current_addr_offset = end_addr + 1;
  }

  let message = ctx.accounts.iot_price_oracle.price_message;
  let current_time = Clock::get()?.unix_timestamp;
  require_gte!(
    message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceNotFound
  );
  let iot_price = message.ema_price;
  require_gt!(iot_price, 0);

  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let iot_price_with_conf = iot_price
    .checked_sub(i64::try_from(message.ema_conf.checked_mul(2).unwrap()).unwrap())
    .unwrap();
  // Exponent is a negative number, likely -8
  // Since the price is multiplied by an extra 10^8, and we're dividing by that price, need to also multiply
  // by the exponent
  let exponent_dec = 10_u64
    .checked_pow(u32::try_from(-message.exponent).unwrap())
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

  require_gt!(iot_price_with_conf, 0);
  let iot_fee = ctx
    .accounts
    .routing_manager
    .devaddr_price_usd
    .checked_mul(exponent_dec)
    .unwrap()
    .checked_div(iot_price_with_conf.try_into().unwrap())
    .unwrap()
    .checked_mul(
      end_addr
        .checked_sub(start_addr)
        .unwrap()
        .checked_div(8)
        .unwrap(),
    )
    .unwrap();

  if iot_fee > 0 {
    burn(
      CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
          mint: ctx.accounts.iot_mint.to_account_info(),
          from: ctx.accounts.payer_iot_account.to_account_info(),
          authority: ctx.accounts.payer.to_account_info(),
        },
      ),
      iot_fee,
    )?;
  }

  ctx
    .accounts
    .devaddr_constraint
    .set_inner(DevaddrConstraintV0 {
      routing_manager: ctx.accounts.net_id.routing_manager,
      net_id: ctx.accounts.net_id.key(),
      organization: ctx.accounts.organization.key(),
      start_addr,
      end_addr,
      bump_seed: ctx.bumps["devaddr_constraint"],
    });
  Ok(())
}
