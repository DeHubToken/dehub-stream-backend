const mongoose = require("mongoose")
require('dotenv').config()
const ethers = require('ethers');
const { BigNumber } = ethers
const { Transaction } = require("../models/Transaction");
const ContractAbi = require('../abis/GameVault.json');
const { Account } = require("../models/Account");
const { normalizeAddress } = require("../utils/format");
const config = require('../config')();

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_ENDPOINT);

const VaultContract = new ethers.Contract(process.env.VAULT_CONTRACT_ADDRESS, ContractAbi, provider)

const zeroAddress = '0x0000000000000000000000000000000000000000';
async function TxEventListener(from, tokenAddress, amount, logInfo) {
    const { transactionHash, logIndex } = logInfo

    // if (from.toString().toLowerCase() != zeroAddress) return;
    // const toAddress = to.toString().toLowerCase();
    // console.log('--minted', tokenId, toAddress,);
    const realAmount = Number(ethers.utils.formatUnits(amount, 18));
    const address = normalizeAddress(from);
    console.log("---- checked deposit", address, realAmount);
    let account;
    try {
        await Transaction.findOneAndUpdate({ txHash: transactionHash, logIndex },
            { amount: realAmount, from: address, tokenAddress: normalizeAddress(tokenAddress), to: normalizeAddress(VaultContract.address)},
            { new: true, upsert: true, returnOriginal: false });
        account = await Account.findOneAndUpdate({ address: from.toString().toLowerCase() },
            { $inc: { depositedBalance: realAmount, balance: realAmount } }, { new: true, upsert: true, returnOriginal: false });
    } catch (error) {
        console.log("--- token find error");
    }

}
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
/// -- transfer listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.db_name,
    { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(' -- starting deposit indexer...');
        VaultContract.on('UserDeposit', TxEventListener)
        // await getPastEvent('Transfer')
    });