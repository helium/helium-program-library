// use crate::state::*;
// use anchor_lang::prelude::*;
// use anchor_spl::token::{Mint, TokenAccount, Token};

// #[derive(Accounts)]
// pub struct IssueRewardsV0<'info> {
//   #[account(mut)]
//   pub refund: Signer<'info>,
//   #[account(
//     init,
//     payer = payer,
//     space = 8 + std::mem::size_of::<DaoV0>() + 60,
//     seeds = ["dao".as_bytes(), mint.key().as_ref()],
//     bump,
//   )]
//   pub dao: Box<Account<'info, DaoV0>>,
//   #[account(
//     constraint = mint_authority.key() == mint.mint_authority.unwrap()
//   )]
//   pub mint: Box<Account<'info, Mint>>,
//   pub mint_authority: Signer<'info>,
//   #[account(
//     init,
//     payer = payer,
//     seeds = ["dao-treasury".as_bytes(), dao.key().as_ref()],
//     bump,
//     token::mint = mint,
//     token::authority = dao,
//   )]
//   pub treasury: Box<Account<'info, TokenAccount>>,
//   pub system_program: Program<'info, System>,
//   pub token_program: Program<'info, Token>,
//   pub rent: Sysvar<'info, Rent>,
// }

// pub fn handler(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
//   ctx.accounts.dao.set_inner(DaoV0 {
//     mint: ctx.accounts.mint.key(),
//     treasury: ctx.accounts.treasury.key(),
//     authority: args.authority,
//     bump_seed: ctx.bumps["dao"],
//   });

//   Ok(())
// }
