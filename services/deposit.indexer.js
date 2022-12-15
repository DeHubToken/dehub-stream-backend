const mongoose = require("mongoose")
require('dotenv').config()
const ethers = require('ethers');
const { BigNumber } = ethers
const { Transaction } = require("../models/Transaction");
const ContractAbi = require('../abis/GameVault.json');
const erc20ContractAbi = require('../abis/erc20.json');
const { Account } = require("../models/Account");
const { normalizeAddress } = require("../utils/format");
const { vaultContractAddresses, ChainId, dhbTokenAddresses, overrideOptions } = require("../config/constants");
const { config } = require('../config');
const { ClaimTransaction } = require("../models/ClaimTransaction");

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_ENDPOINT);

const VaultContract = new ethers.Contract(vaultContractAddresses[ChainId.BSC_TESTNET], ContractAbi, provider);
const dhbContract = new ethers.Contract(dhbTokenAddresses[ChainId.BSC_TESTNET], erc20ContractAbi, provider);

const zeroAddress = '0x0000000000000000000000000000000000000000';
// async function DepositEventListener(from, tokenAddress, amount, logInfo) {
//     const { transactionHash, logIndex } = logInfo

//     // if (from.toString().toLowerCase() != zeroAddress) return;
//     // const toAddress = to.toString().toLowerCase();
//     // console.log('--minted', tokenId, toAddress,);
//     const realAmount = Number(ethers.utils.formatUnits(amount, 18));
//     const address = normalizeAddress(from);
//     console.log("---- checked deposit", address, realAmount);
//     let account;
//     try {
//         await Transaction.findOneAndUpdate({ txHash: transactionHash, logIndex },
//             { amount: realAmount, from: address, tokenAddress: normalizeAddress(tokenAddress), to: normalizeAddress(VaultContract.address) },
//             { new: true, upsert: true, returnOriginal: false });
//         account = await Account.findOneAndUpdate({ address: from.toString().toLowerCase() },
//             { $inc: { depositedBalance: realAmount, balance: realAmount } }, { new: true, upsert: true, returnOriginal: false });
//     } catch (error) {
//         console.log("--- token find error");
//     }

// }
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
async function TransferEventListener(from, to, value, logInfo) {
    const { transactionHash, logIndex } = logInfo

    // if (from.toString().toLowerCase() != zeroAddress) return;
    // const toAddress = to.toString().toLowerCase();
    // console.log('--minted', tokenId, toAddress,);
    const realAmount = Number(ethers.utils.formatUnits(value, 18));
    const fromAddress = normalizeAddress(from);
    const toAddress = normalizeAddress(to);
    console.log("---- checked transfer", toAddress, realAmount);
    let account;
    try {
        await Transaction.findOneAndUpdate({ txHash: transactionHash, logIndex },
            { amount: realAmount, from: fromAddress, to: toAddress, tokenAddress: normalizeAddress(dhbContract.address) },
            overrideOptions);
        let updateForFromAccount = { $inc: { dhbBalance: -realAmount } };
        if (toAddress === normalizeAddress(VaultContract.address)) {
            updateForFromAccount.$inc.balance = realAmount;
            updateForFromAccount.$inc.depositedBalance = realAmount;
        }
        await Account.updateOne({ address: fromAddress }, updateForFromAccount, overrideOptions);
        account = await Account.findOneAndUpdate({ address: toAddress }, { $inc: { dhbBalance: realAmount } }, overrideOptions);

    } catch (error) {
        console.log("--- token find error");
    }

}
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
/// -- transfer listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(' -- starting deposit indexer...');
        // VaultContract.on('UserDeposit', DepositEventListener)
        VaultContract.on('Claim', ClaimEventListener)
        dhbContract.on('Transfer', TransferEventListener)
        // await getPastEvent('Transfer')
    });