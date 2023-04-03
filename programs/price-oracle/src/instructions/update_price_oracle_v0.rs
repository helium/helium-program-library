use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdatePriceOracleArgsV0 {
  pub oracles: Option<Vec<OracleV0>>,
  pub authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdatePriceOracleArgsV0)]
pub struct UpdatePriceOracleV0<'info> {
  #[account(
    mut,
    has_one = authority
  )]
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,
  #[account(mut)]
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdatePriceOracleV0>, args: UpdatePriceOracleArgsV0) -> Result<()> {
  if let Some(oracles) = args.oracles {
    for i in 0..oracles.len() {
      require!(
        oracles.get(i).unwrap().last_submitted_timestamp.is_none(),
        ErrorCode::InvalidArgs
      );
      require!(
        oracles.get(i).unwrap().last_submitted_price.is_none(),
        ErrorCode::InvalidArgs
      );
    }
    ctx.accounts.price_oracle.num_oracles = oracles.len().try_into().unwrap();
    ctx.accounts.price_oracle.oracles = oracles;
    ctx.accounts.price_oracle.current_price = None;
    ctx.accounts.price_oracle.last_calculated_timestamp = None;
  }

  if let Some(authority) = args.authority {
    ctx.accounts.price_oracle.authority = authority;
  }

  Ok(())
}
