#!/bin/bash

./scripts/init-idls.sh

# create keypairs if they don't exist
KEYPAIRS=( 'dc.json' 'hnt.json' 'iot.json' 'mobile.json' 'oracle.json' )
for f in "${KEYPAIRS[@]}"; do
	if [ ! -f "./packages/helium-cli/keypairs/$f" ]; then
        echo "$f keypair doesn't exist, creating it"
        solana-keygen new -o ./packages/helium-cli/keypairs/$f -s
    fi
done 

# init the dao and subdaos
npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-dao.ts

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-subdao.ts \
    --name IOT --subdaoKeypair ./packages/helium-cli/keypairs/iot.json --startEpochRewards 100000

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-subdao.ts \
    --name MOBILE --subdaoKeypair ./packages/helium-cli/keypairs/mobile.json --startEpochRewards 100000

# save the keypairs as environment variables (used by other packages)
export DC_MINT=$(solana address -k ./packages/helium-cli/keypairs/dc.json)
export HNT_MINT=$(solana address -k ./packages/helium-cli/keypairs/hnt.json)
export IOT_MINT=$(solana address -k ./packages/helium-cli/keypairs/iot.json)
export MOBILE_MINT=$(solana address -k ./packages/helium-cli/keypairs/mobile.json)
export ORACLE_MINT=$(solana address -k ./packages/helium-cli/keypairs/oracle.json)