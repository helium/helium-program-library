#!/bin/bash

pnpm run clean && pnpm install && TESTING=true HELIUM_TEST_BUILD=true anchor build && pnpm run build
