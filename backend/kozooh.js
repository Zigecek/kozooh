require("dotenv").config({
  path: require("find-config")(".env"),
});
require("./utils/mongoose").init();

const express = require("express");
const app = express();
const session = require("express-session");
const { createServer } = require("http");
const serveStatic = require("serve-static");
const User = require("./models/user");
const Game = require("./models/game");
const Template = require("./models/template");
const bodyParser = require("body-parser");
const MongoDBStore = require("connect-mongodb-session")(session);
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const uuid = require("uuid").v4;
const nodemailer = require("nodemailer");
const morgan = require("morgan");
const randomstring = require("randomstring");
const path = require("path");
const ExcelJS = require("exceljs");
const fs = require("fs");

var store = new MongoDBStore({
  uri: process.env.MONGOOSE_KEY,
  collection: "sessions",
});

const port = 3499;
const httpServer = createServer(app);
httpServer.listen(port);
app.use(morgan("combined"));

const io = new socketIo.Server(httpServer, {
  cors: {
    origin: ["https://kozohorsky.xyz", "https://kozohorsky-xyz.herokuapp.com"],
    methods: ["GET", "POST"],
  },
});

let transporter = nodemailer.createTransport({
  host: "smtp.seznam.cz",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SEZNAM_EMAIL,
    pass: process.env.SEZNAM_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

store.on("error", function (error) {
  console.error(error);
});

var auth = function (req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    return res.sendStatus(401);
  }
};

/////////////////////////////////////// MIDDLEWARES ////////////////////////
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 3, // 3 days
    },
    store: store,
  })
);

async function getID() {
  var code = randomstring.generate({
    length: 6,
    charset: "numeric",
  });
  const gm = await Game.findOne({ code: code });
  if (gm) {
    return await getID();
  } else {
    return code;
  }
}

////////////////////////////////////////// APP ROUTES ////////////////////////////

app.get("/odhlaseni", function (req, res) {
  req.session.destroy();
  res.redirect("/");
});
app.use("/ucet", auth);
app.use("/prihlaseni", (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/?alert=alrLoged");
  } else {
    return next();
  }
});
app.get("/others/game.html", (req, res) => {
  res.sendStatus(401);
});
app.get("/others/verify.html", (req, res) => {
  res.sendStatus(401);
});
app.get("/upravit", auth, async (req, res) => {
  const templates = await Template.find({
    "author.username": req.session.user,
  });

  if (templates.find((x) => x.id == req.query.id)) {
    res.status(200).sendFile(path.resolve("frontend/edit/index.html"));
  } else {
    res.sendStatus(401);
  }

  res.status(200).send({ templates: templates });
});

//////////////////////////////////////////////// STATIC ///////////////////////////

app.use(serveStatic("./frontend/"));

////////////////////////////////// API /////////////////////////////////////////////
var api = express.Router({ mergeParams: true });
app.use("/api", api);

///////////////////////////////// HRA /////////////////////////////////////////////

async function runCountdown(gameID) {
  //////////////////////////// COUNTDOWN
  var game = await Game.findOne({ code: gameID });
  var temp = await Template.findOne({ id: game.template.id });
  const stageID = uuid();
  await Game.updateOne(
    { code: gameID },
    {
      "state.is": "COUNTDOWN",
      stageID,
    }
  );

  function countDown(t) {
    io.to(gameID).emit("screen", {
      is: "COUNTDOWN",
      time: t,
      questionID: game.questionID + 1,
      totalQ: temp.questions.length,
    });
  }
  countDown("5");
  setTimeout(() => {
    countDown("4");
  }, 1_000);
  setTimeout(() => {
    countDown("3");
  }, 2_000);
  setTimeout(() => {
    countDown("2");
  }, 3_000);
  setTimeout(() => {
    countDown("1");
  }, 4_000);
  setTimeout(async () => {
    game = await Game.findOne({ code: gameID });
    if (game.stageID == stageID) {
      question(gameID);
    }
  }, 5_000);
}

