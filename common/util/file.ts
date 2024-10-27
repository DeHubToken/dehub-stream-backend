const fs = require("fs");
const path = require("path");

const defaultVideoFilePath = (tokenId, videoExt = 'mp4', minter:string) => {
    return `${process.env.CCDN_URL}/${minter}/${tokenId}.${videoExt}`;
}

const getTempVideoFilePath = (tokenId:number, videoExt = 'mp4') => {
    return `${path.dirname(__dirname)}/assets/videos/${tokenId}_c.${videoExt}`;
}

const defaultImageFilePath = (tokenId:number, imageExt = 'png', minter:string) => {
    return `${process.env.CDN_URL}/${minter}/${tokenId}.${imageExt}`;
}


export  {
    defaultVideoFilePath,
    defaultImageFilePath,
    getTempVideoFilePath,
}