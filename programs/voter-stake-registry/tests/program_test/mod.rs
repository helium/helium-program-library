use log::*;
use std::cell::RefCell;
use std::{str::FromStr, sync::Arc, sync::RwLock};

use solana_program::{program_option::COption, program_pack::Pack};
use solana_program_test::*;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};
use spl_token::{state::*, *};

pub use addin::*;
pub use cookies::*;
pub use governance::*;
pub use solana::*;
pub use utils::*;

pub mod addin;
pub mod cookies;
pub mod governance;
pub mod solana;
pub mod utils;

trait AddPacked {
    fn add_packable_account<T: Pack>(
        &mut self,
        pubkey: Pubkey,
        amount: u64,
        data: &T,
        owner: &Pubkey,
    );
}

impl AddPacked for ProgramTest {
    fn add_packable_account<T: Pack>(
        &mut self,
        pubkey: Pubkey,
        amount: u64,
        data: &T,
        owner: &Pubkey,
    ) {
        let mut account = solana_sdk::account::Account::new(amount, T::get_packed_len(), owner);
        data.pack_into_slice(&mut account.data);
        self.add_account(pubkey, account);
    }
}

#[derive(Default, Clone)]
pub struct ProgramOutput {
    pub logs: Vec<String>,
    pub data: Vec<String>,
}
struct LoggerWrapper {
    inner: env_logger::Logger,
    output: Arc<RwLock<ProgramOutput>>,
}

impl Log for LoggerWrapper {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        self.inner.enabled(metadata)
    }

    fn log(&self, record: &log::Record) {
        if record
            .target()
            .starts_with("solana_runtime::message_processor")
        {
            let msg = record.args().to_string();
            if let Some(data) = msg.strip_prefix("Program log: ") {
                self.output.write().unwrap().logs.push(data.into());
            } else if let Some(data) = msg.strip_prefix("Program data: ") {
                self.output.write().unwrap().data.push(data.into());
            }
        }
        self.inner.log(record);
    }

    fn flush(&self) {}
}

pub struct TestContext {
    pub solana: Arc<SolanaCookie>,
    pub governance: GovernanceCookie,
    pub addin: AddinCookie,
    pub mints: Vec<MintCookie>,
    pub users: Vec<UserCookie>,
    pub quote_index: usize,
}

impl TestContext {
    pub async fn new() -> Self {
        // We need to intercept logs to capture program log output
        let log_filter = "solana_rbpf=trace,\
                    solana_runtime::message_processor=debug,\
                    solana_runtime::system_instruction_processor=trace,\
                    solana_program_test=info";
        let env_logger =
            env_logger::Builder::from_env(env_logger::Env::new().default_filter_or(log_filter))
                .format_timestamp_nanos()
                .build();
        let program_output = Arc::new(RwLock::new(ProgramOutput::default()));
        let _ = log::set_boxed_logger(Box::new(LoggerWrapper {
            inner: env_logger,
            output: program_output.clone(),
        }));

        let addin_program_id = voter_stake_registry::id();

        let mut test = ProgramTest::new(
            "voter_stake_registry",
            addin_program_id,
            processor!(voter_stake_registry::entry),
        );
        // intentionally set to half the limit, to catch potential problems early
        test.set_compute_max_units(120000);

        let governance_program_id =
            Pubkey::from_str(&"GovernanceProgramTest1111111111111111111111").unwrap();
        test.add_program(
            "spl_governance",
            governance_program_id,
            processor!(spl_governance::processor::process_instruction),
        );

        // Setup the environment

        // Mints
        let mut mints: Vec<MintCookie> = vec![
            MintCookie {
                index: 0,
                decimals: 6,
                unit: 10u64.pow(6) as f64,
                base_lot: 100 as f64,
                quote_lot: 10 as f64,
                pubkey: None, //Some(mngo_token::ID),
                authority: Keypair::new(),
            }, // symbol: "MNGO".to_string()
            MintCookie {
                index: 1,
                decimals: 6,
                unit: 10u64.pow(6) as f64,
                base_lot: 0 as f64,
                quote_lot: 0 as f64,
                pubkey: None,
                authority: Keypair::new(),
            }, // symbol: "USDC".to_string()
        ];
        // Add mints in loop
        for mint_index in 0..mints.len() {
            let mint_pk: Pubkey;
            if mints[mint_index].pubkey.is_none() {
                mint_pk = Pubkey::new_unique();
            } else {
                mint_pk = mints[mint_index].pubkey.unwrap();
            }

            test.add_packable_account(
                mint_pk,
                u32::MAX as u64,
                &Mint {
                    is_initialized: true,
                    mint_authority: COption::Some(mints[mint_index].authority.pubkey()),
                    decimals: mints[mint_index].decimals,
                    ..Mint::default()
                },
                &spl_token::id(),
            );
            mints[mint_index].pubkey = Some(mint_pk);
        }
        let quote_index = mints.len() - 1;

        // Users
        let num_users = 4;
        let mut users = Vec::new();
        for _ in 0..num_users {
            let user_key = Keypair::new();
            test.add_account(
                user_key.pubkey(),
                solana_sdk::account::Account::new(
                    u32::MAX as u64,
                    0,
                    &solana_sdk::system_program::id(),
                ),
            );

            // give every user 10^18 (< 2^60) of every token
            // ~~ 1 trillion in case of 6 decimals
            let mut token_accounts = Vec::new();
            for mint_index in 0..mints.len() {
                let token_key = Pubkey::new_unique();
                test.add_packable_account(
                    token_key,
                    u32::MAX as u64,
                    &spl_token::state::Account {
                        mint: mints[mint_index].pubkey.unwrap(),
                        owner: user_key.pubkey(),
                        amount: 1_000_000_000_000_000_000,
                        state: spl_token::state::AccountState::Initialized,
                        ..spl_token::state::Account::default()
                    },
                    &spl_token::id(),
                );

                token_accounts.push(token_key);
            }
            users.push(UserCookie {
                key: user_key,
                token_accounts,
            });
        }

        let mut context = test.start_with_context().await;
        let rent = context.banks_client.get_rent().await.unwrap();

        let solana = Arc::new(SolanaCookie {
            context: RefCell::new(context),
            rent,
            program_output: program_output.clone(),
        });

        TestContext {
            solana: solana.clone(),
            governance: GovernanceCookie {
                solana: solana.clone(),
                program_id: governance_program_id,
            },
            addin: AddinCookie {
                solana: solana.clone(),
                program_id: addin_program_id,
            },
            mints,
            users,
            quote_index,
        }
    }
}