async function question(gameID) {
  //////////////////////////////////////// QUESTION
  var game = await Game.findOne({ code: gameID });
  var temp = await Template.findOne({ id: game.template.id });
  var index = game.questionID + 1;
  var stageID = uuid();
  await Game.updateOne(
    { code: gameID },
    {
      "state.is": "QUESTION",
      questionID: index,
      questionTime: Date.now(),
      stageID,
    }
  );

  io.to(gameID).emit("screen", {
    is: temp.show ? "QUESTION-SHOWED" : "QUESTION-HIDDEN",
    question: temp.show ? temp.questions[index].question : null,
    answers: temp.show
      ? temp.questions[index].answers.map((x) => x.answer)
      : temp.questions[index].answers.map((x) => ""),
    roundTime: temp.roundTime,
    questionID: game.questionID + 1,
  });

  if (!temp.show) {
    io.to(gameID + "control").emit("screen", {
      is: "QUESTION-SHOWED",
      question: temp.questions[index].question,
      answers: temp.questions[index].answers.map((x) => x.answer),
      roundTime: temp.roundTime,
      questionID: game.questionID + 1,
    });
  }

  setTimeout(async () => {
    game = await Game.findOne({ code: gameID });
    if (game.stageID == stageID) {
      result(gameID);
    }
  }, temp.roundTime * 1000);
}

async function validate(gameID) {
  ///////////////////////////////////////////////////////// VALIDATE (AFTER QUESTION)
  var game = await Game.findOne({ code: gameID });
  await Game.updateOne(
    { code: gameID },
    {
      "state.is": "CALCULATING",
    }
  );
  game = await Game.findOne({ code: gameID });
  game.guests.forEach((g, i) => {
    if (!g.answers[game.questionID]) {
      game.guests[i].answers.push({
        correct: false,
        index: null,
        gainedCoins: 0,
      });
    }
  });

  await Game.updateOne({ code: gameID }, { guests: game.guests });
}

async function result(gameID) {
  await validate(gameID);

  var stageID = uuid();
  await Game.updateOne(
    { code: gameID },
    {
      "state.is": "RESULT",
      stageID,
    }
  );

  var game = await Game.findOne({ code: gameID });
  var temp = await Template.findOne({ id: game.template.id });
  game.guests.forEach((g, gi) => {
    var socket = io.sockets.sockets.get(g.socketID);
    if (socket) {
      socket.emit("screen", {
        is: "RESULT",
        correct: g.answers[g.answers.length - 1]?.correct,
      });
    }
  });
  io.to(gameID + "control").emit("screen", {
    is: "RESULT",
    correct: temp.questions[game.questionID].answers
      .filter((x) => x.correct)
      .map((x) => temp.questions[game.questionID].answers.indexOf(x)),
  });
  setTimeout(async () => {
    game = await Game.findOne({ code: gameID });
    if (game.stageID == stageID) {
      pauseOrEvaluateOrContinue(gameID);
    }
  }, 5_000);
}
async function pauseOrEvaluateOrContinue(gameID) {
  ///////////////////////////////////////////////////// DECIDE WHAT TO DO
  var game = await Game.findOne({ code: gameID });
  var temp = await Template.findOne({ id: game.template.id });
  if (game.questionID + 1 < temp.questions.length) {
    if (temp.pause) {
      makePause(gameID);
    } else {
      question(gameID);
    }
  } else {
    evaluate(gameID);
  }
}
async function makePause(gameID) {
  //////////////////////////////////////////////////// PAUSE
  var game = await Game.findOne({ code: gameID });
  var temp = await Template.findOne({ id: game.template.id });
  const stageID = uuid();

  await Game.updateOne(
    { code: gameID },
    {
      "state.is": "PAUSED",
      stageID,
    }
  );

  var sortedGuests = game.guests;

  sortedGuests.sort((a, b) => {
    if (a.coins > b.coins) return -1;
    else return 1;
  });

  io.to(gameID).emit("screen", {
    is: "PAUSE",
    guests: sortedGuests.map((x) => ({
      nickname: x.nickname,
      coins: x.coins,
    })),
  });
  setTimeout(async () => {
    game = await Game.findOne({ code: gameID });
    if (game.stageID == stageID) {
      runCountdown(gameID);
    }
  }, temp.pauseTime * 1000);
}

