require('dotenv').config();
/**
 * @notice this should not contain any other js.
 */
const isDevMode = process.env.RUN_MODE === 'dev';

const paramNames = {
    address: 'address',
    sig: 'sig',
    timestamp: 'timestamp',
    chainId: 'chainId',
    tokenAddress: 'tokenAddress',
    streamTokenId: 'streamTokenId',
}

const supportedVideoTypes = ["/mp4", "/quicktime"];
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
    displayName: 'displayName',
    email: 'email',
    avatarImageUrl: 'avatarImageUrl',
    coverImageUrl: 'coverImageUrl',
    aboutMe: 'aboutMe',
    facebookLink: 'facebookLink',
    twitterLink: 'twitterLink',
    discordLink: 'discordLink',
    instagramLink: 'instagramLink',
}

const editableProfileKeys = {
    username: 'username',
    displayName: 'displayName',
    email: 'email',
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
    [ChainId.MAINNET]: '0x99BB69Ee1BbFC7706C3ebb79b21C5B698fe58EC0',
    [ChainId.BSC_MAINNET]: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',
    [ChainId.BSC_TESTNET]: '0x06EdA7889330031a8417f46e4C771C628c0b6418',
    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.POLYGON_MAINNET]: '0x6051e59eb50BB568415B6C476Fbd394EEF83834D',
};

const vaultContractAddresses = {
    [ChainId.BSC_TESTNET]: '0xc90f5CbB3bb3e9a181b8Fed7d8a4835B291b7c9F',
    [ChainId.GORLI]: '0x067e7613BFe063A778D1799A58Ee78419A0d9B73',
    [ChainId.MAINNET]: '0xfBA69f9a77CAB5892D568144397DC6A2068EceD3',
    [ChainId.BSC_MAINNET]: '0xfBA69f9a77CAB5892D568144397DC6A2068EceD3',
    [ChainId.FANTOM_MAINNET]: '0xfBA69f9a77CAB5892D568144397DC6A2068EceD3',
    [ChainId.AVALANCHE_MAINNET]: '0xfBA69f9a77CAB5892D568144397DC6A2068EceD3',
    [ChainId.POLYGON_MAINNET]: '0xfBA69f9a77CAB5892D568144397DC6A2068EceD3',
};

const stakingContractAddresses = {
    [ChainId.BSC_MAINNET]: '0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6',
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

// this contract addresses should be unique for each network
const streamCollectionAddresses = {
    // deployed live networks
    [ChainId.MAINNET]: '0x1065F5922a336C75623B55D22c4a0C760efCe947',
    [ChainId.BSC_MAINNET]: '0x1065F5922a336C75623B55D22c4a0C760efCe947',
    [ChainId.POLYGON_MAINNET]: '0x1065F5922a336C75623B55D22c4a0C760efCe947',
    // testnets
    [ChainId.GORLI]: '0xfdFe40A30416e0aEcF4814d1d140e027253c00c7',
    [ChainId.BSC_TESTNET]: '0x5Ae62dF56fF1E68Fb1772a337859b856CAEEFab6',

    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.OKEX_MAINNET]: '0xdf4CDd4b8F1790f62a91Bcc4cb793159c641B1bd',
};

// this contract addresses should be unique for each network
const streamControllerContractAddresses = {
    // deployed mainnets
    [ChainId.MAINNET]: '0x6e19ba22da239c46941582530c0ef61400b0e3e6',
    [ChainId.BSC_MAINNET]: '0x6e19ba22da239c46941582530c0ef61400b0e3e6',
    [ChainId.POLYGON_MAINNET]: '0x6e19ba22da239c46941582530c0ef61400b0e3e6',
    // testnets
    [ChainId.GORLI]: '0x2b44a04d2e62d84395eb30f9cf71a256bc7b158a',
    [ChainId.BSC_TESTNET]: '0x5Ae62dF56fF1E68Fb1772a337859b856CAEEFab6',

    [ChainId.FANTOM_MAINNET]: '0xbb804a896E1A6962837c0813a5F89fDb771d808f',
    [ChainId.AVALANCHE_MAINNET]: '0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154',
    [ChainId.OKEX_MAINNET]: '0xdf4CDd4b8F1790f62a91Bcc4cb793159c641B1bd',
};

