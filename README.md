# Golda Finance

Golda Finance is an anti-inflation savings protocol built on Monad. Users deposit USDC into a non-custodial vault and receive gUSDC shares representing their proportional claim on the underlying portfolio. The vault operator routes capital into tokenized gold (PAXG, XAUt0) and wrapped Bitcoin (WBTC) via LiFi cross-chain swaps. An AI agent powered by Google Gemini and Pyth Network price feeds continuously monitors market conditions and can execute deposits autonomously on behalf of users.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Architecture](#architecture)
- [System Workflow](#system-workflow)
- [Technology Stack](#technology-stack)
- [Smart Contract](#smart-contract)
- [Frontend](#frontend)
- [AI Agent](#ai-agent)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)

---

## Problem Statement

Traditional savings accounts denominated in fiat currencies lose real purchasing power over time due to inflation. Most retail investors lack the tools, time, or expertise to actively move capital into inflation-resistant assets. Existing DeFi vaults either expose users to complex interfaces, require manual rebalancing, or provide no market-timing guidance.

Specific gaps this project addresses:

- Capital sitting idle in USDC erodes in real value over time due to inflation
- Users have no on-chain, automated mechanism to rotate into gold or BTC at optimal entry points
- Premium market analysis tools are inaccessible without high subscription costs or technical knowledge
- Most DeFi savings products are not designed for mobile-first, non-technical users

---

## Solution

Golda Finance separates concerns cleanly across three layers:

**Vault (on-chain)** — A minimal, auditable ERC-20 vault contract that handles USDC deposits, share minting, withdrawal queuing, and claim settlement. It contains no swap or lending logic, which keeps it simple to verify and straightforward to upgrade independently of the routing strategy.

**Operator (off-chain)** — A privileged wallet that reads LiFi quotes and Pyth oracle prices, then calls the vault's `execute` function to route capital into the best available savings asset. The operator is the only party authorized to interact with external DeFi protocols on behalf of the vault.

**AI Agent (application layer)** — A Google Gemini 2.5 Flash model that ingests live gold prices from the Pyth Hermes REST API and produces structured BUY / WAIT / SELL recommendations. Users can run analysis on demand or enable auto-execution, which operates on a server-side cron schedule and continues working even when the user is not actively using the application.

---

## Architecture

```
User (browser / mobile)
        |
        | USDC deposit / withdraw request
        v
   GoldaVault.sol  (Monad Mainnet)
        |
        | gUSDC shares minted
        v
   Operator wallet
        |
        | LiFi SDK calldata (off-chain)
        v
   LiFi Diamond  -->  DEX / Bridge
        |
        | PAXG / XAUt0 / WBTC received
        v
   GoldaVault holds savings assets

   ---- AI layer (Next.js API routes) ----

   Pyth Hermes API  -->  getPythGoldPrice()
        |
        v
   Gemini 2.5 Flash  -->  GoldMarketAnalysis
        |
        v
   Cron job  -->  executeDepositForUser()
        |
        v
   GoldaVault.deposit()
```

---

## System Workflow

### User Deposit

1. User authenticates via Privy (embedded wallet or WalletConnect).
2. User enters a USDC amount and selects a preferred savings asset (XAUt0, PAXG, or WBTC).
3. The frontend calls the LiFi SDK to preview the estimated output amount and fees at current market rates.
4. User approves USDC spending and calls `GoldaVault.deposit()`.
5. The vault mints gUSDC shares at the current NAV-derived share price and records the deposit on-chain.
6. The operator detects the deposit event, builds LiFi swap calldata off-chain, and calls `GoldaVault.execute()` to convert idle USDC into the target savings asset.
7. The operator updates the vault NAV via `reportNav()` to reflect the new portfolio valuation.

### User Withdrawal

1. User calls `GoldaVault.requestWithdraw(shares)`.
2. The vault burns the shares, computes the USDC owed at the current share price, and queues a withdrawal record on-chain.
3. The operator unwinds positions by swapping gold or BTC back to USDC via LiFi and ensuring the vault holds sufficient liquid USDC to cover the claim.
4. User calls `GoldaVault.claim(id)` to receive the USDC once the vault has settled the withdrawal.

### AI Agent — Manual Mode

1. User navigates to the Agent page and triggers an analysis.
2. The frontend fetches the current XAU/USD price from the Pyth Hermes API.
3. The price data and user portfolio context are passed to Gemini 2.5 Flash with a structured prompt.
4. The model returns a JSON-formatted recommendation containing action, confidence score, reasoning, risk level, and price target.
5. If the confidence score meets the user-defined minimum threshold, the user may manually execute a deposit based on the recommendation.

### AI Agent — Automated Mode

1. The user saves agent settings — risk level, minimum confidence threshold, and maximum trade amount — to the server via the settings API.
2. Vercel Cron triggers the analysis endpoint on a recurring schedule.
3. The cron handler retrieves all users with active agents, runs a market analysis for each, and calls the deposit function automatically when the action is BUY and the confidence threshold is met.
4. Execution logs are stored server-side and surfaced in the Agent page for the user to review.

---

## Technology Stack

### Blockchain

| Technology | Purpose |
|---|---|
| Monad Mainnet (Chain ID 10143) | Network for all contract deployments |
| Solidity 0.8.26 | Smart contract language |
| Foundry (forge, cast) | Contract compilation, testing, and deployment |
| OpenZeppelin Contracts v5 | ERC-20, Ownable, ReentrancyGuard, SafeERC20 |
| forge-std | Testing utilities (Foundry standard library) |

### Frontend

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | React framework and API route handling |
| TypeScript 5 | Type-safe development across the entire frontend |
| Tailwind CSS v4 | Utility-first styling |
| Radix UI | Accessible, unstyled UI primitives |
| ethers.js v6 | EVM contract reads and transaction signing |
| Privy (`@privy-io/react-auth`) | Wallet authentication and embedded wallet creation |
| LiFi SDK v3 (`@lifi/sdk`) | Cross-chain swap quotes and routing |
| Google Generative AI SDK | Gemini 2.5 Flash model inference |
| Pyth Hermes REST API | Real-time XAU/USD price feed |
| Axios | HTTP client for external API calls |
| Vercel Cron | Scheduled server-side automated agent execution |

### Protocol Integrations

| Protocol | Role |
|---|---|
| LiFi (Jumper Exchange) | USDC to PAXG / XAUt0 / WBTC swap routing and cross-chain bridging |
| Pyth Network | Real-time XAU/USD spot price with confidence intervals via Hermes REST API |
| Google Gemini 2.5 Flash | AI-powered market analysis and savings advisory |
| Privy | Embedded wallet creation, social login, and WalletConnect support |

### Savings Assets

| Asset | Description |
|---|---|
| XAUt0 (Tether Gold) | Each token represents one troy ounce of physical gold held in reserve |
| PAXG (Paxos Gold) | Each token represents one fine troy ounce of London Good Delivery gold |
| WBTC (Wrapped Bitcoin) | ERC-20 representation of Bitcoin, used as a hard-asset inflation hedge |

---

## Smart Contract

### GoldaVault

The vault is an accounting-only contract. All swap and yield routing logic is executed off-chain by the operator. The vault holds assets and enforces strict access control over which external contracts the operator is permitted to call.

**Key design decisions:**

The vault intentionally does not implement the ERC-4626 standard. Because assets are deployed into positions that cannot be instantly liquidated — gold tokens and yield protocol shares — a synchronous redeem function is not viable. A two-step pattern (request withdraw, then claim) allows the operator time to unwind positions before the user collects USDC.

NAV is reported by the operator after each rebalance, priced using LiFi quotes and Pyth oracle data. This is a trusted off-chain valuation. The share price at any point in time is derived directly from this reported figure divided by total share supply.

The `execute()` function forwards arbitrary calldata only to contracts on an explicit allowlist controlled by the owner. This design gives the operator full LiFi SDK flexibility while preventing calls to unauthorized contracts.

OpenZeppelin's `forceApprove` is used for all token approvals to correctly handle non-standard ERC-20 implementations.

**Contract functions:**

| Function | Caller | Description |
|---|---|---|
| `deposit(uint256)` | User | Deposit USDC and receive gUSDC shares at the current NAV-derived share price |
| `requestWithdraw(uint256)` | User | Burn gUSDC shares and queue a USDC withdrawal at the current share price |
| `claim(uint256)` | User | Collect USDC from a settled withdrawal once the vault holds sufficient liquidity |
| `execute(address, uint256, bytes)` | Operator | Forward calldata to an allowlisted target such as the LiFi Diamond or a yield vault |
| `approveToken(IERC20, address, uint256)` | Operator | Set ERC-20 allowance for an allowlisted spender |
| `reportNav(uint256)` | Operator | Push the updated portfolio valuation in USDC to the vault |
| `setOperator(address)` | Owner | Replace the operator wallet address |
| `setAllowedTarget(address, bool)` | Owner | Add or remove a contract from the execution allowlist |
| `rescue(IERC20, uint256, address)` | Owner | Recover non-USDC tokens accidentally sent to the vault |
| `sharePrice()` | View | Returns the current price of one gUSDC share expressed in USDC (6 decimals) |

---

## Frontend

The application is structured as a mobile-first progressive web app. The main views are:

**Dashboard** — Displays the connected wallet's USDC balance, gUSDC share balance, current share price, and portfolio value in USDC. Quick-action buttons provide direct access to deposit and withdrawal flows.

**Deposit** — Allows the user to enter a USDC amount, select a target savings asset, and preview the estimated output via a live LiFi quote before confirming the transaction.

**Agent** — Provides access to on-demand AI market analysis, auto-agent configuration (risk level, confidence threshold, maximum trade size), an analysis history log, and a conversational chat interface for gold market questions.

**History** — Shows all past deposits, withdrawal requests, and claim transactions associated with the connected wallet.

On-chain state is managed through custom React hooks. Agent settings are persisted server-side so that automated execution continues independently of whether the user has the application open.

---

## AI Agent

The GOLDA AI agent uses Google Gemini 2.5 Flash to evaluate current gold market conditions and produce a structured savings recommendation. The analysis pipeline works as follows:

1. Fetch the current XAU/USD spot price and confidence interval from the Pyth Hermes API using price feed ID `0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2`.
2. Derive EMA deviation and volatility estimates from the returned price and confidence data.
3. Send a structured prompt to Gemini 2.5 Flash requesting a JSON response containing: `action` (BUY, WAIT, or SELL), `confidence` (0–100), `reasoning`, `currentPrice`, `priceTarget`, `riskLevel`, and `marketSentiment`.
4. Parse, validate, and sanitize the JSON response before returning it to the frontend or cron handler.
5. Fall back to a rule-based price-vs-EMA decision if the AI service is unavailable.

The agent supports three risk profiles — conservative, moderate, and aggressive — which adjust the minimum confidence score required before a BUY recommendation triggers an execution. Auto-execution is additionally bounded by the user-defined maximum trade amount to limit exposure per automated cycle.

---

## Deployment

The GoldaVault contract is deployed and verified on Monad Mainnet.

| Component | Contract Address |
|---|---|
| Golda Vault | `0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e` |

### Network Configuration

| Parameter | Value |
|---|---|
| Network | Monad Mainnet |
| Chain ID | 143 |
| RPC URL | `[https://testnet-rpc.monad.xyz](https://monad-mainnet.g.alchemy.com/v2/5FHf0Nnr76lkYNj0ibOpC)` |
| Block Explorer | `[https://testnet.monadscan.com](https://monadscan.com)` |

---

## Environment Variables

Copy `FE/.env.example` to `FE/.env.local` and populate all required values before running the application.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | Yes | Monad RPC endpoint |
| `NEXT_PUBLIC_CHAIN_ID` | Yes | Chain ID (10143) |
| `NEXT_PUBLIC_GOLDA_VAULT_ADDRESS` | Yes | Deployed GoldaVault contract address |
| `NEXT_PUBLIC_USDC_ADDRESS` | Yes | USDC token contract address on Monad |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Privy application ID for wallet authentication |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for server-side AI analysis |
| `AI_AGENT_PRIVATE_KEY` | Yes | Private key used by the server-side auto-agent to submit transactions |
| `CRON_SECRET` | Yes | Authorization secret for the automated agent cron endpoint |

---

## Local Development

### Prerequisites

- Node.js 20 or later
- pnpm
- Foundry (for smart contract compilation and testing)

### Frontend

```bash
cd FE
pnpm install
cp .env.example .env.local
pnpm dev
```

The application runs at `http://localhost:3000`.

### Smart Contracts

```bash
cd SC
forge build
forge test
forge script script/DeployGoldaVault.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```
