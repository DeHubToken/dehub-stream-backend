const mongoose = require("mongoose");
require('dotenv').config();
const { overrideOptions, supportedNetworks, ChainId } = require("../config/constants");
const { config } = require('../config');

const { Transaction } = require("../models/Transaction");
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { Balance } = require("../models/Balance");
const { Setting } = require("../models/Setting");

const { isInserted, isUpdated } = require("../utils/db");
const { getHistoryFromGraphGL } = require("../utils/graphql");

const networkName = (process?.argv?.[2] || "bsc");
const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
if (!curNetwork) process.exit('no supported network!');
const chainId = curNetwork.chainId;
console.log("---deposit cron for:", networkName, 'chainId:', chainId);
const graphUrl = curNetwork.graphUrl;

/**
 * 
 * @param {object} transfer data from graphql
 */
async function updateWalletBalanceFromTransfer(transfer) {
    const from = transfer.from.id
    const to = transfer.to.id
    const amount = transfer.realAmount;
    const logIndex = transfer.logIndex
    const txHash = transfer.transaction.id
    const tokenAddress = transfer.tokenAddress;
    const fromBalance = transfer.from.balances.find(e => e.token.id === tokenAddress)?.balance;
    const toBalance = transfer.to.balances.find(e => e.token.id === tokenAddress)?.balance;
    const blockNumber = transfer.blockNumber;
    const updatedResult = await Transaction.updateOne({ txHash, logIndex, chainId },
        { amount, from, to, tokenAddress, blockNumber, type: 'TRANSFER' },
        overrideOptions);
    // there is no log for transfer
    // if (isInserted(updatedResult)) {
        // console.log('---not processed tx', 'TRANSFER', txHash, logIndex);
    // }
    // update wallet balance directly
    await Balance.updateOne({ address: from, chainId, tokenAddress }, { walletBalance: fromBalance }, overrideOptions);
    await Balance.updateOne({ address: to, chainId, tokenAddress }, { walletBalance: toBalance }, overrideOptions);
}

async function updateBalanceFromProtocolTx(protocolTx) {
    const type = protocolTx.type;
    const address = protocolTx.address;
    const tokenAddress = protocolTx.token.id;
    const amount = Number(protocolTx.amount);
    const txHash = protocolTx.transaction.id;
    const logIndex = Number(protocolTx.logIndex);

    const balanceItem = protocolTx.account.balances.find(e => e.token.id === tokenAddress)
    const updateResult = await Transaction.updateOne(
        { chainId, txHash, logIndex },
        { amount, from: address, tokenAddress, type: type, blockNumber: protocolTx.blockNumber },
        overrideOptions);
    if (isInserted(updateResult)) {
        console.log('---not processed tx', type, txHash, logIndex);
    }
    if (type === 'STAKE' || type === 'UNSTAKE') {
        await Balance.updateOne({ address, chainId, tokenAddress }, { staked: balanceItem.staked }, overrideOptions);
    }
    else if (type === 'DEPOSIT') {
        if (isInserted(updateResult)) {
            console.log('---update deposit:', address, chainId, tokenAddress, amount);
            await Balance.updateOne({ address, chainId, tokenAddress },
                { $inc: { deposited: amount, balance: amount } }, overrideOptions);
        }
    }
    else if (type === 'CLAIM') {
        const id = Number(protocolTx.id);
        const claimFilter = { id, chainId, tokenAddress, receiverAddress: address };
        const claimItem = await ClaimTransaction.findOne(claimFilter, { status: 1 }).lean();
        if (claimItem.status === 'failed') {
            console.log('--failed claim', id);
        }
        const updateClaimTxResult = await ClaimTransaction.updateOne(
            { ...claimFilter, status: { $ne: 'confirmed' } },
            { txHash, logIndex, status: 'confirmed' });
        if (isUpdated(updateClaimTxResult) && isInserted(updateResult)) {
            console.log('---update claim:', address, chainId, tokenAddress, amount);
            const updatedBalanceItem = await Balance.findOneAndUpdate({ address, chainId, tokenAddress },
                { $inc: { claimed: amount, pending: -amount } }, overrideOptions);
            if (updatedBalanceItem.pending < 0) {
                console.log('-----error claim', id, txHash, logIndex, amount);
            }
        }
        else if (!claimItem) {
            console.log('--- fake claim: ', Number(protocolTx.id), txHash)
        }
    }
}

async function cronLoop() {
    let setting = await Setting.findOne({}).lean();
    if (!setting) {
        setting = await Setting.findOneAndUpdate({}, { lastFetchedBlock: { [chainId]: curNetwork.startBlockNumber } }, overrideOptions);
    }
    // always transfer transactions is more than protocol transactions
    const startBlockNumber = (setting.lastBlockFetchedForTransfer?.[chainId] || curNetwork.startBlockNumber) + 1;
    const endBlockNumber = startBlockNumber + config.blockLimitsForFetching - 1;
    const fetchedData = await getHistoryFromGraphGL(startBlockNumber, endBlockNumber, graphUrl);
    const lastSyncedBlockNumber = fetchedData?._meta?.block?.number;
    const lastSyncedTimestamp = fetchedData?._meta?.block?.timestamp || 0;
    const diffTimestamp = Date.now() / 1000 - lastSyncedTimestamp;
    if (diffTimestamp > 60) console.log('---not sync graph!', Math.round(diffTimestamp));
    await Setting.updateOne({}, { [`syncedDiffTimeOfGraph.${chainId}`]: diffTimestamp }, overrideOptions);
    let lastBlockFetchedForTransfer = 0;
    let lastBlockFetchedForProtocolTx = 0;
    if (lastSyncedBlockNumber >= startBlockNumber) {
        const transfers = fetchedData.transfers;
        const fetchedEndBlockNumber = Math.min(endBlockNumber, lastSyncedBlockNumber);
        for (const transfer of transfers) {
            await updateWalletBalanceFromTransfer(transfer);
        }
        // full fetching
        if (transfers.length < config.itemLimitsForFetching) lastBlockFetchedForTransfer = fetchedEndBlockNumber;
        else lastBlockFetchedForTransfer = transfers[0].blockNumber - 1; // limited with 500 options        
        const protocolTxes = fetchedData.protocolTxes;
        for (const protocolTx of protocolTxes) {
            await updateBalanceFromProtocolTx(protocolTx);
        }
        // full fetching
        if (protocolTxes.length < config.itemLimitsForFetching) lastBlockFetchedForProtocolTx = fetchedEndBlockNumber;
        else lastBlockFetchedForProtocolTx = protocolTxes[0].blockNumber - 1; // limited with 500 options
        console.log("--fetched", startBlockNumber, lastBlockFetchedForTransfer, lastBlockFetchedForProtocolTx, transfers.length, protocolTxes.length);
        await Setting.updateOne({}, {
            lastBlockFetchedForTransfer: { [chainId]: lastBlockFetchedForTransfer },
            lastBlockFetchedForProtocolTx: { [chainId]: lastBlockFetchedForProtocolTx }
        });
    }
    else {
        console.log('-- no data', chainId, 'synced block:', lastSyncedBlockNumber);
        // not fetched and synced
    }
    setTimeout(cronLoop, 10 * 1000);
}
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
/// -- transfer listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(' -- starting deposit cron...');
        cronLoop();
    });