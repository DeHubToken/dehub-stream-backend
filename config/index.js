
require('dotenv').config();

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
    expireSigninTime: 2 * 60 * 60, // 2 hours
    isDevMode: process.env.RUN_MODE != 'dev',
    recentTimeDiff: 3 * 24 * 60 * 60 * 1000,
    extraSecondForCheckingBalance: 2 * 60,
    extraRecordSpaceSecond: 60, // in second unit:  ignore this space time while watching video to record history
    developerFee: 0.1, // developer fee for pay per view is 10 %
};
module.exports = {
    config,
};