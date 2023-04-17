#!/bin/bash

docker run -v $(pwd)/migration-docker/data:/data \
           -e SOLANA_URL=http://127.0.0.1:8899 \
           -e AWS_REGION=us-east-1 \
           -e S3_BUCKET=helium-migration \
           -e S3_ENDPOINT=http://host.docker.internal:9000 \
           -e MULTISIG=BBhoCZSUJH8iiXHT5aP6GVbhnX2iY2vWR1BAsuYm7ZUm \
           -e MOBILE_DC_BURN_AUTHORITY=pverYDx5LZx3cmBsdJSJtgPFHpTrZkSac1zRg4XKb46 \
           -e IOT_DC_BURN_AUTHORITY=pverYDx5LZx3cmBsdJSJtgPFHpTrZkSac1zRg4XKb46 \
           -e NETWORK=devnet \
           -e LAZY_NAME=testdocker1 \
           -e PGHOST=host.docker.internal \
           -e PGPORT=5432 \
           -e PGDATABASE=test_migration \
           -e PGPASSWORD=postgres \
           -e PGUSER=postgres \
           -e AWS_ACCESS_KEY_ID=minioadmin \
           -e AWS_SECRET_ACCESS_KEY=minioadmin \
           -e GPG_KEY=/data/migration.gpg \
           -e ADMIN_KEYPAIR=devnet-admin.json \
           -e ORACLE_QUEUE=uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX \
           -e ORACLE_CRANK=UcrnK4w2HXCEjY8z6TcQ9tysYr3c9VcFLdYAU9YQP5e \
           -e ORACLE_BUF=dBuf3CaQVKQftGPs6B2emKfAGewtGSTKUYqbv5sqf8h \
           -e SB_STATE=CyZuD7RPDcrqCGbNvLCyqk6Py9cEZTKmNKujfPi3ynDd \
           -e VALIDATOR_HEARTBEAT_THRESHOLD=0 \
           -e ORACLE_SOL=10 \
           -p 8899:8899 \
           -p 8900:8900 \
           -p 1027:1027 \
           -e GPG_PASSWORD=foo \
           -it \
           -m 18g \
           -c 2 \
           --rm \
           --name migration \
           migration:latest

