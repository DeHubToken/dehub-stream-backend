require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { supportedChainIds, supportedTokensForLockContent, overrideOptions } = require('../config/constants');
const { Account } = require('../models/Account');
const { Balance } = require('../models/Balance');
const { WatchHistory } = require('../models/WatchHistory');
const { normalizeAddress } = require('../utils/format');
const { sleep } = require('../utils/time');
const { getTokenBalancesOfAddresses } = require('../utils/web3');

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true }, async function (err, db) {
        mongoose.set('useFindAndModify', false);
        mongoose.set('useCreateIndex', true);
        let d = new Date();
        if (err) {
            console.log('[' + d.toLocaleString() + '] ' + 'DB error');
        } else {
            console.log('[' + d.toLocaleString() + '] ' + 'migrating balances');
            cron_loop();
        }

    });

async function cron_loop() {
    const addressList = await Account.find().distinct('address');
    for (let i = 0; i < supportedChainIds.length; i++) {
        chainId = supportedChainIds[i];
        const tokens = supportedTokensForLockContent.filter(e => e.chainId === chainId);
        for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
            const token = tokens[tokenIndex];
            const balances = await getTokenBalancesOfAddresses(addressList, token.address, chainId);
            console.log(balances);
            for (let index = 0; index < addressList.length; index++) {
                const address = addressList[index];
                await Balance.updateOne({ address, tokenAddress: normalizeAddress(token.address), chainId }, { walletBalance: balances[address] }, overrideOptions);
            }
        }
    }
    console.log('--- updated token balacnes ---');
    process.exit(0);
}