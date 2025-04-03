#!/bin/bash
set -e

DATA_DIR="/geocoder_service/data"

# Download elasticsearch index
if [ ! -d "${DATA_DIR}/elasticsearch" ]; then
    # Let graphhopper know where the traffic is coming from
    USER_AGENT="docker: helium/geocoder-service"
    echo "Downloading search index..."
    wget --user-agent="$USER_AGENT" -O - http://download1.graphhopper.com/public/photon-db-latest.tar.bz2 | pbzip2 -cd | tar x
fi

# Start photon if elastic index exists
if [ -d "${DATA_DIR}/elasticsearch" ]; then
    echo "Starting service..."
    java -jar photon.jar $@
else
    echo "Could not start service, the search index could not be found"
fi