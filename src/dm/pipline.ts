import { Types } from 'mongoose';

export const singleMessagePipeline = messageId => {
  return [
    // Match the specific message by _id
    {
      $match: {
        _id: new Types.ObjectId(messageId),
      },
    },

    // Lookup sender details
    {
      $lookup: {
        from: 'accounts', // Collection name for accounts
        localField: 'sender', // Field in the message document
        foreignField: '_id', // Field in the accounts collection
        as: 'senderDetails', // Output array field
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              address: 1,
              displayName: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        senderDetails: { $arrayElemAt: ['$senderDetails', 0] }, // Flatten senderDetails to a single object
      },
    },

    // Lookup purchase options details
    {
      $unwind: {
        path: '$purchaseOptions', // Unwind the purchaseOptions array
        preserveNullAndEmptyArrays: true, // Handle cases with no purchase options
      },
    },
    {
      $lookup: {
        from: 'purchaseoptions', // Collection name for purchase options
        localField: 'purchaseOptions._id', // Field in the message document
        foreignField: '_id', // Field in the purchaseoptions collection
        as: 'purchaseOptionDetails', // Output array field
      },
    },
    {
      $addFields: {
        'purchaseOptions.details': { $arrayElemAt: ['$purchaseOptionDetails', 0] }, // Merge purchaseOptionDetails into purchaseOptions
      },
    },

    // Re-group purchase options
    {
      $group: {
        _id: '$_id',
        sender: { $first: '$senderDetails' }, // Keep populated sender details
        conversation: { $first: '$conversation' },
        uploadStatus: { $first: '$uploadStatus' },
        msgType: { $first: '$msgType' },
        isRead: { $first: '$isRead' },
        isPaid: { $first: '$isPaid' },
        failureReason: { $first: '$failureReason' },
        mediaUrls: { $first: '$mediaUrls' },
        isUnlocked: { $first: '$isUnlocked' },
        purchaseOptions: { $push: '$purchaseOptions' }, // Push the restructured purchaseOptions array
        createdAt: { $first: '$createdAt' },
        updatedAt: { $first: '$updatedAt' },
      },
    },
  ];
};

export const conversationPipeline = user => [
  // Sort messages by creation time in descending order
  { $sort: { createdAt: -1 } },

  // Lookup messages based on the conversation
  {
    $lookup: {
      from: 'messages',
      localField: '_id',
      foreignField: 'conversation',
      as: 'messages',
    },
  },

  // Unwind the participants array to join details for each participant
  {
    $unwind: {
      path: '$participants',
      preserveNullAndEmptyArrays: true,
    },
  },

  // Lookup participants' details from the Account collection and include role
  {
    $lookup: {
      from: 'accounts',
      localField: 'participants.participant',
      foreignField: '_id',
      as: 'participantDetails',
    },
  },

  // Unwind participantDetails to access details as an object
  {
    $unwind: {
      path: '$participantDetails',
      preserveNullAndEmptyArrays: true,
    },
  },

  // Add a field to determine whether the user should be included based on conversation type
  {
    $addFields: {
      includeParticipant: {
        $cond: {
          if: { $eq: ['$conversationType', 'dm'] },
          then: { $ne: ['$participantDetails._id', user._id] },
          else: true,
        },
      },
    },
  },

  // Match only participants who should be included
  {
    $match: {
      includeParticipant: true,
    },
  },

  // Regroup the data to include only the relevant fields
  {
    $group: {
      _id: '$_id',
      conversationType: { $first: '$conversationType' },
      groupName: { $first: '$groupName' },
      participants: {
        $addToSet: {
          participant: {
            _id: '$participantDetails._id',
            username: '$participantDetails.username',
            address: '$participantDetails.address',
          },
          role: '$participants.role',
        },
      },
      lastMessageAt: { $first: '$lastMessageAt' },
      createdAt: { $first: '$createdAt' },
      updatedAt: { $first: '$updatedAt' },
      messages: { $first: '$messages' },
    },
  },

  // Lookup sender details for each message
  {
    $lookup: {
      from: 'accounts',
      localField: 'messages.sender',
      foreignField: '_id',
      as: 'senderDetails',
      pipeline: [
        {
          $project: {
            _id: 1,
            address: 1,
            displayName: 1,
            username: 1,
          },
        },
      ],
    },
  },

  // Map messages to include filtered sender details and add author field
  {
    $addFields: {
      messages: {
        $map: {
          input: '$messages',
          as: 'message',
          in: {
            $mergeObjects: [
              '$$message',
              {
                sender: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$senderDetails',
                        as: 'sender',
                        cond: { $eq: ['$$sender._id', '$$message.sender'] },
                      },
                    },
                    0,
                  ],
                },
                // Add 'author' field to each message
                author: {
                  $cond: [
                    { $eq: [user._id, '$$message.sender'] }, // Check if sender is the user
                    'me', // If the user is the sender, label it as 'me'
                    'other', // Otherwise, use the sender's ID
                  ],
                },
              },
            ],
          },
        },
      },
    },
  },

  // Include blocked users to disable chat
  {
    $lookup: {
      from: 'userreports',
      let: { conversationId: '$_id' },
      localField: '_id',
      foreignField: 'conversation',
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$conversation', '$$conversationId'] },
                { $ne: ['$action', 'unblock'] },
                { $ne: ['$resolved', true] },
              ],
            },
          },
        },
        {
          $group: {
            _id: { conversation: '$conversation', reportedBy: '$reportedBy' },
            firstReport: { $first: '$$ROOT' },
          },
        },
        {
          $lookup: {
            from: 'accounts',
            localField: 'firstReport.reportedBy',
            foreignField: '_id',
            as: 'reportedByDetails',
          },
        },
        {
          $lookup: {
            from: 'accounts',
            localField: 'firstReport.reportedUser',
            foreignField: '_id',
            as: 'reportedUserDetails',
          },
        },
        {
          $project: {
            _id: '$firstReport._id',
            conversation: '$firstReport.conversation',
            reportedBy: '$firstReport.reportedBy',
            action: '$firstReport.action',
            createdAt: '$firstReport.createdAt',
            isGlobal: '$firstReport.isGlobal',
            reason: '$firstReport.reason',
            reportedUser: '$firstReport.reportedUser',
            resolved: '$firstReport.resolved',
            updatedAt: '$firstReport.updatedAt',
            reportedUserDetails: {
              _id: { $arrayElemAt: ['$reportedUserDetails._id', 0] },
              address: { $arrayElemAt: ['$reportedUserDetails.address', 0] },
            },
            reportedByDetails: {
              _id: { $arrayElemAt: ['$reportedByDetails._id', 0] },
              address: { $arrayElemAt: ['$reportedByDetails.address', 0] },
            },
          },
        },
      ],
      as: 'blockList',
    },
  },

  // Project relevant fields, including last 20 messages
  {
    $project: {
      _id: 1,
      conversationType: 1,
      groupName: 1,
      participants: 1,
      lastMessageAt: 1,
      createdAt: 1,
      updatedAt: 1,
      blockList: 1,
      messages: { $slice: ['$messages', 20] },
    },
  },
];
