#!/bin/sh

set -e

# Function to replace placeholder in all relevant files
replace_next_public_vars() {
    # Get all NEXT_PUBLIC environment variables
    env | grep '^NEXT_PUBLIC_' | while read -r line; do
        # Extract the key and value
        key=$(echo "$line" | cut -d= -f1)
        value=$(echo "$line" | cut -d= -f2-)
        
        # Create the placeholder pattern
        placeholder="__${key}__"
        
        echo "Replacing ${placeholder} with ${value}"
        
        # Find and replace in all js files, including .next directory
        find /app -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|${placeholder}|${value}|g" {} +
        
        # Also check specifically in the .next directory
        if [ -d "/app/.next" ]; then
            echo "Checking .next directory specifically..."
            find /app/.next -type f -name "*.js" -exec sed -i "s|${placeholder}|${value}|g" {} +
        fi
    done
}

# Replace all NEXT_PUBLIC variables
replace_next_public_vars

# Run database migrations
echo "Running database migrations..."
NODE_ENV=production ./node_modules/.bin/sequelize-cli db:migrate

# Start the background service
echo "Starting background service..."
node scripts/start-background-service.js &
BACKGROUND_SERVICE_PID=$!

# Execute the main container command
exec "$@" 