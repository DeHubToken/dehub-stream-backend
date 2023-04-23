require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { overrideOptions } = require('../config/constants');
const { Account } = require('../models/Account');
const { Token } = require('../models/Token');

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
    /**
     * update uploads parameter of accounts
     */
    await Account.updateMany({}, { uploads: 0 });
    const uploadedCountForAccounts = await Token.aggregate([
        { $match: { status: 'minted' } },
        {
            $group: {
                _id: '$minter',
                uploads: { $sum: 1 }
            }
        }
    ]);
    for (const account of uploadedCountForAccounts) {
        await Account.updateOne({ address: account._id }, { uploads: account.uploads }, overrideOptions);
    }
    console.log('-- uploads of accounts are calculated');
    process.exit(0);
}