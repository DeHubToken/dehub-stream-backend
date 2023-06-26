// migrated at 2023/06/25
require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { Account } = require('../models/Account');
const { Token } = require('../models/Token');
const { Transaction } = require('../models/Transaction');
const { getMintTxesFromGraphGL } = require('../utils/graphql');
const { supportedNetworks } = require('../config/constants');
const { getCollectionHistories, getERC721Histories } = require('../utils/web3');
const { sleep } = require("../utils/time");
const networkName = (process?.argv?.[2] || "bsc");
const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
if (!curNetwork) process.exit('no supported network!');
const chainId = curNetwork.chainId;
console.log("---migrate v5 for:", networkName, 'chainId:', chainId);
const graphUrl = curNetwork.graphUrl;

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true }, async function (err, db) {
        mongoose.set('useFindAndModify', false);
        mongoose.set('useCreateIndex', true);
        let d = new Date();
        if (err) {
            console.log('[' + d.toLocaleString() + '] ' + 'DB error');
        } else {
            console.log('[' + d.toLocaleString() + '] ' + 'migrating mint hashes');
            cron_loop();
        }

    });

async function cron_loop() {
    /**
     * update mintTxHash from graphql
     */
    if (graphUrl) {
        const allMintTxes = await getMintTxesFromGraphGL(graphUrl);
        if (allMintTxes?.nftTransfers) {
            for (let nftTransfer of allMintTxes.nftTransfers) {
                console.log(Number(nftTransfer.tokenId), nftTransfer.id);
                await Token.updateOne({ tokenId: Number(nftTransfer.tokenId), contractAddress: nftTransfer.collection }, { mintTxHash: nftTransfer.transaction.id });
            }
        }
    }

    // update mintTxHash from old contracts
    let startBlockNumber = 26373748;
    // const startBlock = 25445810;
    const endBlock = 27539680;
    // const endBlock = 26398071;    
    const contractAddress = '0x38a29bc1c86bbf263f760c581feb886851a303d7';
    // const contractAddress = '0x5ae62df56ff1e68fb1772a337859b856caeefab6';
    let endBlockNumber = startBlockNumber + config.blockLimitsForFetching - 1;
    do {
        const transctions = await getERC721Histories(startBlockNumber, endBlockNumber, contractAddress, chainId);
        console.log('--transfer transactions', transctions?.result?.length, endBlockNumber);
        if (!transctions?.toBlock) {
            console.log('----error!!!')
            await sleep(1000);
            continue;
        }
        if (transctions?.result?.length > 0) {
            for (let nftTransfer of transctions?.result) {
                console.log(nftTransfer.tokenId, nftTransfer.logInfo.transactionHash);
                await Token.updateOne({ tokenId: nftTransfer.tokenId, contractAddress }, { mintTxHash: nftTransfer.logInfo.transactionHash });
            }
        }
        startBlockNumber = endBlockNumber + 1;
        endBlockNumber = startBlockNumber + config.blockLimitsForFetching - 1;
    }
    while (endBlockNumber <= endBlock)

    process.exit(0);
}