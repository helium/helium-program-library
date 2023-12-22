use anchor_lang::prelude::*;
use helium_sub_daos::SubDaoV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeBoostConfigArgsV0 {
  /// The price in the payment_mint to burn boost
  pub boost_price: u64,
  /// The length of a period (defined as a month in the HIP)
  pub period_length: u32,
  /// The minimum of periods to boost
  pub minimum_periods: u16,
}

#[derive(Accounts)]
#[instruction(args: InitializeBoostConfigArgsV0)]
pub struct InitializeBoostConfigV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    has_one = authority
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,
  pub payment_mint: Box<Account<'info, Mint>>,

  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<BoostConfigV0>(),
    seeds = ["boost_config".as_bytes(), payment_mint.key().as_ref()],
    bump,
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeBoostConfigV0>,
  args: InitializeBoostConfigArgsV0,
) -> Result<()> {
  ctx
    .accounts
    .boost_config
    .set_inner(BoostConfigV0 {
      authority: ctx.accounts.authority.key(),
      price_oracle: ctx.accounts.price_oracle.key(),
      payment_mint: args.payment_mint.clone(),
      boost_price: args.boost_price,
      period_length: args.period_length,
      minimum_periods: args.minimum_periods,
      bump_seed: ctx.bumps["boost_config"],
    });

  Ok(())
}
