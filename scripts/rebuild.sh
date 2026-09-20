#!/bin/bash

pnpm run clean && pnpm install && TESTING=true anchor build -- --features testing && pnpm run build
