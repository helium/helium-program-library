// use crate::state::*;
// use anchor_lang::prelude::*;
// use anchor_spl::token::spl_token::instruction::AuthorityType;
// use anchor_spl::token::{set_authority, SetAuthority};
// use anchor_spl::token::{Mint, Token};

// #[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
// pub struct InitializeTreasuryManagementArgsV0 {
//   pub authority: Pubkey,
//   pub curve: Curve
// }

// #[derive(Accounts)]
// #[instruction(args: InitializeTreasuryManagementArgsV0)]
// pub struct InitializeTreasuryManagementV0<'info> {
//   #[account(mut)]
//   pub payer: Signer<'info>,
//   #[account(
//     init,
//     payer = payer,
//     space = 8 + std::mem::size_of::<DaoV0>() + 60,
//     seeds = ["treasury_management".as_bytes(), reserve_mint.key().as_ref(), supply_mint.key().as_ref()],
//     bump,
//   )]
//   pub treasury_management: Box<Account<'info, DaoV0>>,
//   #[account(mut)]
//   pub treasury_mint: Box<Account<'info, Mint>>,
//   pub supply_mint: Box<Account<'info, Mint>>,
//   #[account(
//     init_if_needed,
//     associated_token::authority = treasury_management,
//     associated_token::mint = reserve_mint,
//   )]
//   pub treasury: Box<Account<'info, TokenAccount>>,
//   pub system_program: Program<'info, System>,
//   pub associated_token_program: Program<'info, AssociatedToken>,
//   pub token_program: Program<'info, Token>,
//   pub rent: Sysvar<'info, Rent>,
// }

// pub fn handler(ctx: Context<InitializeTreasuryManagementV0>, args: InitializeTreasuryManagementArgsV0) -> Result<()> {
//   ctx.accounts.treasury_management.set_inner(TreasuryV0 {
//     dc_mint: ctx.accounts.dc_mint.key(),
//     mint: ctx.accounts.reserve_mint.key(),
//     authority: args.authority,
//     num_sub_treasury_managements: 0,
//     reward_per_epoch: args.reward_per_epoch,
//     bump_seed: ctx.bumps["treasury_management"],
//   });

//   Ok(())
// }
