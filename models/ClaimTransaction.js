const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let ClaimTransactionSchema = new Schema({
    // "address that claims token"
    receiverAddress: String,
    tokenAddress: String,
    amount: Number,
    timestamp: Number,
    txHash: String,
    block: Number,
    logIndex: Number,
    id: Number,
    chainId: Number,
    status: { type: String, enum:['pending', 'confirmed', 'expired'], default: 'pending'},
}, { timestamps: true });

ClaimTransactionSchema.pre("save", function (next) {
    let doc = this;
    if (!doc.id)
        IDCounter.findOneAndUpdate(
            { id: "claimId" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
            function (error, counter) {
                if (error) return next(error);
                doc.id = counter.seq;
                next();
            }
        );
    else next();
});
module.exports.ClaimTransaction = mongoose.model('claim_transactions', ClaimTransactionSchema);