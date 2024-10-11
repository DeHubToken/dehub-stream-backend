const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  offerBy: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['listed', 'pending', 'accepted', 'rejected', 'purchased', 'cancelled', 'deleted', 'tx_pending', 'tx_failed'],
    default: 'pending',
  },
  accepted: {
    type: Boolean,
    default: false,
  },
  offerDate: {
    type: Date,
    default: Date.now,
  },
  expirationTime: {
    type: Date,
    // required: true,
  },
});

const UsernameOffer = mongoose.model('UsernameOffer', offerSchema);

module.exports = UsernameOffer;