async function evaluate(gameID) {
  /////////////////////////////////////// EVAL
  var game = await Game.findOne({ code: gameID });
  var temp = await Template.findOne({ id: game.template.id });

  await Game.updateOne(
    { code: gameID },
    {
      "state.is": "EVALUATING",
    }
  );

  var average = {
    players: game.guests.length,
    questions: temp.questions,
  };
  var guests = [];

  game.guests.forEach((g, gi) => {
    var correct = g.answers.filter((a) => a.correct).length; // po??et spravnych odpovedi
    var uspesnost = Math.floor((correct / average.questions.length) * 100); // uspesnost v procentech

    guests.push({
      nickname: g.nickname,
      coins: g.coins,
      correct,
      uspesnost,
    });

    g.answers.forEach((a, i) => {
      var aIndex = temp.questions[i].answers.indexOf(
        temp.questions[i].answers.find((x) => x.correct)
      ); // zjisti index spravne odpovedi z templatu
      if (a.correct) {
        // pokud guestova odpoved je spravna
        average.questions[i].answers[aIndex].votes = average.questions[i]
          .answers[aIndex]?.votes
          ? average.questions[i].answers[aIndex].votes + 1 // pokud uz .votes existuje tak jen pricte
          : 1; // pokud ne tak vytvori
      } else {
        if (a.index) {
          // pokud v??bec odpov??d??l
          average.questions[i].answers[a.index].votes = average.questions[i]
            .answers[a.index]?.votes
            ? average.questions[i].answers[a.index].votes + 1 // pokud uz .votes existuje tak jen pricte
            : 1; // pokud ne tak vytvori
        }
      }
    });
  });

  average.questions.forEach((q, qi) => {
    q.answers.forEach((a, ai) => {
      average.questions[qi].answers[ai].votes = average.questions[qi].answers[
        ai
      ].votes
        ? average.questions[qi].answers[ai].votes
        : 0;
    });
  });

  guests.sort((a, b) => {
    if (a.coins > b.coins) return -1;
    else return 1;
  });

  average.questions.forEach((q, qi) => {
    q.answers.forEach((a, ai) => {
      average.questions[qi].answers[ai].percent = Math.floor(
        (a.votes / average.players) * 100 // vypo????t?? procenta a zaokrouhl??
      );
    });
  });

  await xlsx(average, guests, gameID);

  io.to(gameID).emit("screen", {
    is: "END",
    average,
    guests,
  });
}

async function xlsx(average, guests, gameID) {
  var workbook = new ExcelJS.Workbook();

  /// PLAYERS - sheet
  var pSheet = workbook.addWorksheet("Players");

  pSheet.columns = [
    { header: "P??ezd??vka", key: "nickname", width: 20 },
    { header: "Spr??vn?? ot??zky", key: "questions", width: 20 },
    { header: "Body", key: "coins", width: 20 },
    { header: "??sp????nost", key: "percent", width: 20 },
  ];

  var nColVals = guests.map((x) => x.nickname);
  var qColVals = guests.map((x) => x.correct + "/" + average.questions.length);
  var cColVals = guests.map((x) => x.coins);
  var pColVals = guests.map((x) => x.uspesnost);

  nColVals.splice(0, 0, " ");
  qColVals.splice(0, 0, " ");
  cColVals.splice(0, 0, " ");
  pColVals.splice(0, 0, " ");

  var nCol = pSheet.getColumn("nickname");
  var qCol = pSheet.getColumn("questions");
  var cCol = pSheet.getColumn("coins");
  var pCol = pSheet.getColumn("percent");

  nCol.values = nColVals;
  qCol.values = qColVals;
  cCol.values = cColVals;
  pCol.values = pColVals;

  nCol.header = "P??ezd??vka";
  qCol.header = "Spr??vn?? ot??zky";
  cCol.header = "Body";
  pCol.header = "??sp????nost (%)";

  for (let i = 0; i < 4; i++) {
    var cell = pSheet.getCell(["A", "B", "C", "D"][i] + "1");
    cell.font = {
      bold: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "D9D9D9D9",
      },
    };
  }

  nCol.alignment = { vertical: "middle", horizontal: "center" };
  qCol.alignment = { vertical: "middle", horizontal: "center" };
  cCol.alignment = { vertical: "middle", horizontal: "center" };
  pCol.alignment = { vertical: "middle", horizontal: "center" };

  /// Questions - sheet
  //var qSheet = workbook.addWorksheet("Questions");

  try {
    var stream = fs.createWriteStream(
      path.join(__dirname, "./results", gameID + ".xlsx")
    );
    await workbook.xlsx.write(stream);
  } catch (error) {
    console.error(error);
  }
}

