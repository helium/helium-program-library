#!/bin/bash

set -e

AGGREGATOR=$(solana address -k keypairs/mobile-device-aggregator.json)
QUEUE="F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy"

echo "Using aggregator $AGGREGATOR"

sbv2 solana aggregator create \
        --enable \
        --minJobs 1 \
        --minOracles 2 \
        --batchSize 3 \
        --updateInterval 3600 \
        -k ~/.config/solana/id.json \
        --aggregatorKeypair ./keypairs/mobile-device-aggregator.json \
        $QUEUE


 sbv2 solana aggregator add history $AGGREGATOR 72 -k ~/.config/solana/id.json

 sbv2 solana aggregator add job $AGGREGATOR --jobDefinition ./jobs/mobile-device.json

#  sbv2 solana crank create -k ~/.config/solana/id.json 