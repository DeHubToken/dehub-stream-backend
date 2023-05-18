require('dotenv').config();
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const IDCounter = require("./IDCounter");

let CategorySchema = new Schema({
    name: String,
    id: Number,
}, { timestamps: true });


CategorySchema.pre("save", function (next) {
    let doc = this;
    if (!doc.id)
        IDCounter.findOneAndUpdate(
            { id: "categoryId" },
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

CategorySchema.index({ name: 1 }, { unique: true });

module.exports.Category = mongoose.model('categories', CategorySchema);