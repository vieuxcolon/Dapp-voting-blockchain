#!/bin/bash

echo "Starting full deployment and election script..."

# 1) Compile
truffle compile --all

# 2) Deploy
truffle migrate --reset --network development

# 3) Run election script
truffle exec scripts/runElection.js --network development

echo "Done."
