#!/bin/bash
### USAGE: './init-idls.sh' will init the idls on localnet. './init-idls.sh <cluster>' will init the idls on <cluster>

anchor idl init 1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w --filepath target/idl/lazy_distributor.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR --filepath target/idl/helium_sub_daos.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT --filepath target/idl/data_credits.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g --filepath target/idl/circuit_breaker.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8 --filepath target/idl/helium_entity_manager.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5 --filepath target/idl/treasury_management.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init 1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h --filepath target/idl/lazy_transactions.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS --filepath target/idl/price_oracle.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8 --filepath target/idl/voter_stake_registry.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json

