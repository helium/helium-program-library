#!/bin/bash
set -e
anchor idl init Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS --filepath target/idl/lazy_distributor.json --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
anchor idl init daoK94GYdvRjVxkSyTxNLxtAEYZohLJqmwad8pBK261 --filepath target/idl/helium_sub_daos.json --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
anchor idl init 5BAQuzGE1z8CTcrSdfbfdBF2fdXrwb4iMcxDMrvhz8L8 --filepath target/idl/data_credits.json --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
anchor idl init circcmKGcSE61r768bFtD1GkG3x6qfEE1GD2PgwA6C3 --filepath target/idl/circuit_breaker.json --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
anchor idl init 8DV471AvMNBCDTPoa2gzffrYFEJmDU56GDgTBv48RBZR --filepath target/idl/hotspot_issuance.json --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
anchor idl init treaRzaa4b98D1NQMQdQXzBupbgWhyJ2e1pXhJzkTwU --filepath target/idl/treasury_management.json --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
