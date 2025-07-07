use anchor_lang::prelude::*;
use shared_utils::{ORACLE_SIGNER, ORACLE_URL};
use tuktuk_program::cron::{
  accounts::CronJobV0,
  cpi::{accounts::AddCronTransactionV0, add_cron_transaction_v0},
  program::Cron,
  types::{AddCronTransactionArgsV0, TransactionSourceV0},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AddWalletToEntityCronArgsV0 {
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: AddWalletToEntityCronArgsV0)]
pub struct AddWalletToEntityCronV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub user_authority: Signer<'info>,
  /// CHECK: None needed
  pub wallet: AccountInfo<'info>,
  #[account(
    seeds = [b"entity_cron_authority", user_authority.key().as_ref()],
    bump,
  )]
  /// CHECK: By seeds
  pub authority: AccountInfo<'info>,
  #[account(mut, has_one = authority)]
  pub cron_job: Box<Account<'info, CronJobV0>>,
  #[account(
    mut,
    seeds = [b"cron_job_transaction", cron_job.key().as_ref(), &args.index.to_le_bytes()[..]],
    bump,
    seeds::program = cron_program.key(),
  )]
  /// CHECK: Via CPI
  pub cron_job_transaction: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub cron_program: Program<'info, Cron>,
}

pub fn handler(
  ctx: Context<AddWalletToEntityCronV0>,
  args: AddWalletToEntityCronArgsV0,
) -> Result<()> {
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
        ctx.accounts.user_authority.key().as_ref(),
        &[ctx.bumps.authority],
      ]],
    ),
    AddCronTransactionArgsV0 {
      index: args.index,
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
