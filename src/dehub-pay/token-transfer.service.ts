import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ChainId, supportedTokens, supportedNetworks } from 'config/constants';
import erc20ContractAbi from '../../abis/erc20.json';
import { DehubPayService } from './dehub-pay-service';

@Injectable()
export class TokenTransferService {
  private readonly logger = new Logger(TokenTransferService.name);
  private readonly providers: Record<number, ethers.JsonRpcProvider> = {};
  private readonly wallets: Record<number, ethers.Wallet> = {};
  private isProcessing = false;
  constructor(private readonly dehubPayService: DehubPayService) {
    const privateKey = process.env.DPWPK;
    if (!privateKey) throw new Error('DPWPK environment variable is not set');

    const supportedChainIds = new Set([ChainId.BSC_MAINNET, ChainId.BSC_TESTNET, ChainId.BASE_MAINNET]);

    supportedNetworks
      .filter(n => supportedChainIds.has(n.chainId))
      .forEach(({ chainId, rpcUrls }) => {
        const id = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId;
        const provider = new ethers.JsonRpcProvider(rpcUrls[0]);
        this.providers[id] = provider;
        this.wallets[id] = new ethers.Wallet(privateKey, provider);
      });

    setTimeout(async () => {
      this.logger.log(`✅ Wallets initialized: ${Object.keys(this.wallets).join(', ')}`);
      // const provider = this.providers[97];
      // const wallet = this.wallets[97];
      // console.log("DDDDD",    await provider.getBalance(wallet.address))
    }, 3000);
  }

  /**
   * Transfer ERC20 tokens.
   */

  async getProcessing(){
    return this.isProcessing;
  }
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
      this.isProcessing = true;
      const provider = this.providers[chainId];
      const wallet = this.wallets[chainId];

      if (!provider || !wallet) {
        this.isProcessing = false;
        throw new Error(`Unsupported chainId: ${chainId}`);
      }

      const token = supportedTokens.find(t => t.symbol === tokenSymbol && t.chainId === chainId);
      if (!token) {
        throw new Error(`Token ${tokenSymbol} not supported on chain ${chainId}`);
      }

      const contract = new ethers.Contract(token.address, erc20ContractAbi, wallet);
      const decimals = await contract.decimals();
      const adjustedAmount = ethers.parseUnits(amount.toString(), decimals);

      // Build transaction data manually
      const txData = await contract.transfer.populateTransaction(to, adjustedAmount);

      // Get the wallet's balance (native currency like ETH, MATIC)
      const rawBalance = await provider.getBalance(wallet.address);
      const formattedBalance = ethers.formatEther(rawBalance); // Convert to native currency (ETH/MATIC)

      // Estimate gas using the provider
      const estimatedGas = await provider.estimateGas({
        from: wallet.address,
        to: token.address,
        data: txData.data,
      });

      // Convert rawBalance and estimatedGas to BigNumber for comparison

      // Convert rawBalance and estimatedGas to FixedNumber for comparison
      const rawBalanceFixed = ethers.FixedNumber.fromValue(rawBalance, 18); // 18 decimals for ETH/MATIC
      const estimatedGasFixed = ethers.FixedNumber.fromValue(estimatedGas, 18); // Adjust decimals if necessary

      // Check if the wallet has enough balance to cover the gas fee
      if (estimatedGasFixed.gte(rawBalanceFixed)) {
        throw new Error(
          `Insufficient balance to cover gas fee. Balance: ${formattedBalance} ETH, Estimated Gas: ${ethers.formatUnits(estimatedGas, 'gwei')} Gwei`,
        );
      }
      // Proceed with the transfer if sufficient balance
      const tx = await contract.transfer(to, adjustedAmount);
      await tx.wait();

      this.logger.log(`✅ Token transfer success on chain ${chainId}: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      this.logger.error(`❌ Transfer failed on chain ${chainId}: ${error.message}`);
      throw error;
    } finally {
      this.isProcessing = false;
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
