#!/bin/bash

CLUSTER=$1

if [ "$CLUSTER" == "mainnet" ]; then
    CLUSTER_URL='https://api.mainnet-beta.solana.com'    
elif [ "$CLUSTER" == "devnet" ]; then
    CLUSTER_URL='https://api.devnet.solana.com'
else
    CLUSTER_URL='http://127.0.0.1:8899'
fi

npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/update-dao.ts \
    --hntMint $(solana address -k packages/helium-admin-cli/keypairs/hnt.json) -u $CLUSTER_URL --newAuthority $2 --executeTransaction

npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/update-subdao.ts \
    --dntMint $(solana address -k packages/helium-admin-cli/keypairs/mobile.json) -u $CLUSTER_URL --newAuthority $2 --name MOBILE --executeTransaction

npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/update-subdao.ts \
    --dntMint $(solana address -k packages/helium-admin-cli/keypairs/iot.json) -u $CLUSTER_URL --newAuthority $2 --name IOT --executeTransaction
