#!/bin/bash
set -e

PHOTON_DATA_DIR="/photon/photon_data"

# Download elasticsearch index
if [ ! -d "${PHOTON_DATA_DIR}/elasticsearch" ]; then
    # Let graphhopper know where the traffic is coming from
    USER_AGENT="docker: helium/photon-geocoder"
    echo "Downloading search index..."
    wget --user-agent="$USER_AGENT" -O - http://download1.graphhopper.com/public/photon-db-latest.tar.bz2 | pbzip2 -cd | tar x
fi

# Start photon if elastic index exists
if [ -d "/photon/photon_data/elasticsearch" ]; then
    echo "Starting photon service..."
    java -jar photon.jar $@
else
    echo "Could not start photon, the search index could not be found"
fi