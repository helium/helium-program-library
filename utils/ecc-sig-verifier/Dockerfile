# Specify the base image
FROM rust:1.68-alpine3.17 AS build

# Set the working directory
WORKDIR /app

RUN apk add --no-cache musl-dev pkgconf openssl-dev

# Copy the Cargo files and install dependencies
COPY Cargo.toml Cargo.lock ./
# Copy the source code and build the application
COPY src ./src
RUN cargo build --release

# Create a new image for the application
FROM alpine:3.17
WORKDIR /app
COPY --from=build /app/target/release/ecc-sig-verifier /app/ecc-sig-verifier

ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8000
ENV ROCKET_LOG_LEVEL="normal"

# Expose the port on which the application will run
EXPOSE 8000

# Start the application
CMD ["/app/ecc-sig-verifier"]
