require('dotenv').config();
const Comment = require("../models/Comment");

const commentsForTokenId = async (tokenId) => {
    const query = [
        {
            $match: {
                tokenId: Number(tokenId)
            }
        },
        {
            $lookup: {
                from: 'accounts',
                localField: 'address',
                foreignField: 'address',
                as: 'account'
            }
        },
        {
            $sort: {
                id: -1
            }
        },
        {
            $limit: 50
        },
        {
            $project: {
                _id: 0,
                address: 1,
                content: 1,
                account: 1,
                createdAt: 1,
                updatedAt: 1,
                parentId: 1,
                replyIds: 1,
                id: 1,
                tokenId: 1,
            }
        }
    ];
    let result = await Comment.aggregate(query);
    result.forEach(comment => {
        if (comment.account?.[0]) {
            comment.writor = {
                username: comment.account?.[0]?.username,
                avatarUrl: process.env.DEFAULT_DOMAIN + "/" + comment.account?.[0]?.avatarImageUrl
            }
            delete comment.account;
        }
    });
    return result;
}

module.exports = {
    commentsForTokenId
}