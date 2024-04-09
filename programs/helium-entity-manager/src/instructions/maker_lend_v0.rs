/// Creates a loan from the maker to whoever is onboarding,
/// but only if they are doing a valid onboarding command later on.
use std::str::FromStr;

use crate::{error::ErrorCode, maker_seeds};
use crate::{state::*, TESTING};
use anchor_lang::{
  prelude::*,
  solana_program::sysvar::{
    self,
    instructions::{load_current_index_checked, load_instruction_at_checked},
  },
};
use anchor_spl::token::{Mint, Token};
use conversion_escrow::{
  cpi::{accounts::LendV0, lend_v0},
  program::ConversionEscrow,
  ConversionEscrowV0, LendArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MakerLendArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct MakerLendV0<'info> {
  #[account(
    mut,
    // Ensure a loan isn't already in progress
    constraint = maker.expected_onboard_amount == 0 @ ErrorCode::LoanInProgress,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    constraint = TESTING || usdc_mint.key() == Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap()
  )]
  pub usdc_mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked in cpi
  pub target_oracle: UncheckedAccount<'info>,
  /// CHECK: Checked in cpi
  #[account(mut)]
  pub escrow: AccountInfo<'info>,
  /// CHECK: Checked in cpi
  pub oracle: AccountInfo<'info>,
  /// CHECK: Doesn't matter where it goes, so long as it is repaid
  #[account(mut)]
  pub destination: AccountInfo<'info>,
  /// CHECK: Checked in CPI
  #[account(mut)]
  pub repay_account: AccountInfo<'info>,
  #[account(
    seeds = [b"conversion_escrow", usdc_mint.key().as_ref(), maker.key().as_ref()],
    seeds::program = conversion_escrow_program,
    bump = conversion_escrow.bump_seed,
    has_one = escrow,
    has_one = oracle,
  )]
  pub conversion_escrow: Box<Account<'info, ConversionEscrowV0>>,
  pub conversion_escrow_program: Program<'info, ConversionEscrow>,
  /// CHECK: check instructions account
  #[account(address = sysvar::instructions::ID)]
  pub instructions: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MakerLendV0>, args: MakerLendArgsV0) -> Result<()> {
  let seeds = maker_seeds!(ctx.accounts.maker);

  let target = ctx
    .accounts
    .conversion_escrow
    .targets
    .iter()
    .find(|target| target.oracle == ctx.accounts.target_oracle.key())
    .unwrap();
  let amount_with_slippage = args.amount + args.amount * u64::from(target.slippage_bps) / 10000;
  lend_v0(
    CpiContext::new_with_signer(
      ctx.accounts.conversion_escrow_program.to_account_info(),
      LendV0 {
        conversion_escrow: ctx.accounts.conversion_escrow.to_account_info(),
        escrow: ctx.accounts.escrow.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        oracle: ctx.accounts.oracle.to_account_info(),
        target_oracle: ctx.accounts.target_oracle.to_account_info(),
        destination: ctx.accounts.destination.to_account_info(),
        repay_account: ctx.accounts.repay_account.to_account_info(),
        instructions: ctx.accounts.instructions.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
      &[seeds],
    ),
    LendArgsV0 {
      amount: amount_with_slippage,
    },
  )?;

  let ixs = ctx.accounts.instructions.to_account_info();
  let current_index = load_current_index_checked(&ixs)? as usize;
  // loop through instructions, looking for an onboard instruction
  let mut index = current_index + 1;
  let valid_instructions: Vec<[u8; 8]> = vec![
    get_function_hash("global", "mobile_voucher_pay_mobile_v0"),
    get_function_hash("global", "mobile_voucher_pay_dc_v0"),
    get_function_hash("global", "mobile_voucher_verify_owner_v0"),
  ];

  loop {
    // get the next instruction, die if theres no more
    if let Ok(ix) = load_instruction_at_checked(index, &ixs) {
      if ix.program_id == crate::id() {
        if valid_instructions.iter().any(|&i| i == ix.data[0..8]) {
          // Maker is always the first account in the instruction
          if ix.accounts[0].pubkey == ctx.accounts.maker.key() {
            break;
          }
        }
      }
    } else {
      // no more instructions, so we're missing an onboard
      return Err(ErrorCode::MissingOnboard.into());
    }

    index += 1
  }

  ctx.accounts.maker.expected_onboard_amount = args.amount;

  Ok(())
}

pub fn get_function_hash(namespace: &str, name: &str) -> [u8; 8] {
  let preimage = format!("{}:{}", namespace, name);
  let mut sighash = [0u8; 8];
  sighash
    .copy_from_slice(&anchor_lang::solana_program::hash::hash(preimage.as_bytes()).to_bytes()[..8]);
  sighash
}
