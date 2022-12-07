const mongoose = require("mongoose")
require('dotenv').config()
const ethers = require('ethers');
const { BigNumber } = ethers
// const Token = require('../models/Token')

const ContractAbi = require('../abis/StreamNft.json');
const { config } = require("../config");
const { Token } = require("../models/Token");
// const privatekey = require("../privatekey");
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_ENDPOINT);

const NFTContract = new ethers.Contract(process.env.DEFAULT_COLLECTION, ContractAbi, provider)

const MINT_STATUS = {
    minted: 'minted',
    signed: 'signed',
    pending: 'pending'
}

const zeroAddress = '0x0000000000000000000000000000000000000000';
async function TxEventListener(from, to, tokenId, logInfo) {
    const { transactionHash, logIndex } = logInfo

    const tokenIdInt = parseInt(tokenId.toString());
    if (from.toString().toLowerCase() != zeroAddress) return;
    const toAddress = to.toString().toLowerCase();
    console.log('--minted',NFTContract.address.toLowerCase(), tokenIdInt, toAddress,) ;
    let mintedToken;
    try {
        mintedToken = await Token.findOneAndUpdate({ contractAddress: NFTContract.address.toLowerCase(), tokenId: tokenIdInt, }, { minter: toAddress, owner: toAddress, status: 'minted' }, { new: true, upsert: true });
    } catch (error) {
        console.log("--- token find error");
    }
    if (!mintedToken) {
        console.log("Not found record");
        return
    } else {

    }
}

/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- starting mint indexer...');
        NFTContract.on('Transfer', TxEventListener)
        // await getPastEvent('Transfer')
    });