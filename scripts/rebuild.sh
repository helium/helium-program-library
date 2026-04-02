#!/bin/bash

pnpm run clean && pnpm install && TESTING=true anchor build && pnpm run build