//////////////////////////////////////////////\\\ HRA \\\////////////////////////////////////////////

io.on("connection", (socket) => {
  socket.on("start", async (gameID) => {
    var game = await Game.findOne({ code: gameID });
    if (game) {
      if (game.controlers.includes(socket.id)) {
        runCountdown(gameID);
      }
    }
  });
  socket.on("answer", async (res) => {
    const { index, gameID } = res;
    if (![0, 1, 2, 3].includes(index)) return;
    var game = await Game.findOne({ code: gameID });
    var temp = await Template.findOne({ id: game.template.id });
    if (game) {
      var guest = game.guests.find((x) => x.socketID == socket.id);
      if (guest && game.state.is == "QUESTION") {
        if (temp.questions[game.questionID]?.answers[index]?.correct) {
          var time = Date.now() - game.questionTime;
          var maxTime = temp.roundTime * 1000;

          var coins = scaleValue(time, [0, maxTime], [1000, 600]);

          guest.answers.push({
            correct: true,
            index,
            gainedCoins: coins,
          });
          guest.coins += coins;
          await Game.updateOne(
            { "guests.socketID": socket.id },
            { $set: { "guests.$": guest } }
          );
        } else {
          guest.answers.push({
            correct: false,
            index,
            gainedCoins: 0,
          });
          await Game.updateOne(
            { "guests.socketID": socket.id },
            { $set: { "guests.$": guest } }
          );
        }
        game = await Game.findOne({ code: gameID });
        if (
          game.guests.length ==
          game.guests.filter((x) => x.answers.length == game.questionID + 1)
            .length
        ) {
          result(gameID);
        }
      }
    }
  });
});

api.post("/game-auth", async (req, res) => {
  const { gameID, sid } = req.body;
  if (!/^\d{6}$/.test(gameID)) return;
  var game = await Game.findOne({ code: gameID });
  var socket = io.sockets.sockets.get(sid);
  if (req.session?.user == game?.author.username) {
    await Game.findOneAndUpdate(
      { code: gameID },
      { $push: { controlers: sid } }
    );

    if (socket) {
      socket.emit("auth", {
        role: "CONTROL",
      });
      socket.join(gameID);
      socket.join(gameID + "control");
    }
  } else {
    var guest = game.guests.find((g) => g.guestID == req.session.guestID);
    if (guest) {
      await Game.updateOne({ code: gameID }, { $pull: { guests: guest } });
      guest.socketID = sid;
      await Game.updateOne({ code: gameID }, { $push: { guests: guest } });
      if (socket) {
        socket.emit("auth", {
          role: "GUEST",
          nickname: guest.nickname,
          coins: guest.coins,
        });
        socket.join(gameID);
        if (game.state.is == "STARTING") {
          io.to(gameID).emit("screen", {
            is: "STARTING",
            guests: game.guests.map((g) => ({
              nickname: g.nickname,
              coins: g.coins,
            })),
          });
        }
      }
    } else {
      io.sockets.sockets.get(sid)?.disconnect(true);
    }
  }
  res.sendStatus(200);
});

api.get("/start", async (req, res) => {
  const id = req.query.id;
  const gameID = await getID();
  await Game.create({
    _id: new require("mongoose").Types.ObjectId(),
    code: gameID,
    template: {
      id: id,
    },
    state: {
      is: "STARTING",
    },
    guests: [],
    coins: [],
    author: {
      username: req.session.user,
    },
    stageID: uuid(),
    questionID: -1,
  });
  createGame(gameID);
  res.redirect("/" + gameID);
});

function createGame(gameID) {
  app.get("/" + gameID, async (req, res) => {
    var game = await Game.findOne({ code: gameID });
    var guest = game.guests.find((g) => g.guestID == req.session.guestID);

    if (guest) {
      res.status(200).sendFile(path.resolve("frontend/others/game.html"));
    } else if (req.session.user == game.author.username) {
      res.status(200).sendFile(path.resolve("frontend/others/game.html"));
    } else {
      res.sendStatus(401);
    }
  });
}

