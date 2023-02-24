const { config } = require("../config");
const { streamInfoKeys } = require("../config/constants");

const getTotalBountyAmount = (streamInfo, bAddFee = false) => {
    if (!streamInfo[streamInfoKeys.isAddBounty]) return 0;
    const amount = streamInfo[streamInfoKeys.addBountyAmount] *
        (Number(streamInfo[streamInfoKeys.addBountyFirstXComments]) + Number(streamInfo[streamInfoKeys.addBountyFirstXViewers])) *
        (bAddFee ? (1 + config.developerFee) : 1);
    const precision = 5;
    return Math.round(amount * 10 ** precision) / (10 ** precision);
};

module.exports = {
    getTotalBountyAmount
}