const overrideOptions = { new: true, upsert: true, returnOriginal: false };
const devTokens = [
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
const productionTokens = [
    {
        value: 'dhb',
        label: 'DHB',
        symbol: 'DHB',
        customAbbreviation: 'dhb',
        chainId: 1,
        address: '0x99BB69Ee1BbFC7706C3ebb79b21C5B698fe58EC0',
        iconUrl: 'assets/icons/tokens/DHB.png',
        mintBlockNumber: 16428469,
        decimals: 18,
    },
    {
        value: 'dhb',
        label: 'DHB',
        symbol: 'DHB',
        customAbbreviation: 'dhb',
        chainId: 56,
        address: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',
        iconUrl: 'assets/icons/tokens/DHB.png',
        mintBlockNumber: 24867920,
        decimals: 18,
    },
    {
        value: 'dhb',
        label: 'DHB',
        symbol: 'DHB',
        customAbbreviation: 'dhb',
        chainId: 137,
        address: '0x6051e59eb50BB568415B6C476Fbd394EEF83834D',
        iconUrl: 'assets/icons/tokens/DHB.png',
        mintBlockNumber: 38197541,
        decimals: 18,
    },
    {
        value: 'usdc',
        label: 'USDC',
        symbol: 'USDC',
        customAbbreviation: 'usdc',
        chainId: 1,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        iconUrl: 'assets/icons/tokens/USDC.png',
        decimals: 6,
    },
    {
        value: 'usdc',
        label: 'USDC',
        symbol: 'USDC',
        customAbbreviation: 'usdc',
        chainId: 56,
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        iconUrl: 'assets/icons/tokens/USDC.png',
        decimals: 6,
    },
    {
        value: 'usdc',
        label: 'USDC',
        symbol: 'USDC',
        customAbbreviation: 'usdc',
        chainId: 137,
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        iconUrl: 'assets/icons/tokens/USDC.png',
        decimals: 6,
    },
    {
        value: 'usdt',
        label: 'USDT',
        symbol: 'USDT',
        customAbbreviation: 'usdt',
        chainId: 1,
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        iconUrl: 'assets/icons/tokens/USDT.png',
        decimals: 18,
    },
    {
        value: 'usdt',
        label: 'USDT',
        symbol: 'USDT',
        customAbbreviation: 'usdt',
        chainId: 56,
        address: '0x55d398326f99059ff775485246999027b3197955',
        iconUrl: 'assets/icons/tokens/USDT.png',
        decimals: 18,
    },
    {
        value: 'usdt',
        label: 'USDT',
        symbol: 'USDT',
        customAbbreviation: 'usdt',
        chainId: 137,
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        iconUrl: 'assets/icons/tokens/USDT.png',
        decimals: 18,
    },
    {
        value: 'doge',
        label: 'DOGE',
        symbol: 'DOGE',
        customAbbreviation: 'doge',
        chainId: 56,
        address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
        iconUrl: 'https://tokens.pancakeswap.finance/images/0xbA2aE424d960c26247Dd6c32edC70B295c744C43.png',
        decimals: 8,
    },
    {
        value: 'shib',
        label: 'SHIB',
        symbol: 'SHIB',
        customAbbreviation: 'shib',
        chainId: 1,
        address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
        iconUrl: 'https://assets.coingecko.com/coins/images/11939/thumb/shiba.png?1622619446',
        decimals: 18,
    },
    {
        value: 'pepe',
        label: 'PEPE',
        symbol: 'PEPE',
        customAbbreviation: 'pepe',
        chainId: 1,
        address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
        iconUrl: 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg?1682922725',
        decimals: 18,
    },
    {
        value: 'floki',
        label: 'FLOKI',
        symbol: 'FLOKI',
        customAbbreviation: 'floki',
        chainId: 1,
        address: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',
        iconUrl: 'https://assets.coingecko.com/coins/images/16746/small/PNG_image.png?1643184642',
        decimals: 9,
    },
    {
        value: 'floki',
        label: 'FLOKI',
        symbol: 'FLOKI',
        customAbbreviation: 'floki',
        chainId: 56,
        address: '0xfb5b838b6cfeedc2873ab27866079ac55363d37e',
        iconUrl: 'https://assets.coingecko.com/coins/images/16746/small/PNG_image.png?1643184642',
        decimals: 9,
    },
];

const supportedTokens = isDevMode ? devTokens : productionTokens;
const supportedTokensForLockContent = supportedTokens.filter(e => e.symbol === 'DHB');
const supportedTokensForPPV = supportedTokens;
const supportedTokensForAddBounty = supportedTokens;

const supportedChainIdsForMinting = [56];
const supportedChainIds = isDevMode ? [ChainId.BSC_TESTNET, ChainId.GORLI] : [ChainId.MAINNET, ChainId.BSC_MAINNET, ChainId.POLYGON_MAINNET];
const mainNetworks = [
    {
        chainId: ChainId.BSC_MAINNET,
        shortName: `bsc`,
        rpcUrls: [process.env.BSC_RPC_ENDPOINT],
        startBlockNumber: 25834000,
        graphUrl: process.env.BSC_GRAPH_API_ENDPOINT,
    },
    {
        chainId: ChainId.MAINNET,
        shortName: `mainnet`,
        rpcUrls: [`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,],
        startBlockNumber: 16428469,
        graphUrl: process.env.ETHEREUM_GRAPH_API_ENDPOINT,
    },
    {
        chainId: ChainId.POLYGON_MAINNET,
        shortName: `polygon`,
        rpcUrls: [`https://polygon-mainnet.rpcfast.com?api_key=xbhWBI1Wkguk8SNMu1bvvLurPGLXmgwYeC4S6g2H7WdwFigZSmPWVZRxrskEQwIf`,],
        startBlockNumber: 38197541,
        graphUrl: process.env.POLYGON_GRAPH_API_ENDPOINT,
    }
];
const testNetworks = [
    {
        chainId: ChainId.BSC_TESTNET,
        shortName: `bsctest`,
        rpcUrls: [process.env.BSCTEST_RPC_ENDPOINT],
        startBlockNumber: 8708163
    },
    {
        chainId: ChainId.GORLI,
        shortName: `goerli`,
        rpcUrls: [`https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,],
        startBlockNumber: 8804175,
        graphUrl: process.env.GOERLI_GRAPH_API_ENDPOINT,
    }
];

const supportedNetworks = isDevMode ? testNetworks : mainNetworks;

const tokenTemplate = {
    name: 1,
    description: 1,
    tokenId: 1,
    imageUrl: 1,
    videoUrl: 1,
    // owner: 1,
    minter: 1,
    streamInfo: 1,
    videoInfo: 1,
    videoDuration: 1,
    videoExt: 1,
    views: 1,
    likes: 1,
    totalTips: 1,
    lockedBounty: 1,
    totalVotes: 1,
    status: 1,
    transcodingStatus: 1,
    _id: 0,
};

const blacklistOnLeaderboard = [
    '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c',
    '0x26d2cd7763106fdce443fadd36163e2ad33a76e6', // staking address
    '0x000000000000000000000000000000000000dead', // burned address
    '0x0d0707963952f2fba59dd06f2b425ace40b492fe', // exchange address
]

const publicChatChannelId = 'public_chn';

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
    stakingContractAddresses,
    streamCollectionAddresses,
    streamControllerContractAddresses,
    tokenTemplate,
    blacklistOnLeaderboard,
    publicChatChannelId,
    editableProfileKeys,
}