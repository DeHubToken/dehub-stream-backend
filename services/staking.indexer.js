const mongoose = require("mongoose");
require('dotenv').config();
const ethers = require('ethers');
const ContractAbi = require('../abis/StakingDHB.json');
const { normalizeAddress } = require("../utils/format");
const { stakingContractAddresses, ChainId, overrideOptions } = require("../config/constants");
const { config } = require('../config');
const { Balance } = require("../models/Balance");
const { Transaction } = require("../models/Transaction");
const { getTokenByTokenAddress, getStakeHistories } = require("../utils/web3");
const { sleep } = require('../utils/time');
const { isInserted } = require('../utils/db');

const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC_ENDPOINT);
const chainId = ChainId.BSC_MAINNET;
const stakingContract = new ethers.Contract(stakingContractAddresses[chainId], ContractAbi, provider);
const tokenAddress = normalizeAddress("0x680D3113caf77B61b510f332D5Ef4cf5b41A761D");

async function StakeEventListener(user, period, amount, stakeAt, rewardIndex, tierIndex, logInfo) {
    const { transactionHash, logIndex } = logInfo;
    const realAmount = Number(ethers.utils.formatUnits(amount, 18));
    const address = normalizeAddress(user);
    console.log("---- checked stake:", address, realAmount);
    try {
        const updateResult = await Transaction.updateOne({ txHash: transactionHash, logIndex, chainId },
            { amount: realAmount, from: address, tokenAddress: tokenAddress, to: normalizeAddress(stakingContract.address), type: 'STAKE' },
            overrideOptions);
        if (isInserted(updateResult))
            await Balance.updateOne({ address, chainId, tokenAddress },
                { $inc: { staked: realAmount } }, overrideOptions);
    } catch (error) {
        console.log("--- update stake error", error);
    }
}

async function UnStakeEventListener(user, actualAmount, transferAmount, unstakeAt, logInfo) {
    const { transactionHash, logIndex } = logInfo;
    const realAmount = Number(ethers.utils.formatUnits(actualAmount, 18));
    const address = normalizeAddress(user);
    console.log("---- checked unstake:", address, realAmount);
    try {
        const updateResult = await Transaction.updateOne({ txHash: transactionHash, logIndex, chainId },
            { amount: realAmount, from: address, tokenAddress: tokenAddress, to: normalizeAddress(stakingContract.address), type: 'UNSTAKE' },
            overrideOptions);
        if (isInserted(updateResult)) await Balance.updateOne({ address, chainId, tokenAddress },
            { $inc: { staked: -realAmount } }, overrideOptions);
    } catch (error) {
        console.log("--- upate unstake error");
    }
}

mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
/// -- transfer listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(' -- starting staking indexer...');
        const balanceItems = await Balance.find({ staked: { $gt: 0 } }).sort({ updatedAt: -1 }).limit(1);
        if (balanceItems?.length < 1) {
            let firstBlock = 25835683;
            const latestBlock = await provider.getBlockNumber();
            await sleep(200);
            const limit = 3000;
            let totalStakedData = [];
            while (firstBlock <= latestBlock) {
                try {
                    const stakingData = await getStakeHistories(firstBlock, firstBlock + limit - 1);
                    console.log(stakingData.result?.length, firstBlock, stakingData?.toBlock);
                    for (const stakedItem of stakingData?.result) {
                        if (stakedItem.event === 'Staked') await StakeEventListener(stakedItem.user, 0, stakedItem.amount, 0, 0, 0, stakedItem.logInfo);
                        else await UnStakeEventListener(stakedItem.user, stakedItem.amount, 0, 0, stakedItem.logInfo);
                    }
                    if (stakingData.result?.length > 0) totalStakedData = totalStakedData.concat(stakingData.result);
                }
                catch (err) {
                    console.log('--error fetch', err);
                    await sleep(1000);
                    firstBlock -= limit;
                }
                await sleep(200);
                firstBlock += limit;
            }
            console.log('load historical data for staking', totalStakedData.length);
        }

        // fetching balance in vault
        if (stakingContract) {
            stakingContract.on('Staked', StakeEventListener);
            stakingContract.on('Unstaked', UnStakeEventListener);
        }
    });