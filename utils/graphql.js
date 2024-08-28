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
            tokenId 
            amount   
            blockNumber         
            transaction {
                id
                timestamp
            }
            token {
                id
            }
            to {
                id
                balances {              
                    sentTips
                    receivedTips                    
                }
            }
            from {
                id
                balances {
                    staked
                    sentTips
                    receivedTips
                    token {
                        id
                    }
            }
          }
        logIndex    
        }
        nftTransfers(first: ${config.itemLimitsForFetching},where:{ blockNumber_gte: ${minBlockNumber}, blockNumber_lte: ${maxBlockNumber} }, orderBy: blockNumber, orderDirection:asc){
            tokenId
            from {
                id
            }
            to {
                id
            }
            collection
            transaction {
                id
            }
        }  
    }`;
  let retData = undefined;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
      }), // Get some from re-orgs
    });
    const result = await res.json();
    const { data } = result;
    retData = data;
  } catch (err) {
    console.log('--fetch graphql error-', err);
  }
  return retData;
};

/**
 * @notice Fetches transaction from graphql
 *
 * @param
 */
const getMintTxesFromGraphGL = async url => {
  const query = `
     {        
        nftTransfers(where:{from: "0x0000000000000000000000000000000000000000"}, orderBy: tokenId, orderDirection:asc){
            id
            tokenId            
            collection
            transaction {
                id
            }
        }  
    }`;
  let retData = undefined;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
      }), // Get some from re-orgs
    });
    const result = await res.json();
    const { data } = result;
    retData = data;
  } catch (err) {
    console.log('--fetch graphql error-', err);
  }
  return retData;
};

module.exports = {
  getHistoryFromGraphGL,
  getMintTxesFromGraphGL,
};
