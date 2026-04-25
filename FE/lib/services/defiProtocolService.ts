/**
 * Golda Finance — DeFi Protocol Integration (Monad Mainnet)
 *
 * Architecture:
 *   Step 1 — Acquire target asset via LiFi (USDC → XAUt0 or WBTC)
 *   Step 2 — Deposit target asset into the DeFi protocol vault to earn yield
 *
 * Most mature DeFi protocols implement ERC-4626 (Tokenised Vault Standard):
 *   deposit(assets, receiver) → shares
 *   withdraw(assets, receiver, owner) → shares
 *
 * Protocols that use their own interface get a custom handler below.
 * When a protocol address is not yet verified on Monad, `contractAddress`
 * is null and the UI shows a fallback link to the protocol's website.
 */

import { ethers } from 'ethers';
import { MONAD_TOKENS } from './lifiService';

// ─── ERC-4626 ABI (minimal — deposit + withdraw) ─────────────────────────────

const ERC4626_ABI = [
  'function deposit(uint256 assets, address receiver) external returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function convertToAssets(uint256 shares) external view returns (uint256)',
  'function totalAssets() external view returns (uint256)',
  'function asset() external view returns (address)',
];

// Simple ERC-20 approve ABI
const APPROVE_ABI = [
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

// ─── Protocol registry ────────────────────────────────────────────────────────

export type ProtocolRisk = 'low' | 'medium' | 'high';
export type DepositAsset = 'XAUt0' | 'WBTC';

export interface DeFiProtocol {
  id: string;
  name: string;
  icon: string;
  apy: number;               // indicative APY %
  risk: ProtocolRisk;
  depositAsset: DepositAsset;
  depositToken: {
    address: string;
    decimals: number;
    symbol: string;
  };
  tvl: string;               // human-readable TVL
  desc: string;
  websiteUrl: string;
  /**
   * Contract address of the protocol's vault/pool on Monad mainnet.
   * null = address not yet verified; UI will show manual link.
   */
  contractAddress: string | null;
  /** 'erc4626' uses the standard interface; 'custom' uses the handler below. */
  interface: 'erc4626' | 'custom';
}

export const DEFI_PROTOCOLS: DeFiProtocol[] = [
  {
    id: 'kuru-xaut',
    name: 'Kuru Exchange',
    icon: '⚡',
    apy: 22.5,
    risk: 'high',
    depositAsset: 'XAUt0',
    depositToken: {
      address: MONAD_TOKENS.XAUt0.address,
      decimals: 6,
      symbol: 'XAUt0',
    },
    tvl: '$12.1M',
    desc: 'Monad-native order-book DEX. Market-make on gold/BTC pairs to earn spread fees. High APY, higher IL risk.',
    websiteUrl: 'https://kuru.io',
    contractAddress: null,   // fill in once Kuru vault address verified
    interface: 'erc4626',
  },
  {
    id: 'neverland-xaut',
    name: 'Neverland Finance',
    icon: '🌿',
    apy: 18.5,
    risk: 'medium',
    depositAsset: 'XAUt0',
    depositToken: {
      address: MONAD_TOKENS.XAUt0.address,
      decimals: 6,
      symbol: 'XAUt0',
    },
    tvl: '$3.2M',
    desc: 'Gold-backed yield farming native to Monad. Deposit XAUt0 into the vault, earn yield in XAUt0.',
    websiteUrl: 'https://neverland.finance',
    contractAddress: null,   // fill in once Neverland vault address verified
    interface: 'erc4626',
  },
  {
    id: 'ambient-wbtc',
    name: 'Ambient Finance',
    icon: '💧',
    apy: 14.7,
    risk: 'medium',
    depositAsset: 'WBTC',
    depositToken: {
      address: MONAD_TOKENS.WBTC.address,
      decimals: 8,
      symbol: 'WBTC',
    },
    tvl: '$8.6M',
    desc: 'Concentrated liquidity AMM on Monad. Provide WBTC single-sided liquidity, earn swap fees.',
    websiteUrl: 'https://ambient.finance',
    contractAddress: null,   // fill in once Ambient vault address verified
    interface: 'erc4626',
  },
  {
    id: 'morpho-wbtc',
    name: 'Morpho Blue',
    icon: '🦋',
    apy: 12.3,
    risk: 'low',
    depositAsset: 'WBTC',
    depositToken: {
      address: MONAD_TOKENS.WBTC.address,
      decimals: 8,
      symbol: 'WBTC',
    },
    tvl: '$8.9M',
    desc: 'Peer-to-peer lending protocol. Supply WBTC to earn optimised lending yield with no governance overhead.',
    websiteUrl: 'https://morpho.org',
    contractAddress: null,   // fill in once Morpho Blue Monad deployment verified
    interface: 'erc4626',
  },
];

// ─── Deposit flow ─────────────────────────────────────────────────────────────

export interface DepositResult {
  txHash: string;
  shares: bigint;
}

/**
 * Deposit `amount` of the protocol's target token into its vault.
 * Handles ERC-20 approval + ERC-4626 deposit in one call.
 *
 * Throws if the protocol's contractAddress is null — caller should
 * check `protocol.contractAddress !== null` before calling.
 */
export async function depositToProtocol(
  signer: ethers.Signer,
  protocol: DeFiProtocol,
  amount: bigint  // in smallest unit (e.g. 6-dec for XAUt0)
): Promise<DepositResult> {
  if (!protocol.contractAddress) {
    throw new Error(`${protocol.name} contract address not yet available on Monad`);
  }

  const owner = await signer.getAddress();
  const tokenAddress = protocol.depositToken.address;
  const vaultAddress = protocol.contractAddress;

  // 1. Approve token to vault if needed
  const token = new ethers.Contract(tokenAddress, APPROVE_ABI, signer);
  const allowance: bigint = await token.allowance(owner, vaultAddress);
  if (allowance < amount) {
    const approveTx = await token.approve(vaultAddress, ethers.MaxUint256);
    await approveTx.wait();
  }

  // 2. Deposit via ERC-4626 standard
  const vault = new ethers.Contract(vaultAddress, ERC4626_ABI, signer);
  const tx = await vault.deposit(amount, owner);
  const receipt = await tx.wait(1);

  // Parse shares from Transfer event emitted by the vault
  let shares = BigInt(0);
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = vault.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'Deposit') {
        shares = parsed.args.shares as bigint;
        break;
      }
    } catch { /* not a vault event */ }
  }

  return { txHash: tx.hash, shares };
}

// ─── Read: user's position in a protocol ─────────────────────────────────────

export interface ProtocolPosition {
  shares: number;
  assetsValue: number;  // in deposit token units
}

export async function getProtocolPosition(
  provider: ethers.Provider,
  protocol: DeFiProtocol,
  userAddress: string
): Promise<ProtocolPosition> {
  if (!protocol.contractAddress) return { shares: 0, assetsValue: 0 };

  try {
    const vault = new ethers.Contract(protocol.contractAddress, ERC4626_ABI, provider);
    const sharesBn: bigint = await vault.balanceOf(userAddress);
    const assetsBn: bigint = await vault.convertToAssets(sharesBn);
    return {
      shares:      Number(ethers.formatUnits(sharesBn, 18)),
      assetsValue: Number(ethers.formatUnits(assetsBn, protocol.depositToken.decimals)),
    };
  } catch {
    return { shares: 0, assetsValue: 0 };
  }
}
