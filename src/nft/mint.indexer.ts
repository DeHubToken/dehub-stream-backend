// nft.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { BigNumberish, ethers } from 'ethers';
import ContractAbi from 'abis/StreamNft.json';
import { PostActivityType, TokenDocument, TokenModel } from 'models/Token';
import { AccountModel } from 'models/Account';
import { ActivityModel } from 'models/activity';

@Injectable()
export class NftIndexer implements OnModuleInit {
  private provider: ethers.JsonRpcProvider;
  private nftContract: ethers.Contract;
  private readonly zeroAddress = '0x0000000000000000000000000000000000000000';
  private lastBlockChecked: number;

  constructor() {
    // Initialize provider and contract in the constructor
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_ENDPOINT);
    this.nftContract = new ethers.Contract(process.env.DEFAULT_COLLECTION, ContractAbi, this.provider);
    this.lastBlockChecked = 0; // Initialize the last checked block number
  }

  async onModuleInit() {
    // Set the initial block number to the latest block
    this.lastBlockChecked = await this.provider.getBlockNumber();
    // Poll for events every 60 seconds
    setInterval(() => this.pollTransferEvents(), 60000);
  }

  private async pollTransferEvents() {
    try {
      const currentBlock = await this.provider.getBlockNumber();

      // Define the filter for the Transfer events
      const filter = {
        address: process.env.DEFAULT_COLLECTION,
        fromBlock: this.lastBlockChecked + 1,
        toBlock: currentBlock,
        topics: [ethers.id('Transfer(address,address,uint256)')],
      };

      // Fetch the logs based on the filter
      const logs = await this.provider.getLogs(filter);

      // Process each log
      logs.forEach(log => {
        const decoded = this.nftContract.interface.parseLog(log);
        this.txEventListener(
          decoded.args[0], // `from` address
          decoded.args[1], // `to` address
          decoded.args[2], // `tokenId`
          log,
        );
      });

      // Update the last block checked to the current block
      this.lastBlockChecked = currentBlock;
    } catch (error: any & { message: string }) {
      console.error('Error polling transfer events:', error);
    }
  }

  private async txEventListener(from: string, to: string, tokenId: BigNumberish, logInfo: any) {
    const tokenIdInt = parseInt(tokenId.toString());
    const toAddress = to.toLowerCase();
    let updateData: any = { owner: toAddress };

    if (from.toLowerCase() === this.zeroAddress) {
      updateData = { ...updateData, minter: toAddress, status: 'minted' };
      console.log('--minted', (await this.nftContract.getAddress()).toLowerCase(), tokenIdInt, toAddress);
    }

    try {
      const updatedTokenItem = await TokenModel.findOneAndUpdate(
        { contractAddress: (await this.nftContract.getAddress()).toLowerCase(), tokenId: tokenIdInt },
        updateData,
        { new: true, upsert: true },
      );

      if (!updatedTokenItem) {
        console.log('Not found record');
      } else {
        console.log(`### transfer: ${tokenId} ${from.toLowerCase()} -> ${toAddress}`);
      }
    } catch (error: any & { message: string }) {
      console.error('Error updating token record:', error);
    }
  }
}
