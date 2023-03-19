const fetch = require('node-fetch');
const { config } = require('../config');

/**
 * @notice Fetches transaction from graphql
 *  
 * @param
 */
const getHistoryFromGraphGL = async (minBlockNumber, maxBlockNumber, url) => {
    const query = `
     {
        _meta {
            block {
                number  
                timestamp
                }
            }
        transfers(first: ${config.itemLimitsForFetching},where:{ blockNumber_gte: ${minBlockNumber}, blockNumber_lte: ${maxBlockNumber} }, orderBy: blockNumber, orderDirection:asc) 
          {            
            transaction {
                id
            }                 
            tokenAddress
            {
              id
            }
            to
            {
              id
              balances
                {
                    token {
                    id
                    }
                    balance
                }
            }
            from {
              id
              balances
                {
                    token {
                    id
                    }
                    balance
                }
            }
            realAmount
            blockNumber
            logIndex         
          }
          protocolTxes(first: ${config.itemLimitsForFetching}, where:{ blockNumber_gte: ${minBlockNumber}, blockNumber_lte: ${maxBlockNumber} }, orderBy: blockNumber, orderDirection:asc) {
            type
          id 
        amount
        address
        blockNumber
        transaction {
          id
          timestamp
        }
        token {
            id
        }
        account {
            balances {
                staked
                token {
                    id
                }                
            }
        }
        logIndex    
        }  
    }`;
    let retData = undefined;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query
            }) // Get some from re-orgs
        });
        const result = await res.json();
        const { data } = result
        retData = data;
    }
    catch (err) {
        console.log("--fetch graphql error-", err)
    }
    return retData;
}

module.exports = {
    getHistoryFromGraphGL
}