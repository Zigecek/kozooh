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
  answerLastPos: {
    default: 0,
    type: Number,
  },
});

module.exports = mongoose.model("Game", gameSchema, "games");
