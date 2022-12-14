const paramNames = {
    address: 'address',
    sig: 'sig',
    timestamp: 'timestamp'
}

const supportedVideoTypes = ["/mp4"];
const supportedImageTypes = ["/png", "/jpeg", "/jpg", "/gif"];
const errorMsgs = {
    not_supported_video: 'Not supported video',
    not_supported_image: 'Not supported Image',
}

const streamInfoKeys = {
    isLockContent: 'isLockContent',
    lockContentContractAddress: 'lockContentContractAddress',
    lockContentAmount: 'lockContentAmount',
    isPayPerView: 'isPayPerView',
    payPerViewContractAddress: 'payPerViewContractAddress',
    payPerViewAmount: 'payPerViewAmount',
    isAddBounty: 'isAddBounty',
    addBountyFirstXViewers: 'addBountyFirstXViewers',
    addBountyFirstXComments: 'addBountyFirstXComments',
    addBountyAmount: 'addBountyAmount'
}

const RewardType = {
    PayPerView: 'PayPerView',
    FirstComment: 'FirstComment',
    FirstView: 'FirstView'
}

const ChainId = {
    MAINNET: 1,
    GORLI: 5,
    BSC_MAINNET: 56,
    BSC_TESTNET: 97,
    HECO_MAINNET: 128,
    HECO_TESTNET: 256,
    FANTOM_MAINNET: 250,
    AVALANCHE_MAINNET: 43114,
    POLYGON_MAINNET: 137,
}

const dhbTokenAddresses = {
    [ChainId.MAINNET]: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    [ChainId.BSC_MAINNET]: '0x41B90b73a88804f2aed1C4672b3dbA74eb9A92ce',
    [ChainId.BSC_TESTNET]: '0x06EdA7889330031a8417f46e4C771C628c0b6418',
    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.POLYGON_MAINNET]: '0x275617327c958bD06b5D6b871E7f491D76113dd8',
};

const vaultContractAddresses = {
    [ChainId.MAINNET]: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    [ChainId.BSC_MAINNET]: '0x41B90b73a88804f2aed1C4672b3dbA74eb9A92ce',
    [ChainId.BSC_TESTNET]: '0x8a4a29bb2df539faba5b7649a20de23ca47baed2',
    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.POLYGON_MAINNET]: '0x275617327c958bD06b5D6b871E7f491D76113dd8',
};

module.exports = {
    paramNames,
    supportedVideoTypes,
    supportedImageTypes,
    errorMsgs,
    streamInfoKeys,
    ChainId,
    dhbTokenAddresses,
    vaultContractAddresses,
    RewardType,
}