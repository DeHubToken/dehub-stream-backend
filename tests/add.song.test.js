require('dotenv').config();
let mongoose = require('mongoose');
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
    const tokenId = 4;
    const songData = {
        name: `浮海飛翔`,
        songUrl: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main.mp3`,
        tokenId: tokenId,
        midiFiles: {
            main: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main_.mid`,
            blue: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main_blue.mid`,
            green: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main_green.mid`,
            red: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main_red.mid`,
            violet: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main_violet.mid`,
            yellow: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/main_yellow.mid`,
        },
        imageUrl: `http://83.171.249.193:9004/api/get_song_files/${tokenId}/s${tokenId}.png`,
    }
    // const result = await Song.create(songData);
    const result = await Song.findOneAndUpdate({tokenId}, {songUrl: songData.songUrl});
    // const result = await Song.findOneUndate({tokenId:{$in: [1,2]}}).lean();
    console.log(result);
    process.exit(0);
}