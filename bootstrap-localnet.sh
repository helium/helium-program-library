#!/bin/bash
set -e
anchor idl init Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS --filepath target/idl/lazy_distributor.json --provider.cluster localnet
anchor idl init daoK94GYdvRjVxkSyTxNLxtAEYZohLJqmwad8pBK261 --filepath target/idl/helium_sub_daos.json --provider.cluster localnet
anchor idl init 5BAQuzGE1z8CTcrSdfbfdBF2fdXrwb4iMcxDMrvhz8L8 --filepath target/idl/data_credits.json --provider.cluster localnet
