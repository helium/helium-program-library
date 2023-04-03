use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializePriceOracleArgsV0 {
  pub oracles: Vec<OracleV0>,
  pub decimals: u8,
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializePriceOracleArgsV0)]
pub struct InitializePriceOracleV0<'info> {
  #[account(
    init,
    space =  60 + 8 + std::mem::size_of::<PriceOracleV0>() + (std::mem::size_of::<OracleV0>() * args.oracles.len()),
    payer = payer
  )]
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,
  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializePriceOracleV0>,
  args: InitializePriceOracleArgsV0,
) -> Result<()> {
  for i in 0..args.oracles.len() {
    require!(
      args
        .oracles
        .get(i)
        .unwrap()
        .last_submitted_timestamp
        .is_none(),
      ErrorCode::InvalidArgs
    );
    require!(
      args.oracles.get(i).unwrap().last_submitted_price.is_none(),
      ErrorCode::InvalidArgs
    );
  }
  ctx.accounts.price_oracle.set_inner(PriceOracleV0 {
    authority: args.authority,
    num_oracles: args.oracles.len().try_into().unwrap(),
    oracles: args.oracles,
    decimals: args.decimals,
    current_price: None,
    last_calculated_timestamp: None,
  });
  Ok(())
}
