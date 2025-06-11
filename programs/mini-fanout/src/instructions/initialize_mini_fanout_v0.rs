use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use clockwork_cron::Schedule;
use tuktuk_program::TaskQueueV0;

use crate::{errors::ErrorCode, state::*};

pub const MAX_SHARES: usize = 9;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct InitializeMiniFanoutArgsV0 {
  pub schedule: String,
  pub name: String,
  pub shares: Vec<MiniFanoutShareArgV0>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Debug, Eq, PartialEq, Clone)]
pub struct MiniFanoutShareArgV0 {
  pub wallet: Pubkey,
  pub share: Share,
}

#[derive(Accounts)]
#[instruction(args: InitializeMiniFanoutArgsV0)]
pub struct InitializeMiniFanoutV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Set as an arg basically
  pub authority: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    space = MiniFanoutV0::size(&args),
    seeds = [b"mini_fanout", &anchor_lang::solana_program::hash::hash(args.name.as_bytes()).to_bytes()[..]],
    bump
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  pub task_queue: Account<'info, TaskQueueV0>,
  #[account(mut)]
  pub rent_refund: SystemAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = mini_fanout,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Via seeds
  #[account(
    seeds = [b"queue_authority"],
    bump
  )]
  pub queue_authority: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
}

impl MiniFanoutV0 {
  pub fn size(args: &InitializeMiniFanoutArgsV0) -> usize {
    // Discriminator
    let mut size = 8;
    // Pubkey fields: authority, mint, token_account, next_task, rent_refund (5 * 32)
    size += 6 * 32;
    // bump: u8
    size += 1;
    // schedule: String (4 bytes len + string bytes)
    size += 4 + args.schedule.len();
    // name: String (4 bytes len + string bytes)
    size += 4 + args.name.len();
    // queue_authority_bump: u8
    size += 1;
    // shares: Vec<MiniFanoutShareV0> (4 bytes len + N * size)
    size += 4 + args.shares.len() * MiniFanoutShareV0::size();
    size + 60 // extra space for future fields
  }
}

impl MiniFanoutShareV0 {
  pub fn size() -> usize {
    // wallet: Pubkey (32)
    // shares: u32 (4)
    // total_dust: u64 (8)
    // total_owed: u64 (8)
    32 + 4 + 8 + 8
  }
}

pub fn handler(
  ctx: Context<InitializeMiniFanoutV0>,
  args: InitializeMiniFanoutArgsV0,
) -> Result<()> {
  require_gte!(args.shares.len(), 1, ErrorCode::InvalidShares);
  require_gte!(MAX_SHARES, args.shares.len(), ErrorCode::InvalidShares);
  // Validate schedule
  Schedule::from_str(&args.schedule).map_err(|e| {
    msg!("Invalid schedule {}", e);
    crate::errors::ErrorCode::InvalidSchedule
  })?;

  let mini_fanout = &mut ctx.accounts.mini_fanout;
  mini_fanout.set_inner(MiniFanoutV0 {
    authority: ctx.accounts.authority.key(),
    task_queue: ctx.accounts.task_queue.key(),
    mint: ctx.accounts.mint.key(),
    token_account: ctx.accounts.token_account.key(),
    next_task: Pubkey::default(),
    rent_refund: ctx.accounts.payer.key(),
    bump: ctx.bumps.mini_fanout,
    schedule: args.schedule,
    name: args.name,
    queue_authority_bump: ctx.bumps.queue_authority,
    shares: args
      .shares
      .into_iter()
      .map(|s| MiniFanoutShareV0 {
        wallet: s.wallet,
        share: s.share,
        total_dust: 0,
        total_owed: 0,
      })
      .collect(),
  });

  Ok(())
}
