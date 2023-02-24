const { config } = require("../config");
const { streamInfoKeys } = require("../config/constants");

const getTotalBountyAmount = (streamInfo, bAddFee = false) => {
    if (!streamInfo[streamInfoKeys.isAddBounty]) return 0;
    return (
        streamInfo[streamInfoKeys.addBountyAmount] *
        (Number(streamInfo[streamInfoKeys.addBountyFirstXComments]) +
            Number(streamInfo[streamInfoKeys.addBountyFirstXViewers])) * (bAddFee ? (1 + config.developerFee) : 1)
    );
};

module.exports = {
    getTotalBountyAmount
}
