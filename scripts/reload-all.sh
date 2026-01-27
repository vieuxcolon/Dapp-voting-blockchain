#!/usr/bin/env bash
set -e

echo "========================"
echo "1) Compiling contracts"
echo "========================"
truffle compile --all

echo "========================"
echo "2) Migrating contracts"
echo "========================"
truffle migrate --reset --network development

echo "========================"
echo "3) Running full test script"
echo "========================"
truffle exec scripts/runAll.js --network development

echo "========================"
echo "All steps completed successfully!"
echo "========================"

