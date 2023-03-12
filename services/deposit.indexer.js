const mongoose = require("mongoose");
require('dotenv').config();
const ethers = require('ethers');
const { Transaction } = require("../models/Transaction");
const ContractAbi = require('../abis/VaultV2.json');
const erc20ContractAbi = require('../abis/erc20.json');
const { normalizeAddress } = require("../utils/format");
const { vaultContractAddresses, ChainId, dhbTokenAddresses, overrideOptions, supportedNetworks, supportedTokens, supportedTokensForLockContent } = require("../config/constants");
const { config } = require('../config');
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { Balance } = require("../models/Balance");
const { getTokenByTokenAddress, getTokenHistories } = require("../utils/web3");
const { sleep } = require("../utils/time");
const { isInserted } = require("../utils/db");

const networkName = (process?.argv?.[2] || "bsc");
const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
if (!curNetwork) process.exit('no supported network!');
const chainId = curNetwork.chainId;
console.log("---deposit indexer for:", networkName, 'chainId:', chainId);
const tokens = supportedTokens.filter(e => e.chainId === chainId);
const provider = new ethers.providers.JsonRpcProvider(curNetwork.rpcUrls[0]);

const vaultContract = new ethers.Contract(vaultContractAddresses[curNetwork.chainId], ContractAbi, provider);

async function DepositEventListener(from, tokenAddress, amount, logInfo) {
    const { transactionHash, logIndex, blockNumber } = logInfo;
    const token = getTokenByTokenAddress(tokenAddress, chainId);
    tokenAddress = normalizeAddress(tokenAddress);
    const realAmount = Number(ethers.utils.formatUnits(amount, token.decimals));
    const address = normalizeAddress(from);

    console.log("---- checked deposit", address, realAmount);
    // let account;
    try {
        const result = await Transaction.updateOne({ txHash: transactionHash, logIndex, chainId },
            {
                amount: realAmount, from: address, tokenAddress: tokenAddress,
                to: normalizeAddress(vaultContract.address), blockNumber,
                type: 'DEPOSIT'
            },
            overrideOptions);
        await Balance.updateOne({ address, chainId, tokenAddress },
            { $inc: { deposited: realAmount, balance: realAmount } }, overrideOptions);
    } catch (error) {
        console.log("--- token find error");
    }

}

async function ClaimEventListener(id, tokenAddress, to, amount, timestamp, logInfo) {
    const { transactionHash, logIndex, blockNumber } = logInfo;
    const token = getTokenByTokenAddress(tokenAddress, chainId);
    tokenAddress = normalizeAddress(tokenAddress);
    const realAmount = Number(ethers.utils.formatUnits(amount, token.decimals));
    const address = normalizeAddress(to);
    console.log("---- checked claim", Number(id.toString()), address, realAmount, Number(timestamp.toString()));
    // let account;
    try {
        const result = await Transaction.updateOne({ txHash: transactionHash, logIndex, chainId },
            {
                amount: realAmount, from: address, tokenAddress: tokenAddress,
                to: normalizeAddress(vaultContract.address), blockNumber,
                type: 'CLAIM'
            },
            overrideOptions);
        await ClaimTransaction.updateOne({ id: Number(id.toString()), chainId, tokenAddress, receiverAddress: address, amount: realAmount, timestamp: Number(timestamp.toString()) },
            { txHash: transactionHash, logIndex, status: 'confirmed' },
            overrideOptions);
        await Balance.updateOne({ address, chainId, tokenAddress },
            { $inc: { claimed: realAmount, pending: -realAmount } }, overrideOptions);
    } catch (error) {
        console.log("--- token find error", error);
    }

}

async function TransferEventListener(from, to, value, logInfo) {
    const { transactionHash, logIndex, blockNumber } = logInfo;

    const fromAddress = normalizeAddress(from);
    const toAddress = normalizeAddress(to);
    const tokenAddress = normalizeAddress(logInfo.address);
    const token = getTokenByTokenAddress(tokenAddress, chainId);
    const realAmount = Number(ethers.utils.formatUnits(value, token.decimals));
    console.log("---- checked transfer", tokenAddress, toAddress, realAmount);
    try {
        const updatedResult = await Transaction.updateOne({ txHash: transactionHash, logIndex, chainId },
            { amount: realAmount, from: fromAddress, to: toAddress, tokenAddress, blockNumber, type: 'TRANSFER' },
            overrideOptions);
        if (isInserted(updatedResult)) {
        await Balance.updateOne({ address: toAddress, chainId, tokenAddress },
            { $inc: { walletBalance: realAmount } }, overrideOptions);        
        await Balance.updateOne({ address: fromAddress, chainId, tokenAddress },
            { $inc: { walletBalance: -realAmount } }, overrideOptions);
        }
    } catch (error) {
        console.log("--- token find error");
    }
}

async function loadHistory(tokenItem) {
    const transactionItems = await Transaction.find({ type: 'TRANSFER', tokenAddress: normalizeAddress(tokenItem.address), chainId: tokenItem.chainId }).sort({ blockNumber: -1 }).limit(1);
    let nowDate = new Date();
    let lastDayDate = nowDate;
    lastDayDate.setDate(nowDate.getDate() - 1);
    const latestBlock = await provider.getBlockNumber();
    if (transactionItems?.length < 1 || transactionItems[0].blockNumber < latestBlock - 3000) {
        let firstBlock = transactionItems?.[0]?.blockNumber || tokenItem.mintBlockNumber;
        await sleep(200);
        const limit = 3000;
        let totalCount = 0;
        while (firstBlock <= latestBlock) {
            try {
                const historyData = await getTokenHistories(firstBlock, firstBlock + limit - 1, tokenItem.address, tokenItem.chainId);
                console.log(historyData.result?.length, firstBlock, historyData?.toBlock);
                for (const historyItem of historyData?.result) {
                    await TransferEventListener(historyItem.from, historyItem.to, historyItem.value, historyItem.logInfo);                    
                }
                totalCount+=historyData.result?.length;
            }
            catch (err) {
                console.log('--error fetch', err);
                await sleep(1000);
                firstBlock -= limit;
            }
            await sleep(200);
            firstBlock += limit;
        }
        console.log('load historical data ', totalCount);
    }
}
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
/// -- transfer listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(' -- starting deposit indexer...');
        // fetching balance in vault
        if (vaultContract) {
            vaultContract.on('UserDeposit', DepositEventListener);
            vaultContract.on('Claim', ClaimEventListener);
        }
        // fetching token balance only for locked content 
        const tokens = supportedTokensForLockContent.filter(e => e.chainId === chainId);
        for (i = 0; i < tokens.length; i++) {
            const tokenItem = tokens[i];
            const tokenContract = new ethers.Contract(tokenItem.address, erc20ContractAbi, provider);
            console.log('supported token: ', tokenItem.address);
            await loadHistory(tokenItem);
            tokenContract.on('Transfer', TransferEventListener);
        }
    });