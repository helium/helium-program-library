use anchor_lang::prelude::*;
use solana_program::pubkey;

use crate::state::*;

const LD_HNT: Pubkey = pubkey!("6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq");
const HPROD: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");
const HELIUM_MOBILE_WALLET: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");

#[derive(Accounts)]
pub struct TempUpdateFreeSubscriberRecipient<'info> {
  #[account(
        address = HPROD
    )]
  pub authority: Signer<'info>,

  #[account(
        mut,
        constraint = recipient.lazy_distributor == LD_HNT
    )]
  pub recipient: Box<Account<'info, RecipientV0>>,
}

pub fn handler(ctx: Context<TempUpdateFreeSubscriberRecipient>) -> Result<()> {
  ctx.accounts.recipient.destination = HELIUM_MOBILE_WALLET;

  Ok(())
}
