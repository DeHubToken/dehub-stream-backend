const fs = require("fs");
const moveFile = (srcFilePath, destFilePath) => {
    var source = fs.createReadStream(srcFilePath);
    var dest = fs.createWriteStream(destFilePath);

    source.pipe(dest);
    source.on('end', function () {  console.log('----copied') });
    source.on('error', function (err) { console.log('----not copied', err) });
    // return new Promise((resolve, reject) => {
    //     source.on('end', resolve);
    //     source.on('error', reject);
    //     source.pipe(dest);
    // });
}

module.exports = {
    moveFile,
}