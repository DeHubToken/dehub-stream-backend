const crypto = require("crypto");
const algo = 'aes-128-cbc';
const ivLen = 16;
// const key = "security_key";
// const iv = "iv_key";
// const keyBuffer = Buffer.from(crypto.createHash('md5').update(key).digest('hex'), "hex");
// const ivBuffer = Buffer.from(crypto.createHash('md5').update(iv).digest('hex'), "hex");

function makeRandomIV(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

const encryptMsgWithAES128 = (plainText, key) => {
    // plainText = plainText.toString('utf8').replace("@", "")
    // const textBuffer = Buffer.from(Buffer.from(plainText).toString("base64"));
    // console.log("---plainText", Buffer.from(plainText).toString("base64"));
    const textBuffer = Buffer.from(plainText);
    const iv = makeRandomIV(ivLen);
    const ivBuffer = Buffer.from(crypto.createHash('md5').update(iv).digest('hex'), "hex");
    const keyBuffer = Buffer.from(crypto.createHash('md5').update(key).digest('hex'), "hex");
    let cipher = crypto.createCipheriv(algo, keyBuffer, ivBuffer);
    let encrypted = cipher.update(textBuffer);
    let encryptedFinal = cipher.final();
    let encryptedText = encrypted.toString('base64') + encryptedFinal.toString('base64');
    console.log("encrypted:", iv + encryptedText);
    return iv + encryptedText;
}

const decryptMsgWithAES128 = (encryptedText, key) => {    
    const iv = encryptedText.substr(0, ivLen);
    const ivBuffer = Buffer.from(crypto.createHash('md5').update(iv).digest('hex'), "hex");
    const keyBuffer = Buffer.from(crypto.createHash('md5').update(key).digest('hex'), "hex");
    let decipher = crypto.createDecipheriv(algo, keyBuffer, ivBuffer);
    decipher.setAutoPadding(true);//padding 
    let decipheredContent = decipher.update(encryptedText.substr(ivLen, encryptedText.length - ivLen), 'base64', 'utf8');
    decipheredContent += decipher.final('utf8');
    console.log("-decrypted:", decipheredContent);
    // decipheredContent = Buffer.from(decipheredContent, "base64").toString("utf8")
    // decipheredContent = decipheredContent.replace("...", "@")
    return decipheredContent;
}
const encryptWithSourceKey = (plainText, sourceKey) => {
    return encryptMsgWithAES128(plainText, getSecurityKeyFrom(sourceKey));
}

const decryptWithSourceKey = (encryptedText, sourceKey) => {
    console.log("--encryptedText:", encryptedText);
    return decryptMsgWithAES128(encryptedText, getSecurityKeyFrom(sourceKey));
}

const getSecurityKeyFrom = (sourceKey) => {
    const normalSourceKey = sourceKey.toLowerCase();
    const changedKey = normalSourceKey.substr(4, 3) + "?" + normalSourceKey.substr(10, 5) + "!";  // + normalSourceKey.substr(23, 6).toUpperCase();
    // const changedKey = normalSourceKey.substr(4, 3);
    console.log("---changed: ", changedKey);
    return reverseString(changedKey);
}

const reverseString = (str) => {
    // Step 1. Use the split() method to return a new array
    var splitString = str.split(""); // var splitString = "hello".split("");
    // ["h", "e", "l", "l", "o"]

    // Step 2. Use the reverse() method to reverse the new created array
    var reverseArray = splitString.reverse(); // var reverseArray = ["h", "e", "l", "l", "o"].reverse();
    // ["o", "l", "l", "e", "h"]

    // Step 3. Use the join() method to join all elements of the array into a string
    var joinArray = reverseArray.join(""); // var joinArray = ["o", "l", "l", "e", "h"].join("");
    // "olleh"

    //Step 4. Return the reversed string
    return joinArray; // "olleh"
}
module.exports = {
    encryptMsgWithAES128,
    decryptMsgWithAES128,
    getSecurityKeyFrom,
    encryptWithSourceKey,
    decryptWithSourceKey,
}