#!/bin/bash

set -e

AGGREGATOR=$(solana address -k keypairs/mobile-device-aggregator.json)
QUEUE="F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy"
CRANK="85L2cFUvXaeGQ4HrzP8RJEVCL7WvRrXM2msvEmQ82AVr"
KEYPAIR=~/.config/solana/id.json

echo "Using aggregator $AGGREGATOR"

sbv2 solana aggregator create \
        --enable \
        --minJobs 1 \
        --minOracles 2 \
        --batchSize 3 \
        --updateInterval 3600 \
        -k $KEYPAIR \
        --aggregatorKeypair ./keypairs/mobile-device-aggregator.json \
        $QUEUE

sbv2 solana aggregator add history $AGGREGATOR 72 -k $KEYPAIR

spl-token unwrap -u devnet
spl-token wrap 1 -u devnet
sbv2 solana aggregator lease create --amount=1 $AGGREGATOR -k $KEYPAIR

sbv2 solana job create ./jobs/mobile-device.json -k $KEYPAIR
sbv2 solana aggregator add job $AGGREGATOR -k $KEYPAIR --jobDefinition ./jobs/mobile-device.json

sbv2 solana crank add aggregator $CRANK $AGGREGATOR -k $KEYPAIR