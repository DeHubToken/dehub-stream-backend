const { overrideOptions } = require("../config/constants");
const Follow = require("../models/Follow");
const { normalizeAddress } = require("../utils/format");

const requestFollow = async (address, following) => {
    following = normalizeAddress(following);
    if (address === following) return { result: false, error: 'Not follow for you' }
    const updatedResult = await Follow.updateOne({ address, following }, {}, overrideOptions);
    if (updatedResult?.nModified > 0) return { result: false, error: 'already following' };
    return { result: true };
}
/**
 * 
 * @param {*} address : follower address normalized address
 * @param {*} following following address may not be normalized
 * @returns 
 */
const unFollow = async (address, following) => {
    following = normalizeAddress(following);
    const deletedResult = await Follow.deleteOne({ address, following });
    if (deletedResult?.deletedCount > 0) return { result: true };
    return { result: false, error: 'no following' };
}

const getFollowing = async (address) => {
    address = normalizeAddress(address);
    const followes = Follow.find({ address }, { following: 1 }).distinct('following');
    return followes;
}

const getFollowers = async (address) => {
    address = normalizeAddress(address);
    const followes = Follow.find({ following: address }, { address: 1 }).distinct('address');
    return followes;
}

module.exports = {
    requestFollow,
    unFollow,
    getFollowing,
    getFollowers
}
