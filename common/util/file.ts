const fs = require("fs");
const path = require("path");

const defaultVideoFilePath = (tokenId) => {
    return `${process.env.CDN_BASE_URL}videos/${tokenId}.mp4`;
}

const getTempVideoFilePath = (tokenId:number, videoExt = 'mp4') => {
    return `${path.dirname(__dirname)}/assets/videos/${tokenId}_c.${videoExt}`;
}

const defaultImageFilePath = (tokenId:number, imageExt = 'jpg') => {
    return `${process.env.CDN_BASE_URL}images/${tokenId}.${imageExt}`;
}


export  {
    defaultVideoFilePath,
    defaultImageFilePath,
    getTempVideoFilePath,
}