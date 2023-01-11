const { ethers } = require("ethers");
const { supportedTokens, supportedNetworks } = require("../config/constants")
const erc20ContractAbi = require('../abis/erc20.json');

const getTokenByTokenAddress = (tokenAddress) => supportedTokens.find(e => e.address.toLowerCase() === tokenAddress.toLowerCase());

const getERC20TokenBalance = async (account, tokenAddress, chainId) => {
    const network = supportedNetworks.find(e=>e.chainId === chainId);
    const token = supportedTokens.find(e=>e.address.toLowerCase()=== tokenAddress.toLowerCase());
    if(!network || !token) return 0;
    const provider = new ethers.providers.JsonRpcProvider(network.rpcUrls[0]);
    const tokenContract = new ethers.Contract(tokenAddress, erc20ContractAbi, provider);
    const tokenBalance = await tokenContract.balanceOf(account);
    return ethers.utils.formatUnits(tokenBalance, token.decimals);
}

module.exports = {
    getTokenByTokenAddress,
    getERC20TokenBalance
}