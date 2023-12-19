require('dotenv').config();
const PubNub = require('pubnub');
let mongoose = require('mongoose');
let { config } = require('../config');
const { PPVTransaction } = require('../models/PPVTransaction');
const { WatchHistory } = require('../models/WatchHistory');
const { sleep } = require('../utils/time');
const { publicChatChannelId } = require('../config/constants');
const { getStakedAmountOfAddresses } = require('../utils/web3');
const { Balance } = require('../models/Balance');

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true }, async function (err, db) {
        mongoose.set('useFindAndModify', false);
        mongoose.set('useCreateIndex', true);
        let d = new Date();
        if (err) {
            console.log('[' + d.toLocaleString() + '] ' + 'DB error');
        } else {
            console.log('[' + d.toLocaleString() + '] ' + 'updating ...');
            cron_loop();
        }

    });

async function cron_loop() {
    const addresses = await Balance.find({ address: { $ne: null } }, { address: 1 }).distinct('address');
    console.log('--addresses', addresses.length);
    const stakedResult = await getStakedAmountOfAddresses(addresses);
    console.log('--get all staked amounts');
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        if (!address || address === '0x0000000000000000000000000000000000000000') continue;        
        await Balance.updateOne({ address }, { staked: Number(stakedResult[address]) });
    }
    console.log('--done');
    return;
    const pubnub = new PubNub({
        publishKey: process.env.PUBNUB_PUBKEY,
        subscribeKey: process.env.PUBNUB_SUBKEY,
        userId: "myUniqueUserId",
    });

    pubnub.deleteMessages(
        {
            channel: publicChatChannelId,
            start: "16843258452905625",
            end: `${Date.now()}9290`,
        },
        function (status, response) {
            console.log(status, response);
        }
    );
    return;
    const ppvTxs = await PPVTransaction.find({});
    console.log(ppvTxs[0].createdAt);
    console.log(new Date(Date.now() - config.availableTimeForPPVStream));
    console.log(new Date());
    process.exit(0);
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