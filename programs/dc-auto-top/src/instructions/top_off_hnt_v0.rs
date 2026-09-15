use anchor_lang::{
  prelude::*,
  solana_program::sysvar::instructions::{get_instruction_relative, ID as IX_ID},
};
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use tuktuk_dca::{
  cpi::{
    accounts::InitializeDcaNestedV0 as InitializeDcaNestedV0Accounts, initialize_dca_nested_v0,
  },
  program::TuktukDca,
  state::DcaV0,
  InitializeDcaArgsV0,
};
use tuktuk_program::{tuktuk, RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0};

use crate::{
  auto_top_off_seeds, errors::ErrorCode, free_task_key, get_next_time, get_task_ix_hnt, state::*,
  HNT_PRICE_ORACLE,
};

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(Accounts)]
pub struct TopOffHntV0<'info> {
  #[account(
    mut,
    has_one = task_queue,
    has_one = hnt_account,
    has_one = dca_mint,
    has_one = dca_mint_account,
    has_one = dca_input_price_oracle,
    has_one = hnt_mint,
  )]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
  /// CHECK: This account takes a ton of memory. Instead of loading it into memory, just pull the min_crank_reward directly.
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,

  #[account(mut)]
  pub hnt_account: Box<Account<'info, TokenAccount>>,

  /// CHECK: By has_one and cpi. Not parsing here because this call runs out of memory.
  pub hnt_mint: UncheckedAccount<'info>,

  // DCA-related accounts
  pub dca_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dca_mint_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Checked by loading with pyth
  #[account(
    constraint = dca_input_price_oracle.verification_level == VerificationLevel::Full @ ErrorCode::PythPriceNotFound,
  )]
  pub dca_input_price_oracle: Account<'info, PriceUpdateV2>,
  /// The feed the DCA prices HNT against, pinned to the same address the task this run
  /// executes was compiled with.
  #[account(
    address = HNT_PRICE_ORACLE,
    constraint = hnt_price_oracle.verification_level == VerificationLevel::Full @ ErrorCode::PythPriceNotFound,
  )]
  pub hnt_price_oracle: Account<'info, PriceUpdateV2>,
  /// CHECK: DCA account, may or may not exist
  #[account(mut)]
  pub dca: UncheckedAccount<'info>,
  /// CHECK: DCA input account
  #[account(mut)]
  pub dca_input_account: UncheckedAccount<'info>,
  /// CHECK: The DCA buys HNT for the top-off, so its output lands in the top-off's own HNT account.
  #[account(
    mut,
    constraint = dca_destination_token_account.key() == hnt_account.key() @ ErrorCode::InvalidDcaDestination,
  )]
  pub dca_destination_token_account: UncheckedAccount<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub tuktuk_dca_program: Program<'info, TuktukDca>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  /// The Instruction Sysvar has not been implemented
  /// in the Anchor framework yet, so this is the safe approach.
  #[account(address = IX_ID)]
  pub instruction_sysvar: AccountInfo<'info>,
  /// The task queue's own DCA swap payer: it funds the DCA's rent and is refunded when the DCA
  /// closes, so it is the only account allowed to pay that rent here.
  #[account(
    mut,
    seeds = [b"custom", task_queue.key().as_ref(), b"dca_swap_payer"],
    bump,
    seeds::program = tuktuk::ID,
  )]
  pub dca_custom_signer: Signer<'info>,
}

