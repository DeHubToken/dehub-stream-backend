
require('dotenv').config();
// import dotenv from 'dotenv'
// dotenv.config();
const config = {
    port: 9004,
    socket: 9003,
    baseUrl: 'http://127.0.0.1:9004',

    devPort: 9002,
    devBaseUrl: 'http://127.0.0.1:9002',
    mongo: {
        host: '127.0.0.1',
        port: 27017,
        dbName: 'streaming_nft_db'
    },
    graphQlUrl: 'https://api.thegraph.com/subgraphs/name/streaming-nft/streaming-nft',
    expireSigninTime: 7200, // 2 hours
    isDevMode: process.env.RUN_MODE != 'dev',
};
module.exports = {
    config,
};