app.post("/join", async (req, res) => {
  const { gameID, nickname } = req.body;
  if (!gameID) {
    return res.status(200).send({
      stav: "missingG",
    });
  }
  if (!nickname) {
    return res.status(200).send({
      stav: "missingN",
    });
  }
  var game = await Game.findOne({ code: gameID });
  if (game) {
    if (game.state.is == "STARTING") {
      var id = uuid();
      await Game.updateOne(
        { code: gameID },
        {
          $push: {
            guests: {
              guestID: id,
              nickname: nickname.trim(),
              socketID: "",
              coins: 0,
              answers: [],
            },
          },
        }
      );
      req.session.guestID = id;
      return res.status(202).send({
        stav: "in",
      });
    } else {
      return res.status(200).send({
        stav: "notStarting",
      });
    }
  } else {
    return res.status(200).send({
      stav: "notExist",
    });
  }
});

api.get("/user", async (req, res) => {
  const user = await User.findOne({ username: req.session.user });
  res.status(200).send(user);
});

api.post("/log", async (req, res) => {
  if (req.body.username && req.body.password) {
    const { username, password } = req.body;
    try {
      const user = await User.findOne({ username });

      if (user) {
        if (user.verified.is) {
          if (user.password == password) {
            req.session.user = username;
            return res.status(200).send({
              stav: "loged",
            });
          } else {
            return res.status(200).send({
              stav: "pswd",
            });
          }
        } else {
          return res.status(200).send({
            stav: "notVerified",
          });
        }
      } else {
        return res.status(200).send({
          stav: "userIsnt",
        });
      }
    } catch (error) {
      console.error(error);
    }
  } else {
    return res.status(200).send({
      stav: "fillAll",
    });
  }
});

api.post("/reg", async (req, res) => {
  if (req.body.username && req.body.password && req.body.email) {
    const { username, password, email } = req.body;
    try {
      const user1 = await User.findOne({ username });
      const user2 = await User.findOne({ email });

      if (user1 || user2) {
        return res.status(200).send({
          stav: "used",
        });
      } else {
        const user = await User.create({
          _id: new require("mongoose").Types.ObjectId(),
          email: email.toLowerCase(),
          registered: Date.now(),
          verified: {
            is: false,
            time: null,
          },
          password,
          username,
          templates: [],
        });

        const verToken = jwt.sign(
          {
            id: user._id,
          },
          process.env.VERTOKEN_KEY,
          {
            expiresIn: "2h",
          }
        );

        transporter.sendMail(
          {
            from: "kozooh@kozohorsky.xyz",
            to: [email.toLowerCase()],
            subject: "Registrace",
            html: `<h1>Ov????en?? emailu</h1><a href="${
              req.hostname == "localhost" ? "http" : "https"
            }://${
              req.hostname
            }/api/ver?token=${verToken}">Ov????it</a><p>Pokud jste se neregistrovali na kozooh.kozohorsky.xyz, na nic neklikejte.</p>`,
          },
          (err, info) => {
            if (err) {
              console.error(err);
            }
          }
        );
        res.status(200).sendFile(path.resolve("frontend/others/verify.html"));
      }
    } catch (error) {
      console.error(error);
    }
  } else {
    return res.status(200).send({
      stav: "fillAll",
    });
  }
});

api.get("/user-games", auth, async (req, res) => {
  const templates = await Template.find({});
  var userTemplates = templates.filter(
    (x) => x.author.username == req.session.user
  );

  res.status(200).send({ templates: userTemplates });
});

api.get("/user-get-temp", auth, async (req, res) => {
  const templates = await Template.find({
    "author.username": req.session.user,
  });

  var temp = templates.find((x) => x.id == req.query.id);
  if (temp) {
    res.status(200).send(temp);
  } else {
    res.sendStatus(401);
  }
});

