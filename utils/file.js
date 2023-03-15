const fs = require("fs");
const path = require("path");
const moveFile = (srcFilePath, destFilePath) => {
    fs.rename(srcFilePath, destFilePath, (e) => {
        if (e) {
            if (fs.existsSync(destFilePath)) {
                console.log('dest file exists. deleting...', destFilePath);
                fs.unlink(destFilePath, error => { if (error) console.log('delete file error!') });
                fs.renameSync(srcFilePath, destFilePath);
            }
            console.log(e);
        }
        else console.log('--moved', destFilePath);
    });
}

const defaultVideoFilePath = (tokenId, videoExt = 'mp4') => {
    return `${path.dirname(__dirname)}/assets/videos/${tokenId}.${videoExt}`;
}

const getTempVideoFilePath = (tokenId, videoExt = 'mp4') => {
    return `${path.dirname(__dirname)}/assets/videos/${tokenId}_c.${videoExt}`;
}

const defaultImageFilePath = (tokenId, imageExt = 'png') => {
    return `${path.dirname(__dirname)}/assets/images/${tokenId}.${imageExt}`;
}

module.exports = {
    moveFile,
    defaultVideoFilePath,
    defaultImageFilePath,
    getTempVideoFilePath,
}