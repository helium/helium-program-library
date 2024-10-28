use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, close_account, transfer, Burn, CloseAccount, Mint, Token, TokenAccount, Transfer},
};
use voter_stake_registry::state::Registrar;

use crate::state::{VeTokenTrackerV0, VsrEpochInfoV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RewardForEpochArgsV0 {
  pub epoch: u64,
  pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: RewardForEpochArgsV0)]
pub struct RewardForEpochV0<'info> {
  pub rewards_authority: Signer<'info>,
  pub rewards_payer: Signer<'info>,
  #[account(mut)]
  pub rent_payer: Signer<'info>,
  #[account(
    mut,
    has_one = rewards_authority,
    has_one = rewards_mint,
    has_one = registrar,
  )]
  pub vetoken_tracker: Box<Account<'info, VeTokenTrackerV0>>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    init_if_needed,
    payer = rent_payer,
    space = 60 + VsrEpochInfoV0::INIT_SPACE,
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,
  #[account(mut)]
  pub rewards_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = rent_payer,
    associated_token::mint = rewards_mint,
    associated_token::authority = vsr_epoch_info,
  )]
  pub rewards_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = rewards_mint,
    associated_token::authority = rewards_payer,
  )]
  pub payer_ata: Box<Account<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<RewardForEpochV0>, args: RewardForEpochArgsV0) -> Result<()> {
  ctx.accounts.vsr_epoch_info.vetoken_tracker = ctx.accounts.vetoken_tracker.key();
  ctx.accounts.vsr_epoch_info.epoch = args.epoch;
  ctx.accounts.vsr_epoch_info.bump_seed = ctx.bumps["vsr_epoch_info"];
  ctx.accounts.vsr_epoch_info.recent_proposals =
    ctx.accounts.vetoken_tracker.recent_proposals.clone();
  ctx.accounts.vsr_epoch_info.rewards_issued_at =
    Some(ctx.accounts.registrar.clock_unix_timestamp());

  let curr_ts = ctx.accounts.registrar.clock_unix_timestamp();
  ctx
    .accounts
    .vetoken_tracker
    .update_vetokens(&mut ctx.accounts.vsr_epoch_info, curr_ts)?;

  let max_percent = 100_u64.checked_mul(10_0000000).unwrap();
  let tier = ctx
    .accounts
    .vetoken_tracker
    .voting_rewards_tiers
    .iter()
    .rev()
    .find(|tier| tier.num_vetokens <= ctx.accounts.vsr_epoch_info.vetokens_at_epoch_start)
    .unwrap()
    .percent;
  let actual_amount: u64 = (args.amount as u128)
    .checked_mul(u128::from(tier))
    .unwrap()
    .checked_div(max_percent as u128) // 100% with 2 decimals accuracy
    .unwrap()
    .try_into()
    .unwrap();

  ctx.accounts.vsr_epoch_info.rewards_amount = actual_amount;

  transfer(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.payer_ata.to_account_info(),
        to: ctx.accounts.rewards_pool.to_account_info(),
        authority: ctx.accounts.rewards_payer.to_account_info(),
      },
    ),
    actual_amount,
  )?;
  burn(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Burn {
        mint: ctx.accounts.rewards_mint.to_account_info(),
        authority: ctx.accounts.rewards_payer.to_account_info(),
        from: ctx.accounts.payer_ata.to_account_info(),
      },
    ),
    args.amount - actual_amount,
  )?;
  close_account(CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    CloseAccount {
      account: ctx.accounts.payer_ata.to_account_info(),
      destination: ctx.accounts.rent_payer.to_account_info(),
      authority: ctx.accounts.rewards_payer.to_account_info(),
    },
  ))?;

  Ok(())
}
