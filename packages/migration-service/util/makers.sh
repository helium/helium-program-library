#!/bin/sh
#
# Generate a JSON array of all known Makers in the Helium ecosystem, be they
# currently approved to add Hotspots or not.
#
# Maker data is split across two sources:
#
# 1. The onboarding server records maker keys and their names.
# 2. The blockchain (via the API server) holds maker keys and their states.
#
ONBOARDING_MAKERS="$( curl https://onboarding.dewi.org/api/v2/makers )"
CHAIN_MAKERS="$( curl -H 'User-Agent: not-curl/really' https://api.helium.io/v1/vars )"

(echo "$ONBOARDING_MAKERS"; echo "$CHAIN_MAKERS") | jq --slurp \
	'[(.[0].data[]|{id: .id, name: .name, address: .address}),(.[1].data.staking_keys[]|{address: ., staked: true})]|group_by(.address)|[(.[]|.[0] + .[1])]'
