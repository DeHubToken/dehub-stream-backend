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
module.exports = {
    paramNames,
    supportedVideoTypes,
    supportedImageTypes,
    errorMsgs,
}