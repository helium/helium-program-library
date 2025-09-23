use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use clockwork_cron::Schedule;
use tuktuk_program::{TaskQueueV0, TransactionSourceV0};

use crate::{errors::ErrorCode, state::*};

pub const MAX_SHARES: usize = 6;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeMiniFanoutArgsV0 {
  pub schedule: String,
  pub shares: Vec<MiniFanoutShareArgV0>,
  pub seed: Vec<u8>,
  pub pre_task: Option<TransactionSourceV0>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Debug, Clone)]
pub struct MiniFanoutShareArgV0 {
  pub wallet: Pubkey,
  pub share: Share,
}

#[derive(Accounts)]
#[instruction(args: InitializeMiniFanoutArgsV0)]
pub struct InitializeMiniFanoutV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Just needed for setting the owner of the mini fanout
  pub owner: AccountInfo<'info>,
  /// The namespace for the seeds
  pub namespace: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = MiniFanoutV0::size(&args),
    seeds = [b"mini_fanout", namespace.key().as_ref(), args.seed.as_ref()],
    bump
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  #[account(mut)]
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
    // This is the canonical bump for this program id, saves compute hardcoding it.
    bump = 254,
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
    size += 7 * 32;
    // bump: u8
    size += 1;
    // schedule: String (4 bytes len + string bytes)
    size += 4 + args.schedule.len();
    // queue_authority_bump: u8
    size += 1;
    // shares: Vec<MiniFanoutShareV0> (4 bytes len + N * size)
    size += 4 + args.shares.len() * MiniFanoutShareV0::size();
    // seed: Vec<u8> (4 bytes len + seed bytes)
    size += 4 + args.seed.len();
    if let Some(pre_task) = &args.pre_task {
      match pre_task {
        TransactionSourceV0::CompiledV0(compiled) => {
          size += 4
            + 3
            + 4
            + 32 * compiled.accounts.len()
            + 1 // option
            + 4 // Vec<>
            + compiled
              .instructions
              .iter()
              .map(|i| i.accounts.len() + i.data.len() + 4)
              .sum::<usize>()
            + compiled.signer_seeds.iter().map(|s| s.len()).sum::<usize>();
        }
        TransactionSourceV0::RemoteV0 { url, .. } => {
          size += 4 + 32 + url.len();
        }
      }
    }
    size + 60 // extra space for future fields
  }
}

impl MiniFanoutShareV0 {
  pub fn size() -> usize {
    // wallet: Pubkey (32)
    // shares: u32 (4)
    // total_dust: u64 (8)
    // total_owed: u64 (8)
    // delegate: Pubkey (32)
    32 + 4 + 8 + 8 + 32
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
    seed: args.seed,
    owner: ctx.accounts.owner.key(),
    namespace: ctx.accounts.namespace.key(),
    task_queue: ctx.accounts.task_queue.key(),
    mint: ctx.accounts.mint.key(),
    token_account: ctx.accounts.token_account.key(),
    next_task: crate::ID,
    rent_refund: ctx.accounts.payer.key(),
    bump: ctx.bumps.mini_fanout,
    schedule: args.schedule,
    queue_authority_bump: 254,
    shares: args
      .shares
      .into_iter()
      .map(|s| MiniFanoutShareV0 {
        wallet: s.wallet,
        share: s.share,
        delegate: Pubkey::default(),
        total_dust: 0,
        total_owed: 0,
      })
      .collect(),
    next_pre_task: crate::ID,
    pre_task: args.pre_task,
  });

  Ok(())
}
