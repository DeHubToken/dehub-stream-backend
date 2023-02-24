require('dotenv').config();
const paramNames = {
    address: 'address',
    sig: 'sig',
    timestamp: 'timestamp',
    chainId: 'chainId',
    tokenAddress: 'tokenAddress',
    streamTokenId: 'streamTokenId',
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
    lockContentTokenSymbol: 'lockContentTokenSymbol',
    lockContentAmount: 'lockContentAmount',
    lockContentChainIds: 'lockContentChainIds',
    isPayPerView: 'isPayPerView',
    payPerViewContractAddress: 'payPerViewContractAddress',
    payPerViewTokenSymbol: 'payPerViewTokenSymbol',
    payPerViewAmount: 'payPerViewAmount',
    payPerViewChainIds: 'payPerViewChainIds',
    isAddBounty: 'isAddBounty',
    addBountyTokenSymbol: 'addBountyTokenSymbol',
    addBountyFirstXViewers: 'addBountyFirstXViewers',
    addBountyFirstXComments: 'addBountyFirstXComments',
    addBountyAmount: 'addBountyAmount',
    addBountyChainId: 'addBountyChainId',
}

const RewardType = {
    PayPerView: 'PayPerView',
    FirstComment: 'FirstComment',
    FirstView: 'FirstView',
    Tip: 'Tip',
    BountyForViewer: 'BountyForViewer',
    BountyForCommentor: 'BountyForCommentor',
}

const userProfileKeys = {
    username: 'username',
    email: 'email',
    avatarImageUrl: 'avatarImageUrl',
    coverImageUrl: 'coverImageUrl',
    aboutMe: 'aboutMe',
    facebookLink: 'facebookLink',
    twitterLink: 'twitterLink',
    discordLink: 'discordLink',
    instagramLink: 'instagramLink',
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
    [ChainId.BSC_TESTNET]: '0xc90f5CbB3bb3e9a181b8Fed7d8a4835B291b7c9F',
    [ChainId.GORLI]: '0x067e7613BFe063A778D1799A58Ee78419A0d9B73',
    [ChainId.MAINNET]: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    [ChainId.BSC_MAINNET]: '0x41B90b73a88804f2aed1C4672b3dbA74eb9A92ce',
    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.POLYGON_MAINNET]: '0x275617327c958bD06b5D6b871E7f491D76113dd8',
};

const multicallContractAddresses = {
    [ChainId.MAINNET]: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    [ChainId.GORLI]: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    [ChainId.KOVAN]: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    [ChainId.BSC_MAINNET]: '0x41B90b73a88804f2aed1C4672b3dbA74eb9A92ce',
    [ChainId.BSC_TESTNET]: '0x80d0d36d9E3Cb0Bd4561beB1d9d1cC8e1a33F5b1',
    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.OKEX_MAINNET]: '0xdf4CDd4b8F1790f62a91Bcc4cb793159c641B1bd',
    [ChainId.POLYGON_MAINNET]: '0x275617327c958bD06b5D6b871E7f491D76113dd8',
};

const overrideOptions = { new: true, upsert: true, returnOriginal: false };

const supportedTokens = [
    {
        value: 'dhb',
        label: 'DHB',
        symbol: 'DHB',
        customAbbreviation: 'dhb',
        chainId: 97,
        address: '0x06EdA7889330031a8417f46e4C771C628c0b6418',
        iconUrl: 'assets/icons/tokens/DHB.png',
        decimals: 18,
    },
    {
        value: 'dhb',
        label: 'DHB',
        symbol: 'DHB',
        customAbbreviation: 'dhb',
        chainId: 5,
        address: '0x0F0fBE6FB65AaCE87D84f599924f6524b4F8d858',
        iconUrl: 'assets/icons/tokens/DHB.png',
        decimals: 18,
    },
    {
        value: 'busd',
        label: 'BUSD',
        symbol: 'BUSD',
        customAbbreviation: 'busd',
        chainId: 97,
        address: '0x53D4A05DF7caAf3302184B774855EcBe2a50bD3E',
        iconUrl: 'assets/icons/tokens/BUSD.png',
        decimals: 18,
    },
    {
        value: 'usdc',
        label: 'USDC',
        symbol: 'USDC',
        customAbbreviation: 'usdc',
        chainId: 97,
        address: '0x4131fd3F1206d48A89410EE610BF1949934e0a72',
        iconUrl: 'assets/icons/tokens/USDC.png',
        decimals: 18,
    },
];

const supportedTokensForLockContent = supportedTokens.filter(e => e.symbol === 'DHB');
const supportedTokensForPPV = supportedTokens;
const supportedTokensForAddBounty = supportedTokens;

const supportedChainIdsForMinting = [97];
const supportedChainIds = [ChainId.BSC_TESTNET, ChainId.GORLI];
const supportedNetworks = [
    {
        chainId: ChainId.BSC_TESTNET,
        shortName: `bsctest`,
        rpcUrls: [process.env.BSCTEST_RPC_ENDPOINT],
    },
    {
        chainId: ChainId.GORLI,
        shortName: `goerli`,
        rpcUrls: [`https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,]
    }
]

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
    userProfileKeys,
    overrideOptions,
    supportedTokens,
    supportedTokensForLockContent,
    supportedTokensForPPV,
    supportedTokensForAddBounty,
    supportedChainIdsForMinting,
    supportedChainIds,
    supportedNetworks,
    multicallContractAddresses,
}