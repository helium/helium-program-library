# Specify the base image
FROM rust:1.68.2

# Set the working directory
WORKDIR /app

# Copy the Cargo files and install dependencies
COPY Cargo.toml Cargo.lock ./
# Copy the source code and build the application
COPY src ./src
RUN cargo build --release

ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8000
ENV ROCKET_LOG_LEVEL="normal"

# Expose the port on which the application will run
EXPOSE 8000

# Start the application
CMD ["/app/target/release/ecc-sig-verifier"]