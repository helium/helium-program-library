//! Temporary. Adds the owner's whole-wallet claim to an entity claim cron that was created
//! without one (blockchain-api `createAutomation` stopped adding it in PR #1200, and the wallet
//! app never added it after). Remove this instruction once the backfill has run.

use anchor_lang::prelude::*;
use shared_utils::{ORACLE_SIGNER, ORACLE_URL};
use tuktuk_program::cron::{
  accounts::CronJobV0,
  cpi::{accounts::AddCronTransactionV0, add_cron_transaction_v0},
  program::Cron,
  types::{AddCronTransactionArgsV0, TransactionSourceV0},
};

use crate::{error::ErrorCode, TESTING};

/// The only key that may run the backfill. It pays the rent of each claim it adds.
pub const BACKFILL_SIGNER: Pubkey = if TESTING {
  pubkey!("2mALLZMAHaGTVVmTaqMk9zjSZ2X7YiyUezWaEpVqg6ic")
} else {
  pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW")
};

#[derive(Accounts)]
pub struct BackfillEntityClaimWalletV0<'info> {
  #[account(mut, address = BACKFILL_SIGNER)]
  pub payer: Signer<'info>,
  /// CHECK: The cron's owner, bound to the cron by the authority's seeds and `has_one`
  pub wallet: AccountInfo<'info>,
  #[account(
    seeds = [b"entity_cron_authority", wallet.key().as_ref()],
    bump,
  )]
  /// CHECK: By seeds
  pub authority: AccountInfo<'info>,
  #[account(
    mut,
    has_one = authority,
    constraint = cron_job.next_transaction_id == 0 @ ErrorCode::CronJobHasClaims,
  )]
  pub cron_job: Box<Account<'info, CronJobV0>>,
  #[account(
    mut,
    seeds = [b"cron_job_transaction", cron_job.key().as_ref(), &0u32.to_le_bytes()[..]],
    bump,
    seeds::program = cron_program.key(),
  )]
  /// CHECK: Via CPI
  pub cron_job_transaction: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub cron_program: Program<'info, Cron>,
}

pub fn handler(ctx: Context<BackfillEntityClaimWalletV0>) -> Result<()> {
  add_cron_transaction_v0(
    CpiContext::new_with_signer(
      ctx.accounts.cron_program.to_account_info(),
      AddCronTransactionV0 {
        payer: ctx.accounts.payer.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        cron_job: ctx.accounts.cron_job.to_account_info(),
        cron_job_transaction: ctx.accounts.cron_job_transaction.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&[
        b"entity_cron_authority",
        ctx.accounts.wallet.key().as_ref(),
        &[ctx.bumps.authority],
      ]],
    ),
    AddCronTransactionArgsV0 {
      index: 0,
      transaction_source: TransactionSourceV0::RemoteV0 {
        url: format!(
          "{}/v1/tuktuk/wallet/{}",
          ORACLE_URL,
          ctx.accounts.wallet.key()
        ),
        signer: ORACLE_SIGNER,
      },
    },
  )?;
  Ok(())
}
