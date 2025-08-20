use anchor_lang::prelude::*;
use helium_entity_manager::KeyToAssetV0;
use shared_utils::{ORACLE_SIGNER, ORACLE_URL};
use tuktuk_program::{RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0};

#[derive(Accounts)]
pub struct RequeueEntityClaimV1<'info> {
  pub key_to_asset: Account<'info, KeyToAssetV0>,
  /// CHECK: Used in trace
  pub wallet: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RequeueEntityClaimV1>) -> Result<RunTaskReturnV0> {
  let description = format!("ld entity {}", ctx.accounts.wallet.key())
    .chars()
    .take(40)
    .collect::<String>();
  Ok(RunTaskReturnV0 {
    tasks: vec![TaskReturnV0 {
      trigger: TriggerV0::Now,
      transaction: TransactionSourceV0::RemoteV0 {
        url: format!(
          "{}/v1/tuktuk/kta/{}",
          ORACLE_URL,
          ctx.accounts.key_to_asset.key(),
        ),
        signer: ORACLE_SIGNER,
      },
      crank_reward: Some(20000),
      free_tasks: 0,
      description,
    }],
    accounts: vec![],
  })
}
