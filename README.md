# Decentralized Crowdfunding DApp

**Developed by Waleed, 23i-5553**

A local crowdfunding application built with Solidity 0.8.20, Hardhat, React, Vite, ethers.js v6, and MetaMask. The Hardhat deployer administers KYC requests; verified wallets and the admin can create campaigns, and any wallet can contribute.

> **Local-testing data only:** KYC names and CNIC values are stored on-chain and can be read by anyone who can access the blockchain. Use made-up test CNIC values for this assignment. Never submit real identity data to a public chain.

## Project layout

```text
hardhat-project/
  contracts/       KYC and crowdfunding Solidity contracts
  scripts/deploy.js
  test/            End-to-end contract tests
frontend/
  src/             React application and generated contract configuration
README.md
```

## Requirements

- Node.js and npm
- MetaMask browser extension

## Install

Open a terminal at the project root and install both sets of dependencies:

```powershell
cd hardhat-project
npm install
cd ..\frontend
npm install
cd ..
```

## Compile and test contracts

```powershell
cd hardhat-project
npm run compile
npm test
```

The test suite covers KYC submission, approval, rejection and resubmission; campaign creation permissions and invalid inputs; contributions from unverified accounts; goal completion; and withdrawal rules.

## Start the local blockchain

Open a terminal in `hardhat-project` and keep this process running:

```powershell
cd hardhat-project
npm run node
```

Hardhat prints funded local accounts and their private keys. They are disposable local test accounts; never use these keys outside the local Hardhat network.

## Deploy both contracts

In a second terminal:

```powershell
cd hardhat-project
npm run deploy
```

This deploys `KYCRegistry_Waleed` and `Crowdfunding_Waleed` to the local node and writes their addresses and ABIs to `frontend/src/contracts/contracts.json`. Re-deploy after restarting the local node, since the node's in-memory chain and contract addresses reset.

## Add Hardhat to MetaMask

In MetaMask, add a network with these settings:

| Setting | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

If MetaMask does not already list the network, the DApp's **Switch / add Hardhat network** button can request that it be added.

To import a funded test account, choose **Import account** in MetaMask and paste one of the private keys printed by `npm run node`. Do not share or reuse a local test key.

## Start the frontend

In a third terminal:

```powershell
cd frontend
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`), connect MetaMask, and confirm the Hardhat Local network is selected.

## Assignment flow

1. Connect the deployer account in MetaMask. It is the KYC and campaign admin and may create campaigns without KYC.
2. Connect a different test account, submit a KYC request, and use a made-up CNIC value.
3. Switch MetaMask back to the deployer account and approve or reject pending requests in the admin panel.
4. With an approved account, create a campaign with a whole-number ETH goal.
5. Contribute from any account. A campaign changes from Active to Completed when its raised amount meets or exceeds its goal.
6. Connect the creator account and withdraw the completed campaign's funds. Its status changes to Withdrawn.

Every successful transaction is confirmed before the page refreshes its contract data. The campaign progress and statuses then show the latest on-chain values.