pub fn verify_running_in_tuktuk(
  instruction_sysvar: AccountInfo,
  task_id: Pubkey,
) -> Result<Vec<u16>> {
  // Validate that this instruction is being called via CPI from tuktuk for the next_task
  let current_ix = get_instruction_relative(0, &instruction_sysvar)
    .map_err(|_| error!(ErrorCode::InvalidCpiContext))?;

  // Check that the current instruction is being called by tuktuk program
  require_eq!(
    current_ix.program_id,
    tuktuk::ID,
    ErrorCode::InvalidCpiContext
  );

  // Check that the instruction being called is run_task_v0 by verifying the discriminator
  // The discriminator for run_task_v0 is the first 8 bytes of SHA256("global:run_task_v0")
  const RUN_TASK_V0_DISCRIMINATOR: [u8; 8] = [0x34, 0xb8, 0x27, 0x81, 0x7e, 0xf5, 0xb0, 0xed];
  require!(current_ix.data.len() >= 8, ErrorCode::InvalidCpiContext);
  require!(
    current_ix.data[0..8] == RUN_TASK_V0_DISCRIMINATOR,
    ErrorCode::InvalidCpiContext
  );

  // Verify that the next_task account matches the task being executed
  // The task account is the fourth account run_task_v0 names.
  require_gt!(current_ix.accounts.len(), 3, ErrorCode::InvalidCpiContext);
  require_eq!(
    current_ix.accounts[3].pubkey,
    task_id,
    ErrorCode::InvalidCpiContext
  );

  // tuktuk appends one account per free task id after the accounts the task itself names, and
  // these ids are what those appended accounts are checked against.
  Vec::<u16>::try_from_slice(&current_ix.data[8..])
    .map_err(|_| error!(ErrorCode::InvalidCpiContext))
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, TopOffHntV0<'info>>,
) -> Result<RunTaskReturnV0> {
  let auto_top_off_key = ctx.accounts.auto_top_off.key();
  let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;
  let free_task_ids = verify_running_in_tuktuk(
    ctx.accounts.instruction_sysvar.to_account_info(),
    auto_top_off.next_hnt_task,
  )?;
  // The address in `next_hnt_task` is a task queue slot, and a slot is reusable once the task it
  // held is gone. The recorded time is what makes the leg run on its own schedule: it is due once,
  // and the reschedule below moves it to the next slot.
  let now = Clock::get()?.unix_timestamp;
  require_gte!(now, auto_top_off.next_hnt_task_time, ErrorCode::TaskNotDue);
  let task_queue_key = ctx.accounts.task_queue.key();
  let dca_free_task = free_task_key(&task_queue_key, &free_task_ids, 1)?;
  require_keys_eq!(
    ctx.remaining_accounts[0].key(),
    free_task_key(&task_queue_key, &free_task_ids, 0)?,
    ErrorCode::InvalidFreeTask
  );
  require_keys_eq!(
    ctx.remaining_accounts[1].key(),
    dca_free_task,
    ErrorCode::InvalidFreeTask
  );
  auto_top_off.next_hnt_task = ctx.remaining_accounts[0].key();
  // HNT always 5 minutes after the DC. The schedule is not touched between here and the task
  // returned at the end, which carries this same time as its trigger.
  let next_time = get_next_time(&auto_top_off)? + if TESTING { 0 } else { 5 * 60 };
  auto_top_off.next_hnt_task_time = next_time;

  // Switch to immutable borrow so we can cpi
  drop(auto_top_off);
  let auto_top_off = ctx.accounts.auto_top_off.load()?;

  // Remaining accounts, both checked above against the run's own free task ids:
  // [0] = next_hnt_task (for HNT topoff)
  // [1] = the task the DCA is initialized into, when one is started

  // Check if we need to start a DCA to maintain HNT threshold
  let mut dca_tasks = vec![];
  let hnt_balance = ctx.accounts.hnt_account.amount;
  let needs_dca = auto_top_off.hnt_threshold > 0 && hnt_balance < auto_top_off.hnt_threshold;

  // Calculate the actual number of free tasks we're using for this call
  // - 1 free task for the HNT topoff task
  // - dca_tasks.len() for any DCA tasks (0 or 1)
  let num_tasks_used = 1u64 + if needs_dca { 1 } else { 0 };

  // Pay min crank reward to task_queue from auto_top_off, if available
  // descriminator + tuktuk_config + id + update_authority + reserved
  let crank_reward_offset = 8 + 32 + 4 + 32 + 32;
  let min_crank_reward = u64::from_le_bytes(
    ctx.accounts.task_queue.data.borrow()[crank_reward_offset..(crank_reward_offset + 8)]
      .try_into()
      .unwrap(),
  );
  let total_crank_reward = min_crank_reward
    .checked_mul(num_tasks_used)
    .ok_or(ErrorCode::ArithmeticError)?;

  let auto_top_off_info = ctx.accounts.auto_top_off.to_account_info();
  let min_rent_exempt = Rent::get()?.minimum_balance(auto_top_off_info.data_len());
  if auto_top_off_info.lamports().saturating_sub(min_rent_exempt) >= total_crank_reward {
    auto_top_off_info.sub_lamports(total_crank_reward)?;
    ctx.accounts.task_queue.add_lamports(total_crank_reward)?;
  } else {
    // The immutable borrow taken above is still live here; load_mut would fail on it and
    // return AccountBorrowFailed instead of marking the leg unscheduled.
    drop(auto_top_off);
    let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;
    auto_top_off.next_hnt_task = auto_top_off_key;
    drop(auto_top_off);
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }

  let delegated_data_credits = auto_top_off.delegated_data_credits;
  let authority = auto_top_off.authority;
  let bump = auto_top_off.bump;
  let seeds: &[&[&[u8]]] = &[auto_top_off_seeds!(delegated_data_credits, authority, bump)];

  if needs_dca {
    // Calculate how much HNT we need
    let hnt_needed = auto_top_off
      .hnt_threshold
      .checked_sub(hnt_balance)
      .ok_or(ErrorCode::ArithmeticError)?;

    // Calculate number of orders needed by first determining how much HNT we get per swap
    // based on oracle prices, then dividing hnt_needed by that amount
    let num_orders = if auto_top_off.dca_swap_amount > 0 {
      // Get oracle prices to calculate expected HNT output per swap
      let input_price_message = ctx.accounts.dca_input_price_oracle.price_message;
      let output_price_message = ctx.accounts.hnt_price_oracle.price_message;

      // Verify prices are not older than 5 minutes
      require_gte!(
        input_price_message.publish_time,
        now.saturating_sub(if TESTING { 6000000 } else { 5 * 60 }.into()),
        ErrorCode::PythPriceNotFound
      );
      require_gte!(
        output_price_message.publish_time,
        now.saturating_sub(if TESTING { 6000000 } else { 5 * 60 }.into()),
        ErrorCode::PythPriceNotFound
      );

      let input_price = input_price_message.price;
      let output_price = output_price_message.price;
      let expo_diff = input_price_message.exponent - output_price_message.exponent;

      // Check that prices are > 0
      require_gt!(input_price, 0, ErrorCode::PythPriceNotFound);
      require_gt!(output_price, 0, ErrorCode::PythPriceNotFound);

      // Calculate expected HNT output per swap: dca_swap_amount * (input_price / output_price)
      let hnt_per_swap = match expo_diff.cmp(&0) {
        std::cmp::Ordering::Greater => auto_top_off
          .dca_swap_amount
          .checked_mul(input_price as u64)
          .ok_or(ErrorCode::ArithmeticError)?
          .checked_mul(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
          .ok_or(ErrorCode::ArithmeticError)?
          .checked_div(output_price as u64)
          .ok_or(ErrorCode::ArithmeticError)?,
        std::cmp::Ordering::Less => auto_top_off
          .dca_swap_amount
          .checked_mul(input_price as u64)
          .ok_or(ErrorCode::ArithmeticError)?
          .checked_div(output_price as u64)
          .ok_or(ErrorCode::ArithmeticError)?
          .checked_div(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
          .ok_or(ErrorCode::ArithmeticError)?,
        std::cmp::Ordering::Equal => auto_top_off
          .dca_swap_amount
          .checked_mul(input_price as u64)
          .ok_or(ErrorCode::ArithmeticError)?
          .checked_div(output_price as u64)
          .ok_or(ErrorCode::ArithmeticError)?,
      };

      // Convert HNT per swap to HNT decimals from DCA decimals
      let hnt_per_swap_hnt_decimals = match ctx.accounts.dca_mint.decimals.cmp(&8u8) {
        std::cmp::Ordering::Greater => hnt_per_swap
          .checked_div(10_u64.pow(u32::from(ctx.accounts.dca_mint.decimals - 8)))
          .ok_or(ErrorCode::ArithmeticError)?,
        std::cmp::Ordering::Less => hnt_per_swap
          .checked_mul(10_u64.pow(u32::from(8 - ctx.accounts.dca_mint.decimals)))
          .ok_or(ErrorCode::ArithmeticError)?,
        std::cmp::Ordering::Equal => hnt_per_swap,
      };

      msg!("hnt_per_swap: {}", hnt_per_swap_hnt_decimals);

      // Now calculate number of orders needed using ceiling division
      if hnt_per_swap_hnt_decimals > 0 {
        hnt_needed.div_ceil(hnt_per_swap_hnt_decimals)
      } else {
        0
      }
    } else {
      0
    };

    let dca_url_raw = String::from_utf8(auto_top_off.dca_url.to_vec()).unwrap();
    let dca_url = dca_url_raw.replace("\0", "");

    if num_orders > 0 {
      let swap_amount_per_order = auto_top_off.dca_swap_amount;
      let interval_seconds = auto_top_off.dca_interval_seconds;
      let dca_signer = auto_top_off.dca_signer;
      let dca_index = auto_top_off.dca_index;
      drop(auto_top_off);

      // Calculate rent needed for DCA account and associated token account
      let dca_space = 8 + std::mem::size_of::<DcaV0>() + 64 + dca_url.len();
      let dca_rent = Rent::get()?.minimum_balance(dca_space);

      // Calculate rent for associated token account (165 bytes)
      let ata_rent = Rent::get()?.minimum_balance(165);

      let total_rent = dca_rent + ata_rent;
      let rent_needed = total_rent.saturating_sub(ctx.accounts.dca_custom_signer.lamports());

      // Rent is all-or-nothing, so it is checked rather than debited: debiting past the
      // account's own rent exemption reverts the run, and a reverted run never reschedules,
      // so a shortfall would stop the leg rather than skip a day.
      //
      // A DCA refunds its rent to the custom signer when it drains and closes, so in steady
      // state rent_needed is 0. An abandoned DCA never refunds, so each replacement draws
      // fresh rent from here.
      let spendable = auto_top_off_info.lamports().saturating_sub(min_rent_exempt);
      let rent_ok = spendable >= rent_needed;
      if !rent_ok {
        msg!(
          "Skipping DCA: needs {} lamports rent, {} available above rent exemption",
          rent_needed,
          spendable
        );
      }

      // The run buys the part of the gap it can pay for now and finish before the next run:
      // the whole gap when the balance and the slot both cover it, and the largest prefix of
      // it otherwise. `initialize_dca_nested_v0` moves the whole order count's input up front,
      // so the balance is the hard cap; the orders drain one interval apart, so a count whose
      // last order lands after the next run would still be running when that run opens its own
      // DCA.
      let affordable = ctx
        .accounts
        .dca_mint_account
        .amount
        .checked_div(swap_amount_per_order)
        .unwrap_or_default();
      let slot_seconds = u64::try_from(next_time.saturating_sub(now)).unwrap_or_default();
      // The first order fires now and the rest every interval, so the orders that finish
      // before the next run are the ceiling of the ratio, and one always fits.
      let within_slot = if interval_seconds == 0 {
        0
      } else {
        slot_seconds.div_ceil(interval_seconds)
      };
      // The count is a u32 on the wire, so anything past that is another ceiling on it.
      let orders = u32::try_from(num_orders.min(affordable).min(within_slot)).unwrap_or(u32::MAX);
      if orders == 0 {
        msg!(
          "Skipping DCA: {} dca_mint at {} per order buys no order inside {} seconds",
          ctx.accounts.dca_mint_account.amount,
          swap_amount_per_order,
          slot_seconds
        );
      }

      if rent_ok && orders > 0 {
        // Transfer SOL from auto_top_off to custom signer for DCA rent
        ctx.accounts.auto_top_off.sub_lamports(rent_needed)?;
        ctx.accounts.dca_custom_signer.add_lamports(rent_needed)?;

        msg!(
          "Initializing DCA with {} orders, swap amount per order: {}, interval seconds: {}",
          orders,
          swap_amount_per_order,
          interval_seconds
        );
        // Initialize new DCA using nested version (no tuktuk accounts needed)
        let dca_result = initialize_dca_nested_v0(
          CpiContext::new_with_signer(
            ctx.accounts.tuktuk_dca_program.to_account_info(),
            InitializeDcaNestedV0Accounts {
              core: tuktuk_dca::cpi::accounts::InitializeDcaCore {
                rent_payer: ctx.accounts.dca_custom_signer.to_account_info(),
                dca_payer: ctx.accounts.auto_top_off.to_account_info(),
                authority: ctx.accounts.auto_top_off.to_account_info(),
                dca: ctx.accounts.dca.to_account_info(),
                input_mint: ctx.accounts.dca_mint.to_account_info(),
                output_mint: ctx.accounts.hnt_mint.to_account_info(),
                destination_token_account: ctx
                  .accounts
                  .dca_destination_token_account
                  .to_account_info(),
                input_price_oracle: ctx.accounts.dca_input_price_oracle.to_account_info(),
                output_price_oracle: ctx.accounts.hnt_price_oracle.to_account_info(),
                input_account: ctx.accounts.dca_input_account.to_account_info(),
                dca_payer_account: ctx.accounts.dca_mint_account.to_account_info(),
                task_queue: ctx.accounts.task_queue.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
              },
              task: ctx.remaining_accounts[1].to_account_info(),
            },
            seeds,
          ),
          InitializeDcaArgsV0 {
            index: dca_index,
            num_orders: orders,
            swap_amount_per_order,
            interval_seconds,
            slippage_bps_from_oracle: 500, // 5% slippage
            task_id: 0,
            // This isn't actually used, since we're running in tuktuk it doesn't need to queue.
            dca_signer,
            dca_url,
          },
        )?;

        // Add DCA tasks to our task list
        dca_tasks.extend(dca_result.get().tasks);

        // Advance the slot before the next task is compiled below, so the next run targets a
        // fresh PDA whether or not this DCA drains and closes. `init` on an occupied PDA fails,
        // and that failure would take the no-reschedule path and stop the HNT leg.
        //
        // `dca` names the DCA this account is currently feeding. Nothing else advances it, so
        // leaving it behind would point it at a slot that has since closed or been abandoned.
        let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;
        auto_top_off.dca_index = dca_index.wrapping_add(1);
        auto_top_off.dca = ctx.accounts.dca.key();
      }
    }
  }

  // The crank reward above was sized for two tasks because a DCA was wanted. Every path that
  // wants one and does not start it returns only the topoff task, so the second reward is
  // returned rather than left with the queue: those are the paths taken when the account is
  // short of lamports or dca_mint, which is when it can least afford to leak either.
  if needs_dca && dca_tasks.is_empty() {
    ctx.accounts.task_queue.sub_lamports(min_crank_reward)?;
    auto_top_off_info.add_lamports(min_crank_reward)?;
  }

  // Schedule next HNT topoff task
  // Maximum possible free tasks for an HNT topoff call:
  // - 1 free task for the HNT topoff task
  // - 1 free task for potential DCA task
  // Total: 2 free tasks maximum
  const MAX_FREE_TASKS: u8 = 2;

  let auto_top_off = ctx.accounts.auto_top_off.load()?;
  let compiled_tx = get_task_ix_hnt(auto_top_off_key, &auto_top_off)?;

  let mut tasks = vec![TaskReturnV0 {
    trigger: TriggerV0::Timestamp(next_time),
    transaction: TransactionSourceV0::CompiledV0(compiled_tx),
    crank_reward: None,
    free_tasks: MAX_FREE_TASKS,
    description: format!("topoff hnt {}", &auto_top_off_key.to_string()[..(32 - 15)]),
  }];

  // Add DCA tasks
  tasks.extend(dca_tasks);

  Ok(RunTaskReturnV0 {
    tasks,
    accounts: vec![],
  })
}
