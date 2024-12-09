#!/bin/bash

# Function to get the latest semver tag for a program
get_latest_tag() {
    local program_name=$1
    git tag -l "program-$program_name-*" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1
}

# Function to get commit hash from a tag
get_commit_hash() {
    local tag=$1
    git rev-list -n 1 "$tag"
}

# Function to verify a single program
verify_program() {
    local program_dir=$1
    local max_attempts=5
    local attempt=1
    
    # Get the base name and convert hyphens to underscores
    library_name=$(basename "$program_dir" | tr '-' '_')
    
    # Get the program ID from Anchor.toml
    program_id=$(toml get Anchor.toml programs.localnet.$library_name | tr -d '"')
    
    # Skip if program ID is empty
    [ -z "$program_id" ] && return
    
    # Get the program name (for tag matching)
    program_name=$(basename "$program_dir")
    
    # Get the latest tag and its commit hash
    latest_tag=$(get_latest_tag "$program_name")
    
    # Check if tag exists
    if [ -z "$latest_tag" ]; then
        echo "Error: No tags found for $program_name"
        return 1
    fi
    
    commit_hash=$(get_commit_hash "$latest_tag")
    
    echo "Verifying $library_name with program ID $program_id"
    echo "Using tag $latest_tag (commit: $commit_hash)"
    
    while [ $attempt -le $max_attempts ]; do
        if solana-verify verify-from-repo \
            https://github.com/helium/helium-program-library \
            --program-id "$program_id" \
            --remote \
            --commit-hash "$commit_hash" \
            --library-name "$library_name" \
            -b solanafoundation/solana-verifiable-build:1.16.13; then
            return 0
        fi
        
        echo "Attempt $attempt failed. Retrying in 10 seconds..."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    echo "Error: Verification failed after $max_attempts attempts"
    return 1
}

# Check if a specific program was provided
if [ $# -eq 1 ]; then
    program_dir="programs/$1"
    if [ -d "$program_dir" ]; then
        verify_program "$program_dir"
    else
        echo "Error: Program directory '$program_dir' not found"
        exit 1
    fi
else
    # Iterate through each directory in programs/
    for program_dir in programs/*/; do
        verify_program "$program_dir"
    done
fi
