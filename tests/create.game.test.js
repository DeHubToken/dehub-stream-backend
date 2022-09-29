require('dotenv').config();
let mongoose = require('mongoose');
const { Account } = require('../models/Account');
let config = require('../config')();
const { Game } =require('../models/Game');
const { Song } = require('../models/Song');

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.db_name,
    {useNewUrlParser: true, useUnifiedTopology: true}, async function (err, db) {
        mongoose.set('useFindAndModify', false);
        mongoose.set('useCreateIndex', true);
        let d = new Date();
        if (err) {
            console.log('[' + d.toLocaleString() + '] ' + 'DB error');
        } else {
            console.log('[' + d.toLocaleString() + '] ' + 'testing creating game ...');
            cron_loop();
        }
    });

async function cron_loop() {
    await Game.create({songIds: [1,2,3]});
    // const account = await Account.findOneAndUpdate({}, {$inc: {balance:-1200}}, {returnOriginal: false});
    // console.log(account);
    process.exit();
}