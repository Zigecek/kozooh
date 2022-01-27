const mongoose = require("mongoose");

const templateSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  id: String,
  used: Number,
  name: String,
  roundTime: Number,
  pause: Boolean,
  show: Boolean,
  questions: Array,
  author: {
    username: String,
  },
  created: Number,
});

module.exports = mongoose.model("Template", templateSchema, "templates");
