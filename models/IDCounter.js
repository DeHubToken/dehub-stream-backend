const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var IDCounter = Schema({
  id: { type: String, required: true },
  seq: { type: Number, default: 0 },
  expiredIds: {type: [Number], default: []},
});

IDCounter.index({ id: 1 }, { unique: true });

module.exports = mongoose.model("id_counters", IDCounter);
