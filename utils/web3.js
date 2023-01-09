const { supportedTokens } = require("../config/constants")

const getTokenByTokenAddress = (tokenAddress) => supportedTokens.find(e=>e.address.toLowerCase()=== tokenAddress.toLowerCase());


module.exports = {
    getTokenByTokenAddress
}