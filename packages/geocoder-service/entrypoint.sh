#!/bin/bash
set -e

DATA_DIR="/geocoder_service/data"
ES_INDEX_DIR="${DATA_DIR}/elasticsearch"
USER_AGENT="docker: helium/geocoder-service"
DOWNLOAD_URL="http://download1.graphhopper.com/public/photon-db-latest.tar.bz2"

# Download elasticsearch index
if [ ! -d "${ES_INDEX_DIR}" ]; then
    echo "Downloading search index..."
    if ! wget -q --show-progress --user-agent="${USER_AGENT}" -O - "${DOWNLOAD_URL}" | pbzip2 -cd | tar x; then
        echo "Error: Failed to download or extract the search index."
        exit 1
    fi

    # Verify the index was extracted properly
    if [ ! -d "${ES_INDEX_DIR}" ]; then
        echo "Error: Search index extraction failed."
        exit 1
    fi
fi

# Start service if elastic index exists
if [ -d "${ES_INDEX_DIR}" ]; then
    echo "Starting service..."
    exec java -jar photon.jar "$@"
else
    echo "Could not start service, the search index could not be found"
    exit 1
fi