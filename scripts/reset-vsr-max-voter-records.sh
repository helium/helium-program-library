#!/bin/bash

CLUSTER=$1

if [ "$CLUSTER" == "mainnet" ]; then
    CLUSTER_URL='https://api.mainnet-beta.solana.com'    
elif [ "$CLUSTER" == "devnet" ]; then
    CLUSTER_URL='https://api.devnet.solana.com'
else
    CLUSTER_URL='http://127.0.0.1:8899'
fi

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/reset-vsr-max-voter-record.ts \
    --mint $(solana address -k packages/helium-cli/keypairs/hnt.json) -u $CLUSTER_URL --resetDaoRecord --resetSubDaoRecord \
    --hntMint $(solana address -k packages/helium-cli/keypairs/hnt.json) --executeTransaction

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/reset-vsr-max-voter-record.ts \
    --dntMint $(solana address -k packages/helium-cli/keypairs/iot.json) -u $CLUSTER_URL --resetSubDaoRecord \
    --hntMint $(solana address -k packages/helium-cli/keypairs/hnt.json) --executeTransaction