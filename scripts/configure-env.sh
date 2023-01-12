#!/bin/bash
# Usage: '. ./scripts/configure-env.sh'
# configure the environment variables for the current terminal (used by packages)
export DC_MINT=$(solana address -k ./packages/helium-cli/keypairs/dc.json)
export HNT_MINT=$(solana address -k ./packages/helium-cli/keypairs/hnt.json)
export IOT_MINT=$(solana address -k ./packages/helium-cli/keypairs/iot.json)
export MOBILE_MINT=$(solana address -k ./packages/helium-cli/keypairs/mobile.json)
export ORACLE_MINT=$(solana address -k ./packages/helium-cli/keypairs/oracle.json)