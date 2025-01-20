require('dotenv').config();
import {config }  from '../../config';
import { ethers } from "ethers";
import { supportedTokens, supportedNetworks, multicallContractAddresses, streamCollectionAddresses } from "config/constants";
import erc20ContractAbi from '../../abis/erc20.json';
import stakingContractAbi from '../../abis/StakingDHB.json';
import multicallContractAbi from '../../abis/multicall.json';
import erc1155ContractAbi from '../../abis/erc1155.json';
import erc721ContractAbi from '../../abis/StreamNft.json';


const getTokenByTokenAddress = (tokenAddress, chainId = 56) => supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase() && e.chainId === chainId);

const getERC20TokenBalance = async (account, tokenAddress, chainId) => {
    const network = supportedNetworks.find(e => e.chainId === chainId);
    const token = supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase());
    if (!network || !token) return 0;
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const tokenContract = new ethers.Contract(tokenAddress, erc20ContractAbi, provider);
    const tokenBalance = await tokenContract.balanceOf(account);
    return Number(ethers.formatUnits(tokenBalance, token.decimals));
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

const parseTryAggregateCalldata = (returnResult, callObjectArray) => {
    try {
        const returnData = {}
        callObjectArray?.map((item, idx) => {
            const returnKey = item.returnKey || item.functionName
            if (!returnResult?.[idx]?.success) {
                console.error('multicallParse error', returnKey)
                return
            }
            if (returnKey) {
                let decodedResult = item?.contract?.interface?.decodeFunctionResult(
                    item?.functionName,
                    returnResult?.[idx]?.returnData
                )
                if (decodedResult?.length === 1) decodedResult = decodedResult?.toString()
                returnData[returnKey] = decodedResult
            }
        })
        return returnData
    } catch (error) {
        console.log('parseAggregateCalldata', error?.message)
        return {}
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

const multiCallReading = async (multicallContract, callDataArray, fetchUnit = 500) => {
    try {
        let resultObject = {};
        for (let i = 0; i < callDataArray.length; i += fetchUnit) {
            const tempCallDataArray = callDataArray.filter((item, idx) => {
                return ((idx >= i) && (idx < i + fetchUnit))
            })

            const aggregateCallData = makeAggregateCalldata(tempCallDataArray);
            const resultRaw = await multicallContract.tryAggregate(false, aggregateCallData);
            const resultParsed = parseTryAggregateCalldata(resultRaw, tempCallDataArray);
            resultObject = { ...resultObject, ...resultParsed }
        }
        return resultObject;
    } catch (error) {
        console.log(' ---multicall reading error', error.message)
    }
}

const getTokenBalancesOfAddresses = async (addresses, tokenAddress, chainId) => {
    const network = supportedNetworks.find(e => e.chainId === chainId);
    const token = supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase() && e.chainId === chainId);
    if (!network || !token) return 0;
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
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
        Object.keys(multicallResult).forEach(key => multicallResult[key] = Number(ethers.formatUnits(multicallResult[key], token.decimals)));
        tempResult = { ...tempResult, ...multicallResult };
    }
    return tempResult;
}

