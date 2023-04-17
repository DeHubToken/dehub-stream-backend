const mongoose = require("mongoose");
require('dotenv').config()
const { config } = require("../config");
const { supportedNetworks, overrideOptions } = require("../config/constants");
const { Setting } = require("../models/Setting");
const { Token } = require("../models/Token");
const { Transaction } = require("../models/Transaction");
const { isInserted } = require("../utils/db");
const { normalizeAddress } = require("../utils/format");
const { getCollectionContract, getCollectionHistories, getCreatorsOfCollection, getYunistakingHistories, getStakedTimes } = require("../utils/web3");
const { Balance } = require("../models/Balance");

const networkName = (process?.argv?.[2] || (config.isDevMode ? "goerli" : "mainnet"));
const collectionContract = getCollectionContract(networkName);
if (!collectionContract) {
    console.log('---- not supported network', networkName);
    process.exit();
}
const provider = collectionContract.provider;
const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
const chainId = curNetwork.chainId;
const zeroAddress = '0x0000000000000000000000000000000000000000';

async function TxEventListener(from, to, tokenId, amount, logInfo) {
    const { transactionHash, logIndex, address, blockNumber } = logInfo
    const tokenIdInt = parseInt(tokenId.toString());
    amount = parseInt(amount.toString());
    const toAddress = normalizeAddress(to);
    const fromAddress = normalizeAddress(from);
    let updateData = { owner: toAddress };
    const tokenAddress = normalizeAddress(collectionContract.address);
    const updateResult = await Transaction.updateOne(
        { chainId, txHash: transactionHash, logIndex },
        { amount, from: fromAddress, to: toAddress, tokenAddress, type: 'TRANSFER', blockNumber },
        overrideOptions);

    if (!isInserted(updateResult)) return;

    await Balance.updateOne({ address: toAddress, chainId, tokenAddress }, { walletBalance: amount }, overrideOptions);
    if (fromAddress === zeroAddress) {
        updateData = { ...updateData, minter: toAddress, status: 'minted', totalSupply: amount };
        console.log('--minted', tokenAddress, tokenIdInt, toAddress);
        await Token.findOneAndUpdate({ contractAddress: collectionContract.address.toLowerCase(), tokenId: tokenIdInt, chainId }, updateData, { new: true, upsert: true });
    } else {
        await Balance.updateOne({ address: fromAddress, chainId, tokenAddress }, { walletBalance: -amount }, overrideOptions);
    }
    console.log(`### transfer: ${tokenIdInt} ${fromAddress}->${toAddress}`, amount, chainId);
}

async function cronLoop() {
    const latestBlock = await provider.getBlockNumber();
    let setting = await Setting.findOne({}).lean();
    const startBlockNumber = (setting?.lastFetchedBlock?.[chainId] || curNetwork.startBlockNumber) + 1;
    const endBlockNumber = startBlockNumber + config.blockLimitsForFetching - 1;
    const fetchedEndBlockNumber = Math.min(endBlockNumber, latestBlock);
    const fetchedData = await getCollectionHistories(startBlockNumber, endBlockNumber, collectionContract.address, chainId);
    if (fetchedData?.result) {
        for (const fetchedItem of fetchedData.result) {
            await TxEventListener(fetchedItem.from, fetchedItem.to, fetchedItem.tokenId, fetchedItem.amount, fetchedItem.logInfo);
        }
    }
    await Setting.updateOne({}, { lastFetchedBlock: { [chainId]: fetchedEndBlockNumber } }, overrideOptions);
    console.log('--', startBlockNumber, fetchedEndBlockNumber);
    setTimeout(cronLoop, 10 * 1000);
}
/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- starting transfer and stake cron...');
        cronLoop();
    });