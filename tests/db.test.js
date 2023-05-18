require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { supportedChainIds, supportedTokensForLockContent, overrideOptions } = require('../config/constants');
const { Account } = require('../models/Account');
const { Balance } = require('../models/Balance');
const { WatchHistory } = require('../models/WatchHistory');
const { normalizeAddress } = require('../utils/format');
const { sleep } = require('../utils/time');
const { getTokenBalancesOfAddresses, getERC20TokenBalance } = require('../utils/web3');
const Collection = require('../models/Collection');
const { eligibleBountyForAccount } = require('../utils/validation');
const { Category } = require('../models/Category');

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
    // await Collection.create({address: '0xfc95b63656dac895209e45537ea9f61614d4ac47', type: '1155'});    
    // await Collection.create({address: '0x0737c5383a2fbbe89c30cf2d7f87c2506bac539e', type: '1155'});    
    // console.log(await eligibleBountyForAccount('0x680ED2c604259e0B0A2Dd87cF998C7433d9cF23c', 102));
    await Category.create({name: 'Media'});
    console.log('--- updated db ---');
    process.exit(0);
}