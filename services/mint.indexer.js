const mongoose = require("mongoose")
require('dotenv').config()
const ethers = require('ethers');
// const { BigNumber } = ethers
// const fs = require('fs');
// const Token = require('../models/Token')

const ContractAbi = require('../abis/StreamNft.json');
const { config } = require("../config");
const { Token } = require("../models/Token");
// const { EXPIRED_TIME_FOR_MINTING } = require("../shared/contants");
// const IDCounter = require("../models/IDCounter");
// const privatekey = require("../privatekey");
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_ENDPOINT);

const NFTContract = new ethers.Contract(process.env.DEFAULT_COLLECTION, ContractAbi, provider)

// const MINT_STATUS = {
//     minted: 'minted',
//     signed: 'signed',
//     pending: 'pending'
// }
const zeroAddress = '0x0000000000000000000000000000000000000000';

async function TxEventListener(from, to, tokenId, logInfo) {
    // const { transactionHash, logIndex } = logInfo

    const tokenIdInt = parseInt(tokenId.toString());
    const toAddress = to.toString().toLowerCase();
    let updateData = { owner: toAddress };
    
    if (from.toString().toLowerCase() === zeroAddress)
        {
            updateData = { ...updateData, minter: toAddress, status: 'minted' };
            console.log('--minted', NFTContract.address.toLowerCase(), tokenIdInt, toAddress);
        }
    let updatedTokenItem;
    try {
        updatedTokenItem = await Token.findOneAndUpdate({ contractAddress: NFTContract.address.toLowerCase(), tokenId: tokenIdInt, }, updateData, { new: true, upsert: true });
    } catch (error) {
        console.log("--- token find error");
    }
    if (!updatedTokenItem) {
        console.log("Not found record");
        return
    } else {
        console.log(`### transfer: ${tokenId} ${from.toString().toLowerCase()}->${toAddress}`);
    }
}

/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- starting mint indexer...');
        NFTContract.on('Transfer', TxEventListener)
        // await getPastEvent('Transfer')
    });