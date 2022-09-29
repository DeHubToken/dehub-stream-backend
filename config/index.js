let config = {
    kovan_port: 9002,
    port: 9004,
    socket: 9003,
    base_url: 'http://127.0.0.1:9004',
    kovan_base_url: 'http://127.0.0.1:9002',
    mongo: {
        host: '127.0.0.1',
        port: 27017,
        db_name: 'web3_simple_db'
    },
    kovan_mongo: {
        host: '127.0.0.1',
        port: 27017,
        db_name: 'web3_simple_db_kovan'
    },
    web3SimpleGraphQLURL: 'https://api.thegraph.com/subgraphs/name/web3simple/web3simple-market',
    voteAmount: 10
};
require('dotenv').config()
module.exports = function () {
    return config;
};