api.post("/create-template", auth, async (req, res) => {
  var { questions, name, roundTime, show, pause, pauseTime, edit } = req.body;

  if (roundTime <= 0) {
    return res.status(200).send({
      stav: "negative",
    });
  }
  if (pause) {
    if (pauseTime <= 0) {
      return res.status(200).send({
        stav: "negative",
      });
    }
  }
  name.trim();
  if (!name || name == "" || /^\s+$/.test(name)) {
    return res.status(200).send({
      stav: "missingName",
    });
  }
  var q2 = questions.filter((x) => x != undefined);
  q2.forEach((x, i) => {
    q2[i].answers = x.answers.filter((y) => y != undefined);
  });
  if (q2.length == 0) {
    return res.status(200).send({
      stav: "length0",
    });
  }

  q2.forEach((x, i) => {
    q2[i].question = x.question.trim();
    x.answers.forEach((y, ii) => {
      q2[i].answers[ii].answer = y.answer.trim();
    });
  });

  var missingA = false;
  var missingCorrectA = false;
  var emptyA = false;
  var max4A = false;
  q2.forEach((x, i) => {
    if (x.answers.length == 0) {
      missingA = true;
    } else if (x.answers.length > 4) {
      max4A = true;
    } else {
      var mis = false;
      x.answers.forEach((y, ii) => {
        if (y.correct) {
          mis = true;
        }
        if (/^\s+$/.test(y.answer)) {
          emptyA = true;
        }
      });
      missingCorrectA = !mis;
    }
  });
  if (missingA) {
    return res.status(200).send({
      stav: "missingA",
    });
  }
  if (max4A) {
    return res.status(200).send({
      stav: "max4A",
    });
  }
  if (emptyA) {
    return res.status(200).send({
      stav: "emptyA",
    });
  }
  if (missingCorrectA) {
    return res.status(200).send({
      stav: "missingCorrectA",
    });
  }

  // all checks have been done

  if (edit.is) {
    await Template.updateOne(
      { id: edit.id },
      {
        questions: q2,
        name,
        show,
        pause,
        roundTime,
        pauseTime,
      }
    );

    return res.status(200).send({
      stav: "redirect",
    });
  } else {
    const template = await Template.create({
      _id: new require("mongoose").Types.ObjectId(),
      id: uuid(),
      used: 0,
      questions: q2,
      author: {
        username: req.session.user,
      },
      created: Date.now(),
      name,
      show,
      pause,
      roundTime,
      pauseTime,
    });

    const user = await User.findOne({ username: req.session.user });
    var templates = user.templates;
    templates.push(template.id);
    await User.findOneAndUpdate({ username: req.session.user }, { templates });

    return res.status(200).send({
      stav: "redirect",
    });
  }
});

api.get("/smazat", async (req, res) => {
  const id = req.query.id;
  const temp = await Template.findOne({ id });
  await Template.deleteOne({ id });
  res.redirect("/ucet/?alert=deleted?name=" + temp.name);
});

api.get("/ver", async (req, res) => {
  var verToken = req.query.token;
  try {
    const decoded = jwt.verify(verToken, process.env.VERTOKEN_KEY);
    await User.findOneAndUpdate(
      { _id: decoded.id },
      { verified: { is: true, when: Date.now() } }
    );
    return res.status(200).redirect("/prihlaseni?alert=verified");
  } catch (err) {
    return res.status(401).send("Invalid Token");
  }
});

/////////////////////////////////////////////////////////////////////////// FILE RESULTS

app.get(/\/results\/\d{6}.xlsx/, (req, res) => {
  fs.access(
    path.join(__dirname, "/results", path.basename(req.path)),
    fs.constants.F_OK,
    (err) => {
      if (!err) {
        res.status(200).sendFile(
          path.join(__dirname, "/results", path.basename(req.path)),
          {
            headers: {
              "content-type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          },
          (errr) => {
            if (errr) {
              console.error(errr);
              return res.sendStatus(500);
            }
          }
        );
      } else {
        return res.sendStatus(404);
      }
    }
  );
});

function scaleValue(value, from, to) {
  var scale = (to[1] - to[0]) / (from[1] - from[0]);
  var capped = Math.min(from[1], Math.max(from[0], value)) - from[0];
  return ~~(capped * scale + to[0]);
}

console.log("Kozooh - " + port);
