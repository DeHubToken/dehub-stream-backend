// migrated at 2023/05/24
require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { Account } = require('../models/Account');

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true }, async function (err, db) {
        mongoose.set('useFindAndModify', false);
        mongoose.set('useCreateIndex', true);
        let d = new Date();
        if (err) {
            console.log('[' + d.toLocaleString() + '] ' + 'DB error');
        } else {
            console.log('[' + d.toLocaleString() + '] ' + 'migrating accounts name');
            cron_loop();
        }

    });

async function cron_loop() {
    /**
     * update displayName and username of accounts
     */
    const accounts = await Account.find({ username: { $ne: null } }).lean();
    // const checkLength = 'statics/avatars/0x5f79aa988d1c7347ae446c6208b0339bb7c2fae9'.length;
    for (const account of accounts) {
        // account.displayName = account.username.trim();
        // account.username = account.username.toLowerCase();
        // if(account.avatarImageUrl.substr(0, checkLength) !== `statics/avatars/${account.address}`)
        // {
        //     console.log('---', account.address, account.avatarImageUrl.substr(0, checkLength));
        // }
        if(accounts.filter(e=>e.username === account.username).length > 1)
        {
            console.log('---', account.address);
        }
        // await account.save();
    }
    process.exit(0);
}