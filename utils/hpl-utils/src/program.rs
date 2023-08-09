use lazy_static;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

lazy_static::lazy_static! {
  pub static ref LD_PID: Pubkey = Pubkey::from_str("mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6").unwrap(); // Lazy Distributor
  pub static ref HSD_PID: Pubkey = Pubkey::from_str("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR").unwrap(); // Helium Sub Daos
  pub static ref DC_PID: Pubkey = Pubkey::from_str("7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm").unwrap(); // Data Credits
  pub static ref HEM_PID: Pubkey = Pubkey::from_str("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8").unwrap(); // Helium Entity Manager
  pub static ref CB_PID: Pubkey = Pubkey::from_str("circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g").unwrap(); // Circuit Breaker
  pub static ref TM_PID: Pubkey = Pubkey::from_str("treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5").unwrap(); // Treasury Management
  pub static ref LT_PID: Pubkey = Pubkey::from_str("1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h").unwrap(); // Lazy Transactions
  pub static ref PO_PID: Pubkey = Pubkey::from_str("porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy").unwrap(); // Price Oracle
  pub static ref RO_PID: Pubkey = Pubkey::from_str("rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF").unwrap(); // Rewards Oracle
  pub static ref VSR_PID: Pubkey = Pubkey::from_str("hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8").unwrap(); // Voter Stake Registry
  pub static ref FO_PID: Pubkey = Pubkey::from_str("fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6").unwrap(); // Fanout
  pub static ref MEM_PID: Pubkey = Pubkey::from_str("memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr").unwrap(); // Mobile Entity Manager
}
