const mongoose = require("mongoose");

const gameSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  template: {
    id: String,
  },
  code: String,
  state: Object,
  controlers: Array,
  guests: Array,
  author: {
    username: String,
  },
  questionID: {
    default: null,
    type: Number,
  },
  questionTime: {
    default: 0,
    type: Number,
  },
  stageID: String,
});

module.exports = mongoose.model("Game", gameSchema, "games");
