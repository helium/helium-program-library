# Migration

## A few days before migration

First, build the migration docker container.

```
docker build -f migration-docker/Dockerfile . -t migration:latest
```

Then, tar all keypairs:

```
tar -cf keypairs.tar.gz keypairs
mv keypairs.tar.gz migration-docker/data/
```

Then, use that container to encrypt all `keypairs` and generate a gpg key. This key will be output to ./migration-docker/data/migration.gpg

```
./migration-docker/run-encrypt-keypairs.sh <PASSWORD>
```

Upload the encrypted keypairs to s3. Have migration.gpg as a sealed secret on the migration container. As well as the password.

Push the container, and make a pull request on k8s for the deploy.

## Migration Day

Upload the export.json, makers.json, and makers-mobile.json files to the s3 bucket. Merge the k8s PR. Watch the export go

You must also populate the iot and mobile metadata databases. Port forward oracle db. Then:

```
$: cd ../hotspot-data-sink
$: env ANCHOR_WALLET=/path/to/.config/solana/id.json yarn run seed-db -f ../migration-service/export.json
```
