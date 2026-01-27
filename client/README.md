# Voting DApp Client

## Overview
This is the frontend for a simple voting DApp. It connects to two smart
contracts deployed locally (Ganache): `Election` and `VotingToken`. The UI lets
an admin create candidates and control the election, while voters with a voting
token can cast exactly one vote.

## What the contracts do
- `VotingToken` (ERC-20): Mints an initial supply to the admin. The admin can
  give 1 token to a voter who does not already have one. A token is required to
  vote.
- `Election`: Stores candidates, tracks whether voting is active, prevents
  double voting, validates candidate IDs, and checks token balances. It exposes
  `getResults()` for live tallies.

## Features
- Connect to MetaMask
- Admin actions: add candidate, start election, end election
- Vote by candidate ID (one vote per address)
- Show live results

## Prerequisites
- Node.js + npm
- Ganache running at `http://127.0.0.1:7545` (network id `5777`)
- Truffle (global or via `npx`)
- MetaMask

## Local setup
1. From the repo root, install and deploy contracts:
   ```bash
   npm install
   npx truffle migrate --network development
   ```
   This writes `build/contracts/*.json`, which the client imports.

2. From this `client` folder:
   ```bash
   npm install
   npm start
   ```
   Parcel will print the local URL (usually `http://localhost:1234`).

3. In MetaMask:
   - Add the local Ganache network (RPC `http://127.0.0.1:7545`, chain id `5777`)
   - Import Ganache accounts

## Using the app
- Connect MetaMask.
- Use the first Ganache account as admin to add candidates and start the election.
- Distribute voting tokens to voters (tokens are not pre-distributed; the
  initial supply goes to the admin).
- Candidate IDs start at 1.
- Click "Show Live Results" to see current vote counts.

## Notes
- If you redeploy contracts, re-run the migration so the `build/contracts`
  artifacts update, then reload the client.
