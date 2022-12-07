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

module.exports = {
    paramNames,
    supportedVideoTypes,
    supportedImageTypes,
    errorMsgs,
    streamInfoKeys,
}