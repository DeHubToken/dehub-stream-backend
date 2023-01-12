require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { WatchHistory } = require('../models/WatchHistory');
const { sleep } = require('../utils/time');

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true }, async function (err, db) {
        mongoose.set('useFindAndModify', false);
        mongoose.set('useCreateIndex', true);
        let d = new Date();
        if (err) {
            console.log('[' + d.toLocaleString() + '] ' + 'DB error');
        } else {
            console.log('[' + d.toLocaleString() + '] ' + ' check games ...');
            cron_loop();
        }

    });

async function cron_loop() {
    const tokenId = 2;
    const account = "xxxx";
    let curTime = new Date();
    let result = await WatchHistory.updateOne({ tokenId, watcherAddress: account, exitedAt: { $gt: new Date(curTime - 20000) } }, { exitedAt: curTime }, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log('-- update 1', result);
    await sleep(1000);
    curTime = new Date();
    result = await WatchHistory.updateOne({ tokenId, watcherAddress: account, exitedAt: { $gt: new Date(curTime - 20000) } }, { exitedAt: curTime }, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log('-- update 2', result);
    process.exit(0);
}