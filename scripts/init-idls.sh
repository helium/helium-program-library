#!/bin/bash
### USAGE: './init-idls.sh' will init the idls on localnet. './init-idls.sh <cluster>' will init the idls on <cluster>


anchor idl init fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6 --filepath target/idl/fanout.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init 1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w --filepath target/idl/lazy_distributor.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR --filepath target/idl/helium_sub_daos.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT --filepath target/idl/data_credits.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g --filepath target/idl/circuit_breaker.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8 --filepath target/idl/helium_entity_manager.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5 --filepath target/idl/treasury_management.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init 1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h --filepath target/idl/lazy_transactions.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy --filepath target/idl/price_oracle.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8 --filepath target/idl/voter_stake_registry.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF --filepath target/idl/rewards_oracle.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &
anchor idl init memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr --filepath target/idl/mobile_entity_manager.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json &

# Wait for all idls to complete
wait
