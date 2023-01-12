```
npx ts-node --project tsconfig.cjs.json src/create-dao.ts -u https://api.devnet.solana.com --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium Test5"

npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n IOT --subdaoKeypair keypairs/iot.json --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "Helium IOT Test5" --dcBurnAuthority $(solana address)

 npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com -rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n Mobile --subdaoKeypair keypairs/mobile.json --numTokens 100302580998 --startEpochRewards 66000000000 --realmName "Helium Mobile Test5" --dcBurnAuthority $(solana address)  --noHotspots
```
Now, go approve and run all commands in realms.

Now, create a maker. Note that this will need to be done for each maker.

```

npx ts-node --project tsconfig.cjs.json src/create-maker.ts -u http://127.0.0.1:8899 --symbol IOT --subdaoMint $(solana address -k keypairs/iot.json) --fromFile makers.json

```

Now, fund any maker wallets

```
npx ts-node --project tsconfig.cjs.json src/mint-dc.ts -u https://api.devnet.solana.com --destination maker_address --numHnt 10000 --dcKey $(solana address -k keypairs/dc.json)

# If needed, fund the maker wallet
solana transfer -u devnet maker_address 1 --allow-unfunded-recipient 
```

Now, go approve and run maker create in realms


```
 cd ../migration-service

 node --max_old_space_size=16000 lib/cjs/gen-transactions.js --mobile $(solana address -k ../helium-cli/keypairs/mobile.json) --hnt $(solana address -k ../helium-cli/keypairs/hnt.json) --dc $(solana address -k ../helium-cli/keypairs/dc.json) --iot $(solana address -k ../helium-cli/keypairs/iot.json) --hst $(solana address -k ../helium-cli/keypairs/hst.json) -n testhelium4 -u https://api.devnet.solana.com -p --payer $(solana address) --pgPort 5432 --pgDatabase migration
```

At this point, go and update all lazy signers with the value from -n (ie tessthelium4)

Must also then go update all state in the cluster