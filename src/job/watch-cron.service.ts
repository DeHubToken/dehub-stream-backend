import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { config } from 'config';
import { EXPIRED_TIME_FOR_MINTING } from 'config/constants';
import { ethers, ZeroAddress } from 'ethers';
import { TokenModel as Token } from 'models/Token';
import { IDCounterModel } from 'models/IDCounter';
import { getCreatorsForTokenIds } from 'common/util/web3';
import { WatchHistoryModel } from 'models/WatchHistory';

const MINT_STATUS = {
    minted: 'minted',
    signed: 'signed',
    pending: 'pending',
    confirmed: 'confirmed',
    failed: 'failed',
}

@Injectable()
export class WatchCronService implements OnModuleInit {
    private readonly logger = new Logger(WatchCronService.name);
    private autoDeleteCronCounter = 0;

    async onModuleInit() {
        this.logger.log("--- starting watch cron")
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async mainLoop() {
        // await this.deleteExpiredTokenItems();
        await this.processWatchHistory();
        // if (this.autoDeleteCronCounter++ % (config.periodOfDeleleCron / 10) == 0) await this.deleteVotedStreams();
    }
    
    async deleteExpiredTokenItems() {
        // @ts-ignore
        const expiredTokenItems = await Token.find({ status: MINT_STATUS.signed, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } });
        if (expiredTokenItems.length < 1) return;
        const tokenItemsByChainIds = await Token.aggregate([
            // @ts-ignore
            { $match: { status: MINT_STATUS.signed, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } } },
            {
                $lookup: {
                    from: 'collections',
                    localField: 'contractAddress',
                    foreignField: 'address',
                    as: 'collection'
                }
            },
            {
                $group: {
                    _id: "$chainId",
                    nfts: { $push: { address: "$contractAddress", tokenId: "$tokenId", collection: "$collection" } }
                }
            }
        ]);
        const tokenItemsToDelete = [];
        const mintedTokenIds = [];
        for (const nftItems of tokenItemsByChainIds) {
            const chainId = nftItems._id || config.defaultChainId;
            this.logger.log(`chainId: ${chainId}`);
            const aa = [];
            nftItems.nfts.map(e => {
                const a = { type: '721', address: e.address, tokenId: e.tokenId };
                if (e.collection?.[0]?.type === '1155') a.type = '1155';
                aa.push(a);
            });
            // console.log(aa.filter((c, index) => aa.findIndex(e=>e.address === c.address) === index));
            const creators = await getCreatorsForTokenIds(chainId, aa);
            if (creators) {
                for (const nftItem of nftItems.nfts) {
                    if (creators[nftItem.tokenId] && creators[nftItem.tokenId] !== ZeroAddress) {
                        mintedTokenIds.push(nftItem.tokenId);
                    }
                    else {
                        tokenItemsToDelete.push(expiredTokenItems.find(e => e.tokenId === nftItem.tokenId));
                    }
                }
            }
        }
        const deletedTokenIds = tokenItemsToDelete.map(e => e.tokenId);
        if (deletedTokenIds.length > 0) {
            this.logger.log(`---deleted tokens: ${deletedTokenIds}`);
            await IDCounterModel.updateOne({ id: 'tokenId' }, { $push: { expiredIds: deletedTokenIds } });
            const result = await Token.updateMany({ tokenId: { $in: deletedTokenIds } }, { status: 'failed' });
            this.logger.log(   `--deleted expired tokens: [${deletedTokenIds.length}] ${result}`);
        }
    
        if (mintedTokenIds.length > 0) {
            this.logger.log(`---minted:, ${mintedTokenIds}`);
            const result2 = await Token.updateMany({ tokenId: { $in: mintedTokenIds } }, { status: 'checking' });
            this.logger.log(`--checking tokens, ${result2}`);
        }
    }

    async processWatchHistory() {
        let pendingStreamsForProcessing = await WatchHistoryModel.find({ $or: [{ status: null }, { status: 'created' }] }).lean();
        this.logger.log(`--processing watch streams ${pendingStreamsForProcessing.length}`);
        for (const watchStream of pendingStreamsForProcessing) {
            const _id = watchStream._id;
            // @ts-ignore
            const watchedTime = watchStream.exitedAt.getTime() - watchStream.createdAt.getTime();
            const tokenItem = await Token.findOne({ tokenId: watchStream.tokenId }, { videoDuration: 1, _id: 0 }).lean();
            let minimumWatchTime = tokenItem.videoDuration * 300;
            if (minimumWatchTime < 6000) minimumWatchTime = 100; // shorter than 20s
            if (tokenItem && watchedTime >= (Math.min(config.watchTimeForConfirming, minimumWatchTime))) {
                const tokenFilter = { tokenId: watchStream.tokenId };
                // await payBounty(watchStream.watcherAddress, watchStream.tokenId, RewardType.BountyForViewer);
                await WatchHistoryModel.updateOne({ _id }, { status: 'confirmed' });
                await Token.updateOne(tokenFilter, { $inc: { views: 1 } });
            } else if (watchStream.exitedAt < new Date(Date.now() - 2 * config.extraPeriodForHistory)) {
                await WatchHistoryModel.deleteOne({ _id });
            }
        }
    }
    
    // async deleteVotedStreams() {
    //     console.log('-- checking voted streams');
    //     const tokenItems = await Token.find({ status: { $ne: 'deleted' }, ['totalVotes.against']: { $gte: config.votesForDeleting * 0.9 } });
    //     for (const tokenItem of tokenItems) {
    //         await deleteVotedStream(tokenItem);
    //     }
    // }

}
