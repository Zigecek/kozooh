const mongoose = require("mongoose");

const guestSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  socket: {
    id: String,
  },
  username: String,
});

module.exports = mongoose.model("Guest", guestSchema, "Guests");
