# @helium/helium-admin-cli

CLI used to bootstrap and maintain the Helium network on Solana. Scripts under `src/` create/update DAOs, sub-DAOs, makers, maker approvals, price oracles, entity-manager state, lazy-distributors, treasury-management configs, migration state, welcome packs, etc.

Each script is a separate yargs entrypoint; run them via `pnpm ts-node src/<script>.ts --help` to see the script-specific flags. Writes are done through a Squads multisig in production, so most scripts output a transaction file to be executed out-of-band rather than sending directly.

## Multisig

Most endpoints have optional parameters that allow you to use a squads v4 multisig to run these transactions. In the case you pass --multisig, and are using a valid proposer key, it will propose the admin action to squads v4.

## VeHNT Correction

Every now and then, on-chain vehnt can diverge from what is expected from our off-chain postgres. On-the-fly vehnt tracking on-chain is very difficult, especially with landrush bonuses, and so there are very likely a few bugs left over. A divergence from expected vs on-chain can affect the percent-wise distribution of rewards to IOT vs MOBILE, so it is important that those divergences get rectified. Often they correct within a day, if they do not the protocol is to:

### 1. Run account-postgres-sink locally.

Use a .env pointing to account-postgres-sink-service/vote_service_example.yaml as the config, and mainnet as the URL, with refresh on boot set to false (so you don't end up indexing a ton of unnecessary data).

### 2. Refresh the related accounts (vsr and helium-sub-daos)

http://localhost:3001/refresh-accounts?program=hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR&password=<YOUR_PASSWORD>
http://localhost:3001/refresh-accounts?program=hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8&password=<YOUR_PASSWORD>

### 3. Run the update-subdao-vehnt

```bash
helium-admin update-subdao-vehnt -u <SOLANA_URL> -n MOBILE --multisig <MULTISIG> --pgPassword postgres --pgDatabse postgres --dntMint mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6
```

### 4. Multisig approvers sign and execute

Multisig approvers should quickly review the transaction and execute it. If it takes too long to execute, there is a small risk that a user delegated or undelegated in that timeframe causing the numbers to be stale. Practically, this does not happen very often so you should favor security over speed.

## Migration quick-reference

A few days before a migration, the encrypted keypair bundle needs to be prepared via [`migration-docker`](../../migration-docker):

```sh
docker build -f migration-docker/Dockerfile . -t migration:latest
tar -cf keypairs.tar.gz keypairs
mv keypairs.tar.gz migration-docker/data/
./migration-docker/run-encrypt-keypairs.sh <PASSWORD>
```

Upload the resulting `migration.gpg` to the [`migration-service`](../migration-service) k8s secrets and the encrypted keypairs to S3.

On migration day, upload `export.json`, `makers.json`, `makers-mobile.json` to S3 and merge the k8s PR. Seed the IoT and Mobile metadata databases via a port-forward to the oracle DB and then running the `hotspot-data-sink` seed command against `migration-service/export.json`.
