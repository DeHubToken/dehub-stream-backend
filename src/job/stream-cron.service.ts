import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { config } from 'config';
import { RewardType, overrideOptions, supportedNetworks } from 'config/constants';
import { ethers, ZeroAddress } from 'ethers';
import { Balance } from 'models/Balance';
import Setting from 'models/Setting';
import Transaction from 'models/Transaction';
import mongoose from 'mongoose';
// import { getHistoryFromGraphGL } from 'common/util/graphql.js'
import { isInserted } from 'common/util/db';
import { TokenModel as Token } from 'models/Token';
import { AccountModel as Account } from 'models/Account';
import Reward from 'models/Reward';
import { PPVTransactionModel as PPVTransaction } from 'models/PPVTransaction';
import { getHistoryFromGraphGL } from 'common/util/graphql';

@Injectable()
export class StreamCronService implements OnModuleInit {
    private readonly logger = new Logger(StreamCronService.name);

    async onModuleInit() {
        this.logger.log("--- Starting stream Loops")
    }

    // Loops for each chain
    @Cron(CronExpression.EVERY_MINUTE)
    async bscLoop() {
        const networkName = 'bsc';
        await this.mainLoop(networkName)
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async ethLoop() {
        const networkName = 'mainnet';
        await this.mainLoop(networkName)
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async polyLoop() {
        const networkName = 'polygon';
        await this.mainLoop(networkName)
    }

    async mainLoop(networkName) {
        const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
        if (!curNetwork) return this.logger.error(`No supported network! -- ${curNetwork.shortName} ${curNetwork.chainId}`);

        const chainId = curNetwork.chainId;
        const graphUrl = curNetwork.graphUrl;

        const setting = await Setting.findOne({}).lean();
        const startBlockNumber = Number(setting?.lastBlockFetchedForTransfer?.[chainId] || curNetwork.startBlockNumber) + 1;
        const endBlockNumber = startBlockNumber + config.blockLimitsForFetching - 1;
        const fetchedData = await getHistoryFromGraphGL(startBlockNumber, endBlockNumber, graphUrl);

        const lastSyncedBlockNumber = fetchedData?._meta?.block?.number;
        const lastSyncedTimestamp = fetchedData?._meta?.block?.timestamp || 0;
        const diffTimestamp = Date.now() / 1000 - lastSyncedTimestamp;
        if (diffTimestamp > 60) this.logger.log(`~${curNetwork.shortName} ---not sync graph! ${lastSyncedBlockNumber} ${Math.round(diffTimestamp)}`)
        await Setting.updateOne({}, { [`syncedDiffTimeOfGraph.${chainId}`]: diffTimestamp }, overrideOptions);
        let lastBlockFetchedForTransfer = 0;
        let lastBlockFetchedForProtocolTx = 0;
        if (lastSyncedBlockNumber >= startBlockNumber) {
            const transfers = fetchedData.transfers;
            const fetchedEndBlockNumber = Math.min(endBlockNumber, lastSyncedBlockNumber);
            for (const transfer of transfers) {
                await this.updateWalletBalanceFromTransfer(transfer, chainId);
            }
            // full fetching
            if (transfers.length <= config.itemLimitsForFetching) lastBlockFetchedForTransfer = fetchedEndBlockNumber;
            else lastBlockFetchedForTransfer = transfers[0].blockNumber - 1; // limited with 500 options
            const protocolTxes = fetchedData.protocolTxes;
            for (const protocolTx of protocolTxes) {
                await this.registerProtocolTx(protocolTx, chainId);
            }

            const nftTransfers = fetchedData.nftTransfers;
            for (const nftTransfer of nftTransfers) {
                await this.updateStreamCollection(nftTransfer, chainId);
            }

            // full fetching
            if (protocolTxes.length <= config.itemLimitsForFetching) lastBlockFetchedForProtocolTx = fetchedEndBlockNumber;
            else lastBlockFetchedForProtocolTx = protocolTxes[0].blockNumber - 1; // limited with 500 options
            this.logger.log(`~${curNetwork.shortName} ---fetched ${startBlockNumber} ${lastBlockFetchedForTransfer} ${lastBlockFetchedForProtocolTx} ${transfers.length} ${protocolTxes.length}`
            );
            await Setting.updateOne(
                {},
                {
                    [`lastBlockFetchedForTransfer.${chainId}`]: lastBlockFetchedForTransfer,
                    [`lastBlockFetchedForProtocolTx.${chainId}`]: lastBlockFetchedForProtocolTx,
                },
                overrideOptions,
            );
        } else {
            this.logger.log(`~${curNetwork.shortName} -- no data ${chainId} synced block: ${lastSyncedBlockNumber}`);
            // not fetched and synced
        }
    }

    async updateWalletBalanceFromTransfer(transfer, chainId) {
        const from = transfer.from.id;
        const to = transfer.to.id;
        const amount = transfer.realAmount;
        const tokenAddress = transfer.tokenAddress;

        await Transaction.updateOne(
            { txHash: transfer.transaction.id, logIndex: transfer.logIndex, chainId },
            { amount, from, to, tokenAddress, type: 'TRANSFER' },
            overrideOptions,
        );

        const fromBalance = transfer.from.balances.find(e => e.token.id === tokenAddress)?.balance;
        const toBalance = transfer.to.balances.find(e => e.token.id === tokenAddress)?.balance;
        await Balance.updateOne({ address: from, chainId, tokenAddress }, { walletBalance: fromBalance }, overrideOptions);
        await Balance.updateOne({ address: to, chainId, tokenAddress }, { walletBalance: toBalance }, overrideOptions);
    }

    async registerProtocolTx(protocolTx, chainId) {
        const type = protocolTx.type;
        const address = protocolTx.from.id;
        const tokenAddress = protocolTx.token.id;
        const amount = Number(protocolTx.amount);
        const txHash = protocolTx.transaction.id;
        const logIndex = Number(protocolTx.logIndex);
        const tokenId = protocolTx.tokenId;

        const balanceItem = protocolTx.from.balances.find(e => e.token.id === tokenAddress);
        const updateResult = await Transaction.updateOne(
            { chainId, txHash, logIndex },
            {
                amount,
                from: address,
                tokenAddress,
                tokenId,
                type: type,
                blockNumber: protocolTx.blockNumber,
                to: protocolTx?.to?.id,
            },
            overrideOptions,
        );
        if (isInserted(updateResult)) {
            this.logger.log(`---not processed tx ${type} ${txHash} ${logIndex}`);
        }
        if (type === 'STAKE' || type === 'UNSTAKE') {
            await Balance.updateOne({ address, chainId, tokenAddress }, { staked: balanceItem.staked }, overrideOptions);
        } else if (type === 'BOUNTY_COMMENTOR' || type === 'BOUNTY_VIEWER') {
            if (isInserted(updateResult)) {
                await Token.updateOne(
                    { tokenId },
                    { $inc: { [`lockedBounty.${type === 'BOUNTY_VIEWER' ? 'viewer' : 'commentor'}`]: -protocolTx.amount } },
                    overrideOptions,
                );
            }
        } else if (type === 'TIP') {
            if (Number(tokenId) > 0) {
                const updateResult = await Token.updateOne(
                    { tokenId, minter: protocolTx.to.id },
                    { $inc: { totalTips: amount } },
                    overrideOptions,
                );
                this.logger.log(`---tip for token ${updateResult}`);
            }
            await Account.updateOne({ address }, { $inc: { sentTips: amount } }, overrideOptions);
            await Account.updateOne({ address: protocolTx.to.id }, { $inc: { receivedTips: amount }, overrideOptions });
            await Reward.create({
                address: protocolTx.to.id,
                from: address,
                rewardAmount: amount,
                chainId,
                tokenId,
                type: RewardType.Tip,
            });
            this.logger.log(`-----tip done: ${tokenId} ${protocolTx?.to?.id}`);
        } else if (type === 'PPV') {
            await PPVTransaction.create({ address, amount, streamTokenId: tokenId, tokenAddress, chainId });
            const updateResult = await Token.updateOne({ tokenId, minter: protocolTx.to.id }, { $inc: { totalFunds: amount } });
            this.logger.log(`-----ppv ${updateResult}`);
        }
    }

    async updateStreamCollection(nftTransfer, chainId) {
        const tokenIdInt = parseInt(nftTransfer.tokenId.toString());
        const toAddress = nftTransfer.to.id.toLowerCase();
        const from = nftTransfer.from.id.toLowerCase();
        const streamCollectionAddress = nftTransfer.collection.toLowerCase();
        let updateData: any = { owner: toAddress };
        if (from === ZeroAddress) {
            updateData = { ...updateData, minter: toAddress, status: 'minted', mintTxHash: nftTransfer.transaction.id };
            this.logger.log(`--minted ${streamCollectionAddress} ${tokenIdInt} ${toAddress}`);
            await Account.updateOne({ address: toAddress }, { $inc: { uploads: 1 } }, overrideOptions);
        }
        let updatedTokenItem;
        try {
            updatedTokenItem = await Token.findOneAndUpdate(
                { contractAddress: streamCollectionAddress, tokenId: tokenIdInt, chainId },
                updateData,
                overrideOptions,
            );
        } catch (error) {
            this.logger.error('--- token find error');
        }
        if (!updatedTokenItem) {
            this.logger.error('Not found record');
            return;
        } else {
            this.logger.log(`### transfer: ${tokenIdInt} ${from}->${toAddress}`);
        }
    }

}
