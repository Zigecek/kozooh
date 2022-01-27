const mongoose = require("mongoose");

const userSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  username: String,
  email: String,
  password: String,
  registered: Number,
  verified: Object,
  templates: Array,
});

module.exports = mongoose.model("User", userSchema, "users");
