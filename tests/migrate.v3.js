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
    const accounts = await Account.find({ username: { $ne: null } });
    console.log('update accounts:', accounts.length);
    for (const account of accounts) {
        account.displayName = account.username.trim();
        account.username = account.username.trim().toLowerCase().replace(" ", "_");        
        await account.save();
    }
    process.exit(0);
}