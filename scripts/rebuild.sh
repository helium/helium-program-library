#!/bin/bash

yarn clean && yarn && TESTING=true anchor build && yarn build