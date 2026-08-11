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

/// Reserved beyond what the account's contents need, so a later field fits without a resize.
const RESERVE: usize = 60;

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
    // owner, namespace, mint, token_account, task_queue, next_task, rent_refund, next_pre_task
    size += 8 * 32;
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
    // pre_task: the Option tag, and for Some the TransactionSourceV0 enum discriminant
    size += 1;
    if let Some(pre_task) = &args.pre_task {
      size += 1;
      match pre_task {
        TransactionSourceV0::CompiledV0(compiled) => {
          // num_rw_signers, num_ro_signers, num_rw
          size += 3;
          // accounts: Vec<Pubkey>
          size += 4 + 32 * compiled.accounts.len();
          // instructions: Vec<CompiledInstructionV0>, each a program_id_index and two Vec<u8>
          size += 4
            + compiled
              .instructions
              .iter()
              .map(|i| 1 + 4 + i.accounts.len() + 4 + i.data.len())
              .sum::<usize>();
          // signer_seeds: Vec<Vec<Vec<u8>>>
          size += 4
            + compiled
              .signer_seeds
              .iter()
              .map(|group| 4 + group.iter().map(|seed| 4 + seed.len()).sum::<usize>())
              .sum::<usize>();
        }
        TransactionSourceV0::RemoteV0 { url, signer: _ } => {
          // url: String, signer: Pubkey
          size += 4 + url.len() + 32;
        }
      }
    }
    size + RESERVE
  }
}

impl MiniFanoutShareV0 {
  pub fn size() -> usize {
    // wallet: Pubkey (32)
    // shares: 1 enum + 8 u64
    // total_dust: u64 (8)
    // total_owed: u64 (8)
    // delegate: Pubkey (32)
    32 + 1 + 8 + 8 + 8 + 32
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
    next_task: mini_fanout.key(),
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
    next_pre_task: mini_fanout.key(),
    pre_task: args.pre_task,
  });

  if let Some(pre_task) = &mini_fanout.pre_task {
    validate_pre_task(pre_task)?;
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use tuktuk_program::{CompiledInstructionV0, CompiledTransactionV0};

  use super::*;

  /// The account `handler` writes for these args, so what `size` reserves can be measured
  /// against what storing it actually costs.
  fn stored(args: &InitializeMiniFanoutArgsV0) -> MiniFanoutV0 {
    MiniFanoutV0 {
      owner: Pubkey::new_unique(),
      namespace: Pubkey::new_unique(),
      mint: Pubkey::new_unique(),
      token_account: Pubkey::new_unique(),
      task_queue: Pubkey::new_unique(),
      next_task: Pubkey::new_unique(),
      rent_refund: Pubkey::new_unique(),
      bump: 255,
      schedule: args.schedule.clone(),
      queue_authority_bump: 254,
      shares: args
        .shares
        .iter()
        .map(|s| MiniFanoutShareV0 {
          wallet: s.wallet,
          share: s.share.clone(),
          delegate: Pubkey::default(),
          total_dust: 0,
          total_owed: 0,
        })
        .collect(),
      seed: args.seed.clone(),
      next_pre_task: Pubkey::new_unique(),
      pre_task: args.pre_task.clone(),
    }
  }

  fn args(pre_task: Option<TransactionSourceV0>) -> InitializeMiniFanoutArgsV0 {
    args_with(pre_task, Share::Fixed { amount: 1 })
  }

  fn args_with(pre_task: Option<TransactionSourceV0>, share: Share) -> InitializeMiniFanoutArgsV0 {
    InitializeMiniFanoutArgsV0 {
      schedule: "0 0 * * * *".to_string(),
      shares: vec![
        MiniFanoutShareArgV0 {
          wallet: Pubkey::new_unique(),
          share,
        };
        MAX_SHARES
      ],
      seed: b"a-fanout-seed".to_vec(),
      pre_task,
    }
  }

  fn compiled(instructions: usize, signer_seeds: Vec<Vec<Vec<u8>>>) -> TransactionSourceV0 {
    TransactionSourceV0::CompiledV0(CompiledTransactionV0 {
      num_rw_signers: 1,
      num_ro_signers: 0,
      num_rw: 2,
      accounts: vec![Pubkey::new_unique(); 5],
      instructions: (0..instructions)
        .map(|i| CompiledInstructionV0 {
          program_id_index: 4,
          accounts: vec![0, 1, 2],
          data: vec![i as u8; 17],
        })
        .collect(),
      signer_seeds,
    })
  }

  #[test]
  fn a_narrower_share_is_reserved_for_the_wider_one() {
    // MiniFanoutShareV0 reserves for the wider of the two Share variants, so a fanout of the
    // narrower one costs less than is set aside for it and never more.
    let args = args_with(None, Share::Share { amount: 1 });
    let reserved = MiniFanoutV0::size(&args);
    let needed = 8
      + stored(&args)
        .try_to_vec()
        .expect("serialize the account")
        .len();

    assert!(reserved >= needed, "reserved {reserved} < needed {needed}");
    // Four bytes per share wider than Fixed, on top of the space held back for future fields.
    assert_eq!(reserved - needed, RESERVE + 4 * MAX_SHARES);
  }

  #[test]
  fn the_space_reserved_is_the_space_the_account_needs() {
    let cases = [
      ("none", None),
      (
        "remote",
        Some(TransactionSourceV0::RemoteV0 {
          url: "https://hnt-rewards.oracle.helium.io/v1/tuktuk/asset/1".to_string(),
          signer: Pubkey::new_unique(),
        }),
      ),
      ("one instruction", Some(compiled(1, vec![]))),
      ("twenty instructions", Some(compiled(20, vec![]))),
      // Queuing is what holds a pre task to a shape, so init reserves space for one carrying
      // seed groups of any width even though such a fanout never reaches distribution.
      (
        "seed groups",
        Some(compiled(
          2,
          vec![
            vec![b"helium".to_vec(), vec![253]],
            vec![],
            vec![b"a".to_vec(), b"much-longer-seed".to_vec(), vec![1, 2, 3]],
          ],
        )),
      ),
    ];

    for (name, pre_task) in cases {
      let args = args(pre_task);
      let reserved = MiniFanoutV0::size(&args);
      let needed = 8
        + stored(&args)
          .try_to_vec()
          .expect("serialize the account")
          .len();

      assert!(
        reserved >= needed,
        "{name}: reserved {reserved} < needed {needed}"
      );
      assert_eq!(
        reserved - needed,
        RESERVE,
        "{name}: reserved {reserved}, needed {needed}"
      );
    }
  }
}
