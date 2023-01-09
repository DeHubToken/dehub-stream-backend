const mongoose = require("mongoose")
require('dotenv').config()
const ethers = require('ethers');
const { BigNumber } = ethers
const { Transaction } = require("../models/Transaction");
const ContractAbi = require('../abis/GameVault.json');
const erc20ContractAbi = require('../abis/erc20.json');
const { Account } = require("../models/Account");
const { normalizeAddress } = require("../utils/format");
const { vaultContractAddresses, ChainId, dhbTokenAddresses, overrideOptions, supportedNetworks, supportedTokens } = require("../config/constants");
const { config } = require('../config');
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { Balance } = require("../models/Balance");
const { getTokenByTokenAddress } = require("../utils/web3");

const networkName = (process?.argv?.[2] || "bsctest");
const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
if (!curNetwork) process.exit('no supported network!');
const chainId = curNetwork.chainId;
console.log("---deposit indexer for:", networkName, 'chainId:', chainId);
const tokens = supportedTokens.filter(e => e.chainId === chainId);
const provider = new ethers.providers.JsonRpcProvider(curNetwork.rpcUrls[0]);

const VaultContract = new ethers.Contract(vaultContractAddresses[curNetwork.chainId], ContractAbi, provider);
// const dhbContract = new ethers.Contract(dhbTokenAddresses[curNetwork.chainId], erc20ContractAbi, provider);

const zeroAddress = '0x0000000000000000000000000000000000000000';
async function DepositEventListener(from, tokenAddress, amount, logInfo) {
    const { transactionHash, logIndex } = logInfo

    // if (from.toString().toLowerCase() != zeroAddress) return;
    // const toAddress = to.toString().toLowerCase();
    // console.log('--minted', tokenId, toAddress,);
    const token = getTokenByTokenAddress(tokenAddress);
    tokenAddress = normalizeAddress(tokenAddress);
    const realAmount = Number(ethers.utils.formatUnits(amount, token.decimals));
    const address = normalizeAddress(from);

    console.log("---- checked deposit", address, realAmount);
    // let account;
    try {
        const result = await Transaction.findOneAndUpdate({ txHash: transactionHash, logIndex, chainId },
            { amount: realAmount, from: address, tokenAddress: tokenAddress, to: normalizeAddress(VaultContract.address) },
            { new: true, upsert: true, returnOriginal: false });
        await Balance.findOneAndUpdate({ address, chainId, tokenAddress },
            { $inc: { depositedBalance: realAmount, balance: realAmount } }, { new: true, upsert: true, returnOriginal: false });
        // account = await Account.findOneAndUpdate({ address: from.toString().toLowerCase() },
        //     { $inc: { depositedBalance: realAmount, balance: realAmount } }, { new: true, upsert: true, returnOriginal: false });
    } catch (error) {
        console.log("--- token find error");
    }

}
async function ClaimEventListener(tokenAddress, to, amount, timestamp, logInfo) {
    const { transactionHash, logIndex } = logInfo
    // if (from.toString().toLowerCase() != zeroAddress) return;
    // const toAddress = to.toString().toLowerCase();
    // console.log('--minted', tokenId, toAddress,);
    const realAmount = Number(ethers.utils.formatUnits(amount, 18));
    const address = normalizeAddress(to);
    console.log("---- checked claim", address, realAmount, Number(timestamp.toString()));
    let account;
    try {
        await ClaimTransaction.findOneAndUpdate({ receiverAddress: address, amount: realAmount, timestamp: Number(timestamp.toString()) },
            { txHash: transactionHash, logIndex },
            { new: true, upsert: true, returnOriginal: false });
        account = await Account.findOneAndUpdate({ address },
            { $inc: { pendingBalance: -realAmount } }, { new: true, upsert: true, returnOriginal: false });
    } catch (error) {
        console.log("--- token find error", error);
    }

}
// async function TransferEventListener(from, to, value, logInfo) {
//     const { transactionHash, logIndex } = logInfo

//     const realAmount = Number(ethers.utils.formatUnits(value, 18));
//     const fromAddress = normalizeAddress(from);
//     const toAddress = normalizeAddress(to);
//     console.log("---- checked transfer", toAddress, realAmount);
//     let account;
//     try {
//         await Transaction.findOneAndUpdate({ txHash: transactionHash, logIndex },
//             { amount: realAmount, from: fromAddress, to: toAddress, tokenAddress: normalizeAddress(dhbContract.address) },
//             overrideOptions);
//         let updateForFromAccount = { $inc: { dhbBalance: -realAmount } };
//         if (toAddress === normalizeAddress(VaultContract.address)) {
//             updateForFromAccount.$inc.balance = realAmount;
//             updateForFromAccount.$inc.depositedBalance = realAmount;
//         }
//         await Account.updateOne({ address: fromAddress }, updateForFromAccount, overrideOptions);
//         account = await Account.findOneAndUpdate({ address: toAddress }, { $inc: { dhbBalance: realAmount } }, overrideOptions);

//     } catch (error) {
//         console.log("--- token find error");
//     }

// }

mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
/// -- transfer listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(' -- starting deposit indexer...');
        VaultContract.on('UserDeposit', DepositEventListener)
        VaultContract.on('Claim', ClaimEventListener)
        // VaultContract.on('Deposit', TransferEventListener)
        // await getPastEvent('Transfer')
    });