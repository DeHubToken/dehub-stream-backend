const fs = require("fs");
const path = require("path");
const moveFile = (srcFilePath, destFilePath) => {
    var source = fs.createReadStream(srcFilePath);
    var dest = fs.createWriteStream(destFilePath);

    source.pipe(dest);
    source.on('end', function () {
        console.log('----copied');
        fs.unlink(srcFilePath, error => { if (error) console.log('delete file error!') });
    });
    source.on('error', function (err) { console.log('----not copied', err) });
    // return new Promise((resolve, reject) => {
    //     source.on('end', resolve);
    //     source.on('error', reject);
    //     source.pipe(dest);
    // });
}

const defaultVideoFilePath = (tokenId, videoExt = 'mp4') => {
    return `${path.dirname(__dirname)}/assets/videos/${tokenId}.${videoExt}`;
}

const defaultImageFilePath = (tokenId, imageExt = 'png') => {
    return `${path.dirname(__dirname)}/assets/images/${tokenId}.${imageExt}`;
}

module.exports = {
    moveFile,
    defaultVideoFilePath,
    defaultImageFilePath,
}