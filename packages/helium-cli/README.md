First, brick the genesis transactions. This keeps someone from front-running the genesis transaction lazy signer.

Next, make sure startUnixTime in the emissions schedules is equal to the current time.


```
npx ts-node --project tsconfig.cjs.json src/create-dao.ts -u https://api.devnet.solana.com --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium" --emissionSchedulePath emissions/hnt.json --hstEmissionSchedulePath emissions/hst.json

npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com --rewardsOracleUrl https://iot-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://iot-rewards.oracle.helium.io/active-devices -n IOT --subdaoKeypair keypairs/iot.json --numTokens 100302580998  --emissionSchedulePath emissions/iot.json --realmName "Helium IOT" --dcBurnAuthority $(solana address) --executeProposal --switchboardNetwork devnet

 npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com --rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://mobile-rewards.oracle.helium.io/active-devices -n Mobile --subdaoKeypair keypairs/mobile.json --numTokens 100302580998 --emissionSchedulePath emissions/iot.json --realmName "Helium Mobile" --dcBurnAuthority $(solana address) --executeProposal --switchboardNetwork devnet
```
Now, go approve and run all commands in realms.

Now create iot makers:

```

npx ts-node --project tsconfig.cjs.json src/create-maker.ts -u https://api.devnet.solana.com --symbol IOT --subdaoMint $(solana address -k keypairs/iot.json) --fromFile makers.json --executeProposal

```

Next, create mobile makers:

```
npx ts-node --project tsconfig.cjs.json src/create-maker.ts -u https://api.devnet.solana.com --symbol MOBILE --subdaoMint $(solana address -k keypairs/mobile.json) --fromFile makers-mobile.json --executeProposal
```

Now, fund any maker wallets

```
npx ts-node --project tsconfig.cjs.json src/mint-dc.ts -u https://api.devnet.solana.com --destination maker_address --numHnt 10000 --dcKey $(solana address -k keypairs/dc.json)

# If needed, fund the maker wallet
solana transfer -u devnet maker_address 1 --allow-unfunded-recipient 
```

Now, go approve and run maker create in realms

Now,migrate to a `-n` that nobody knows you're using. This will ensure nobody can frontrun

```
 cd ../migration-service

node --max_old_space_size=16000 lib/cjs/gen-transactions.js --mobile $(solana address -k ../helium-cli/keypairs/mobile.json) --hnt $(solana address -k ../helium-cli/keypairs/hnt.json) --dc $(solana address -k ../helium-cli/keypairs/dc.json) --iot $(solana address -k ../helium-cli/keypairs/iot.json) --hst $(solana address -k ../helium-cli/keypairs/hst.json) -n devnethelium -u http://127.0.0.1:8899 --payer $(solana address) --pgPort 5432 --pgDatabase migration --makers ../helium-cli/makers.json -p
```

At this point, go and update all lazy signers with the value from -n (ie devnethelium), and unbrick the genesis endpoints.

Must also then go update all state in the cluster

Now, dump the local migration db and port it to the prod db:

```
ssh -i ~/bastion -L localhost:5433:oracle-rds.cf49lv1xslmw.us-east-1.rds.amazonaws.com:5432 ubuntu@52.5.106.80
```

```
docker run -e PGPASSWORD=postgres postgres:latest pg_dump -h host.docker.internal -U postgres migration > ~/devnet-dump.sql
```

```
 psql -U web_admin -p 5433 -h localhost -d migration -f ~/devnet-dump.sql -W
 ```

You must also populate the iot and mobile metadata databases. Switch the port forward to the oracle db. Then:

```
$: cd ../hotspot-data-sink
$: env ANCHOR_WALLET=/path/to/.config/solana/id.json yarn run seed-db -f ../migration-service/export.json
```


Make sure to mint an epoch of IOT/MOBILE and put in rewards pool

