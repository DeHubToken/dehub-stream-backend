require('dotenv').config();
const { ethers } = require("ethers");
const { supportedTokens, supportedNetworks, multicallContractAddresses } = require("../config/constants")
const erc20ContractAbi = require('../abis/erc20.json');
const stakingContractAbi = require('../abis/StakingDHB.json');
const multicallContractAbi = require('../abis/multicall.json');

const getTokenByTokenAddress = (tokenAddress, chainId = 97) => supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase() && e.chainId === chainId);

const getERC20TokenBalance = async (account, tokenAddress, chainId) => {
    const network = supportedNetworks.find(e => e.chainId === chainId);
    const token = supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase());
    if (!network || !token) return 0;
    const provider = new ethers.providers.JsonRpcProvider(network.rpcUrls[0]);
    const tokenContract = new ethers.Contract(tokenAddress, erc20ContractAbi, provider);
    const tokenBalance = await tokenContract.balanceOf(account);
    return Number(ethers.utils.formatUnits(tokenBalance, token.decimals));
}

const makeAggregateCalldata = (callObjectArray) => {
    try {
        const calldata = callObjectArray?.map((item) => {
            return {
                target: item?.contract?.address,
                callData: item?.contract?.interface?.encodeFunctionData(item?.functionName, item?.param),
            };
        });
        return calldata;
    } catch (error) {
        console.log('makeAggregateCalldata', error);
        return [];
    }
};

const parseAggregateCalldata = (returnResult, callObjectArray) => {
    try {
        const returnData = {};
        // eslint-disable-next-line array-callback-return
        callObjectArray?.map((item, idx) => {
            const returnKey = item.returnKey || item.functionName;
            if (returnKey) {
                let decodedResult = item?.contract?.interface?.decodeFunctionResult(
                    item?.functionName,
                    returnResult?.returnData?.[idx],
                );
                if (decodedResult?.length === 1) decodedResult = decodedResult?.toString();
                returnData[returnKey] = decodedResult;
            }
        });
        return returnData;
    } catch (error) {
        console.log('parseAggregateCalldata');
        return {};
    }
};

async function multicallRead(
    multicallContract,
    callObjectArray
) {
    try {
        const calldata = makeAggregateCalldata(callObjectArray)
        const result = await multicallContract.aggregate(calldata)
        const returnData = parseAggregateCalldata(result, callObjectArray)
        return returnData;
    } catch (e) {
        console.log('multicallRead', e);
    }
}

const getTokenBalancesOfAddresses = async (addresses, tokenAddress, chainId) => {
    const network = supportedNetworks.find(e => e.chainId === chainId);
    const token = supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase() && e.chainId === chainId);
    if (!network || !token) return 0;
    const provider = new ethers.providers.JsonRpcProvider(network.rpcUrls[0]);
    const tokenContract = new ethers.Contract(tokenAddress, erc20ContractAbi, provider);
    const multicallContract = new ethers.Contract(multicallContractAddresses[chainId], multicallContractAbi, provider);
    let tempResult = {};
    for (let i = 0; i < addresses.length; i += 500) {
        const subAddresses = addresses.slice(i, Math.min(i + 500, addresses.length));
        const callDataArray = [];
        subAddresses.forEach(address => {
            callDataArray.push({
                contract: tokenContract,
                functionName: 'balanceOf',
                param: [address],
                returnKey: `${address}`,
            });
        });
        const multicallResult = await multicallRead(multicallContract, callDataArray);
        Object.keys(multicallResult).forEach(key => multicallResult[key] = Number(ethers.utils.formatUnits(multicallResult[key], token.decimals)));
        tempResult = { ...tempResult, ...multicallResult };
    }
    return tempResult;
}

const stakingContractAddress = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6";
const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC_ENDPOINT);
const chainId = 56;
const stakingContract = new ethers.Contract(stakingContractAddress, stakingContractAbi, provider);
const getStakedAmountOfAddresses = async (addresses) => {
    const multicallContract = new ethers.Contract(multicallContractAddresses[chainId], multicallContractAbi, provider);
    let tempResult = {};
    for (let i = 0; i < addresses.length; i += 500) {
        const subAddresses = addresses.slice(i, Math.min(i + 500, addresses.length));
        const callDataArray = [];
        subAddresses.forEach(address => {
            callDataArray.push({
                contract: stakingContract,
                functionName: 'userTotalStakedAmount',
                param: [address],
                returnKey: `${address}`,
            });
        });
        const multicallResult = await multicallRead(multicallContract, callDataArray);
        Object.keys(multicallResult).forEach(key => multicallResult[key] = Number(ethers.utils.formatUnits(multicallResult[key], 18)));
        tempResult = { ...tempResult, ...multicallResult };
    }
    return tempResult;
}

/**
* 
* @param {int} fromBlock 
* @param {int} latestBlock 
* @param {object} evmWeb3 
* @param {string} tokenAddress 
* @returns {transfers, toBlock}
*/
const getStakeHistories = async (fromBlock, toBlock) => {
    if (toBlock <= fromBlock) return { transfers: [] };
    let result = [];
    try {
        let eventResults = [];
        const filter1 = stakingContract.filters.Staked();        
        const filter = {
            address: filter1.address,
            topics: []
        }

        eventResults = await stakingContract.queryFilter(filter, fromBlock, toBlock);
        eventResults = eventResults.filter(e => e.event === 'Staked' || e.event === 'Unstaked'); // transaction with amount 0
        result = eventResults.map(e => {
            return {
                blockNumber: e.blockNumber,
                user: e.args.user,                
                amount: e.event === 'Staked'? e.args.amount: e.args.actualAmount,
                // id: e.transactionHash + "-" + e.logIndex,
                logInfo: {transactionHash: e.transactionHash, logIndex: e.logIndex},
                event: e.event,
                // realAmount: Number(ethers.utils.formatUnits(e.event === 'Staked'? e.args.amount: e.args.actualAmount, 18)),                
            }
        });
    }
    catch (e) {
        console.log(e);
        return { result: [] };
    }
    return { result, toBlock };

}
module.exports = {
    getTokenByTokenAddress,
    getERC20TokenBalance,
    multicallRead,
    getTokenBalancesOfAddresses,
    getStakedAmountOfAddresses,
    getStakeHistories,
}