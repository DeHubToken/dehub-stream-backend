require('dotenv').config();
let mongoose = require('mongoose');
let { config } = require('../config');
const { overrideOptions } = require('../config/constants');
const { Account } = require('../models/Account');
const { Token } = require('../models/Token');
const fs = require('fs');
const { defaultVideoFilePath } = require('../utils/file');

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

    const tokenItems = await Token.find({ ['videoInfo.size']: null }, { tokenId: 1, videoExt: 1 }).lean();
    for (const tokenItem of tokenItems) {
        const videoFilePath = defaultVideoFilePath(tokenItem.tokenId, tokenItem.videoExt);
        let videoStat;
        try {
            videoStat = fs.statSync(videoFilePath);
        } catch (e) {
            console.log('----error when fetching for video size', e);
        }
        if (videoStat) {
            const fileSize = videoStat?.size;
            const result = await Token.updateOne({ tokenId: tokenItem.tokenId }, { ['videoInfo.size']: fileSize });
            console.log(tokenItem.tokenId, fileSize);
        }
    }

    process.exit(0);
}