const stakingContractAddress = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6";
const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_ENDPOINT);
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
        Object.keys(multicallResult).forEach(key => multicallResult[key] = Number(ethers.formatUnits(multicallResult[key], 18)));
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
            // @ts-ignore
            address: filter1.address,
            topics: []
        }
        
        // @ts-ignore
        eventResults = await stakingContract.queryFilter(filter, fromBlock, toBlock);
        eventResults = eventResults.filter(e => e.event === 'Staked' || e.event === 'Unstaked'); // transaction with amount 0
        result = eventResults.map(e => {
            return {
                user: e.args.user,
                amount: e.event === 'Staked' ? e.args.amount : e.args.actualAmount,
                // id: e.transactionHash + "-" + e.logIndex,
                logInfo: { transactionHash: e.transactionHash, logIndex: e.logIndex, blockNumber: e.blockNumber },
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

/**
* 
* @param {int} fromBlock 
* @param {int} latestBlock 
* @param {object} evmWeb3 
* @param {string} tokenAddress 
* @returns {transfers, toBlock}
*/
const getTokenHistories = async (fromBlock, toBlock, tokenAddress, chainId) => {
    if (toBlock <= fromBlock) return { transfers: [] };
    const network = supportedNetworks.find(e => e.chainId === chainId);
    const token = supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase() && e.chainId === chainId);
    if (!network || !token) return { tranfers: [] };
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const tokenContract = new ethers.Contract(tokenAddress, erc20ContractAbi, provider);
    let result = [];
    try {
        let eventResults = [];
        const filter = tokenContract.filters.Transfer();
        eventResults = await tokenContract.queryFilter(filter, fromBlock, toBlock);
        result = eventResults.map(e => {
            return {
                from: e.args.from,
                to: e.args.to,
                value: e.args.value,
                logInfo: { transactionHash: e.transactionHash, logIndex: e.logIndex, blockNumber: e.blockNumber, address: tokenAddress },
                event: e.event,
            }
        });
    }
    catch (e) {
        console.log(e);
        return { result: [] };
    }
    return { result, toBlock };

}

const getCollectionContract = (networkName) => {
    const curNetwork = supportedNetworks.find(e => e.shortName === networkName);
    if (!curNetwork) return undefined;
    const provider = new ethers.JsonRpcProvider(curNetwork.rpcUrls[0]);
    return new ethers.Contract(streamCollectionAddresses[curNetwork.chainId], erc1155ContractAbi, provider);
}

const getCreatorsOfCollection = async (chainId) => {
    const network = supportedNetworks.find(e => e.chainId === chainId);
    if (!network) return 0;
    const collectionAddress = streamCollectionAddresses[chainId];
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const colletionContract = new ethers.Contract(collectionAddress, erc1155ContractAbi, provider);
    const maxTokenId = 200;
    const multicallContract = new ethers.Contract(multicallContractAddresses[chainId], multicallContractAbi, provider);
    const callDataArray = [];
    for (let i = 0; i < parseInt(maxTokenId.toString()); i++) {
        callDataArray.push({
            contract: colletionContract,
            functionName: 'creaters',
            param: [i],
            returnKey: `${i}`,
        });
    }
    const multicallResult = await multiCallReading(multicallContract, callDataArray);
    return multicallResult;
}

const getCreatorsForTokenIds = async (chainId, tokenItems) => {
    const network = supportedNetworks.find(e => e.chainId === chainId);
    if (!network) return [];
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const multicallContract = new ethers.Contract(multicallContractAddresses[chainId], multicallContractAbi, provider);
    const callDataArray = [];
    for (const tokenItem of tokenItems) {
        if (tokenItem.type === '1155') {
            const colletionContract = new ethers.Contract(tokenItem.address, erc1155ContractAbi, provider);
            callDataArray.push({
                contract: colletionContract,
                functionName: 'creators',
                param: [tokenItem.tokenId],
                returnKey: `${tokenItem.tokenId}`,
            });
        }
        else {
            const colletionContract = new ethers.Contract(tokenItem.address, erc721ContractAbi, provider);
            callDataArray.push({
                contract: colletionContract,
                functionName: 'ownerOf',
                param: [tokenItem.tokenId],
                returnKey: `${tokenItem.tokenId}`,
            });
        }

    }
    const multicallResult = await multiCallReading(multicallContract, callDataArray);
    return multicallResult;
}

/**
* 
* @param {int} fromBlock 
* @param {int} latestBlock 
* @param {object} evmWeb3 
* @param {string} collectionAddress 
* @returns {transfers, toBlock}
*/
const getCollectionHistories = async (fromBlock, toBlock, collectionAddress, chainId) => {
    if (toBlock <= fromBlock) return { transfers: [] };
    const network = supportedNetworks.find(e => e.chainId === chainId);
    if (!network) return { tranfers: [] };
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const collectionContract = new ethers.Contract(collectionAddress, erc1155ContractAbi, provider);
    let result = [];
    try {
        let eventResults = [];
        const filter = collectionContract.filters.TransferSingle();
        eventResults = await collectionContract.queryFilter(filter, fromBlock, toBlock);
        result = eventResults.map(e => {
            return {
                from: e.args._from,
                to: e.args._to,
                tokenId: e.args._id,
                amount: e.args._value,
                logInfo: { transactionHash: e.transactionHash, logIndex: e.logIndex, blockNumber: e.blockNumber, address: e.address },
                event: e.event,
            }
        });
    }
    catch (e) {
        console.log(e);
        return { result: [] };
    }
    return { result, toBlock };

}

/**
* 
* @param {int} fromBlock 
* @param {int} latestBlock 
* @param {object} evmWeb3 
* @param {string} collectionAddress 
* @returns {transfers, toBlock}
*/
const getERC721Histories = async (fromBlock, toBlock, collectionAddress, chainId) => {
    if (toBlock <= fromBlock) return { transfers: [] };
    const network = supportedNetworks.find(e => e.chainId === chainId);
    if (!network) return { tranfers: [] };
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const collectionContract = new ethers.Contract(collectionAddress, erc721ContractAbi, provider);
    let result = [];
    try {
        let eventResults = [];
        const filter = collectionContract.filters.Transfer();
        eventResults = await collectionContract.queryFilter(filter, fromBlock, toBlock);
        result = eventResults.map(e => {
            return {
                from: e.args.from,
                to: e.args.to,
                tokenId: Number(e.args.tokenId),
                amount: 1,
                logInfo: { transactionHash: e.transactionHash, logIndex: e.logIndex, blockNumber: e.blockNumber, address: e.address },
                event: e.event,
            }
        });
    }
    catch (e) {
        console.log('--error for erc721 history--');
        return { result: [] };
    }
    return { result, toBlock };

}

/**
* 
* @param {int} fromBlock 
* @param {int} latestBlock 
* @param {object} evmWeb3 
* @param {string} collectionAddress 
* @returns {transfers, toBlock}
*/
const getControllerHistories = async (fromBlock, toBlock, collectionAddress, chainId) => {
    if (toBlock <= fromBlock) return { transfers: [] };
    const network = supportedNetworks.find(e => e.chainId === chainId);
    if (!network) return { tranfers: [] };
    const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);
    const collectionContract = new ethers.Contract(collectionAddress, erc1155ContractAbi, provider);
    let result = [];
    try {
        let eventResults = [];
        const filter = collectionContract.filters.TransferSingle();
        eventResults = await collectionContract.queryFilter(filter, fromBlock, toBlock);
        result = eventResults.map(e => {
            return {
                from: e.args._from,
                to: e.args._to,
                tokenId: e.args._id,
                amount: e.args._value,
                logInfo: { transactionHash: e.transactionHash, logIndex: e.logIndex, blockNumber: e.blockNumber, address: e.address },
                event: e.event,
            }
        });
    }
    catch (e) {
        console.log(e);
        return { result: [] };
    }
    return { result, toBlock };

}

export {
    getTokenByTokenAddress,
    getERC20TokenBalance,
    multicallRead,
    getTokenBalancesOfAddresses,
    getStakedAmountOfAddresses,
    getStakeHistories,
    getTokenHistories,
    getCollectionContract,
    getCreatorsOfCollection,
    getCollectionHistories,
    getCreatorsForTokenIds,
    getERC721Histories,
}