import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ChainId, supportedTokens, supportedNetworks } from 'config/constants';
import erc20ContractAbi from '../../abis/erc20.json';

@Injectable()
export class TokenTransferService {
  private readonly logger = new Logger(TokenTransferService.name);
  private readonly providers: Record<number, ethers.JsonRpcProvider> = {};
  private readonly wallets: Record<number, ethers.Wallet> = {};

  constructor() {
    const privateKey = process.env.DPWPK;
    if (!privateKey) throw new Error('DPWPK environment variable is not set');

    const supportedChainIds = new Set([
      ChainId.BSC_MAINNET,
      ChainId.BSC_TESTNET,
      ChainId.BASE_MAINNET,
    ]);

    supportedNetworks
      .filter(n => supportedChainIds.has(n.chainId))
      .forEach(({ chainId, rpcUrls }) => {
        const id = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId;
        const provider = new ethers.JsonRpcProvider(rpcUrls[0]);
        this.providers[id] = provider;
        this.wallets[id] = new ethers.Wallet(privateKey, provider);
      });

    setTimeout(() => {
      this.logger.log(`✅ Wallets initialized: ${Object.keys(this.wallets).join(', ')}`);
    }, 3000);
  }

  /**
   * Transfer ERC20 tokens.
   */
  async transferERC20({
    to,
    amount,
    tokenSymbol,
    chainId,
  }: {
    to: string;
    amount: number; // in USD equivalent, will be converted using token decimals
    tokenSymbol: string;
    chainId: number;
  }): Promise<string> {
    try {
      const provider = this.providers[chainId];
      const wallet = this.wallets[chainId];

      if (!provider || !wallet) {
        throw new Error(`Unsupported chainId: ${chainId}`);
      }

      const token = supportedTokens.find(t => t.symbol === tokenSymbol && t.chainId === chainId);
      if (!token) {
        throw new Error(`Token ${tokenSymbol} not supported on chain ${chainId}`);
      }

      const contract = new ethers.Contract(token.address, erc20ContractAbi, wallet);
      const decimals = await contract.decimals();
      const adjustedAmount = ethers.parseUnits(amount.toString(), decimals);

      const tx = await contract.transfer(to, adjustedAmount);
      await tx.wait();

      this.logger.log(`✅ Token transfer success on chain ${chainId}: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      this.logger.error(`❌ Transfer failed on chain ${chainId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transaction receipt to confirm on-chain success.
   */
  async getTransactionReceipt(txHash: string, chainId: number): Promise<ethers.TransactionReceipt | null> {
    const provider = this.getProvider(chainId);
    if (!provider) {
      this.logger.warn(`No provider for chainId ${chainId}`);
      return null;
    }

    return await provider.getTransactionReceipt(txHash);
  }

  /**
   * Get initialized provider for a chain.
   */
  getProvider(chainId: number): ethers.JsonRpcProvider {
    return this.providers[chainId];
  }
}
