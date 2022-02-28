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
const Guest = require("./models/guest");
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

//////////////////////////////////////////////// STATIC ///////////////////////////

app.use(serveStatic("./frontend/"));

////////////////////////////////// API /////////////////////////////////////////////
var api = express.Router({ mergeParams: true });
app.use("/api", api);

///////////////////////////////// HRA /////////////////////////////////////////////

async function runCountdown(gameID) {
  //////////////////////////// COUNTDOWN
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
    var game = await Game.findOne({ code: gameID });
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
      questionID: game.questionID + 1,
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
  });

  io.to(gameID + "control").emit("screen", {
    is: "QUESTION-SHOWED",
    question: temp.questions[index].question,
    answers: temp.questions[index].answers.map((x) => x.answer),
  });
  setTimeout(async () => {
    var game = await Game.findOne({ code: gameID });
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
        position: null,
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
  game.guests.forEach((g, gi) => {
    var socket = io.sockets.sockets.get(g.socketID);
    if (socket) {
      socket.emit("screen", {
        is: "RESULT",
        correct: g.answers[g.answers.length - 1]?.correct,
      });
    }
  });
  setTimeout(async () => {
    var game = await Game.findOne({ code: gameID });
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
      pause(gameID);
    } else {
      question(gameID);
    }
  } else {
    evaluate(gameID);
  }
}
async function pause(gameID) {
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
    var game = await Game.findOne({ code: gameID });
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
    var correct = g.answers.filter((a) => a.correct).length; // počet spravnych odpovedi
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
        average.questions[i].answers[a.index].votes = average.questions[i]
          .answers[a.index]?.votes
          ? average.questions[i].answers[a.index].votes + 1 // pokud uz .votes existuje tak jen pricte
          : 1; // pokud ne tak vytvori
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
        (a.votes / average.players) * 100 // vypočítá procenta a zaokrouhlí
      );
    });
  });

  await xlsx(average, guests, gameID);

  io.to(gameID).emit("screen", {
    is: "EVALUATION",
    average,
    guests,
  });
}

async function xlsx(average, guests, gameID) {
  var workbook = new ExcelJS.Workbook();

  /// PLAYERS - sheet
  var pSheet = workbook.addWorksheet("Players");

  pSheet.columns = [
    { header: "Přezdívka", key: "nickname", width: 15 },
    { header: "Správné otázky", key: "questions", width: 15 },
    { header: "Body", key: "coins", width: 15 },
    { header: "Úspěšnost", key: "percent", width: 15 },
  ];

  var nColVals = guests.map((x) => x.nickname);
  var qColVals = guests.map((x) => x.correct + "/" + average.questions.length);
  var cColVals = guests.map((x) => x.coins);
  var pColVals = guests.map((x) => x.uspesnost);

  var nCol = pSheet.getColumn("nickname");
  var qCol = pSheet.getColumn("questions");
  var cCol = pSheet.getColumn("coins");
  var pCol = pSheet.getColumn("percent");

  nCol.values = nColVals;
  qCol.values = qColVals;
  cCol.values = cColVals;
  pCol.values = pColVals;

  nCol.alignment = { vertical: "middle", horizontal: "center" };
  qCol.alignment = { vertical: "middle", horizontal: "center" };
  cCol.alignment = { vertical: "middle", horizontal: "center" };
  pCol.alignment = { vertical: "middle", horizontal: "center" };

  /// Questions - sheet
  var qSheet = workbook.addWorksheet("Questions");
  /*
  average.questions.forEach(q => {
    var quC
  })*/
  try {
    await workbook.xlsx.writeFile(
      path.join(__dirname, "./results", gameID + ".xlsx")
    );
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
    var game = await Game.findOne({ code: gameID });
    var temp = await Template.findOne({ id: game.template.id });
    if (game) {
      var guest = game.guests.find((x) => x.socketID == socket.id);
      if (guest) {
        if (game.state.is == "QUESTION") {
          if (
            temp.questions[game.questionID]?.answers[index]?.correct == true
          ) {
            var time = Date.now() - game.questionTime;
            var maxTime = temp.roundTime * 1000;

            function scaleValue(value, from, to) {
              var scale = (to[1] - to[0]) / (from[1] - from[0]);
              var capped =
                Math.min(from[1], Math.max(from[0], value)) - from[0];
              return ~~(capped * scale + to[0]);
            }
            var coins = scaleValue(time, [0, maxTime], [1000, 600]);
            console.log(coins);

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
    }
  });
});

api.post("/game-auth", async (req, res) => {
  const { gameID, sid } = req.body;
  if (!/^\d{6}$/.test(gameID)) return;
  var game = await Game.findOne({ code: gameID });
  if (game) {
    if (req.session?.user == game.author.username) {
      await Game.findOneAndUpdate(
        { code: gameID },
        { $push: { controlers: sid } }
      );
      var socket = io.sockets.sockets.get(sid);
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
        var socket = io.sockets.sockets.get(sid);
        if (socket) {
          socket.emit("auth", {
            role: "GUEST",
            nickname: guest.nickname,
            coins: guest.coins,
          });
          socket.join(gameID);
          io.to(gameID).emit("screen", {
            is: "STARTING",
            guests: game.guests.map((g) => ({
              nickname: g.nickname,
              coins: g.coins,
            })),
          });
        }
      } else {
        io.sockets.sockets.get(sid)?.disconnect(true);
      }
    }
  }
  res.sendStatus(200);
});

api.get("/start", async (req, res) => {
  const id = req.query.id;
  const gameID = await getID();
  var game = await Game.create({
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
  if (!req.body.username || !req.body.password) {
    return res.status(200).send({
      stav: "fillAll",
    });
  } else {
    const { username, password } = req.body;
    try {
      const user = await User.findOne({ username });

      if (!user) {
        return res.status(200).send({
          stav: "userIsnt",
        });
      } else {
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
      }
    } catch (error) {
      console.error(error);
    }
  }
});

api.post("/reg", async (req, res) => {
  if (!req.body.username || !req.body.password || !req.body.email) {
    return res.status(200).send({
      stav: "fillAll",
    });
  } else {
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
            html: `<h1>Ověření emailu</h1><a href="${
              req.hostname == "localhost" ? "http" : "https"
            }://${
              req.hostname
            }/api/ver?token=${verToken}">Ověřit</a><p>Pokud jste se neregistrovali na kozooh.kozohorsky.xyz, na nic neklikejte.</p>`,
          },
          (err, info) => {
            if (err) {
              console.error(err);
              return;
            }
          }
        );
        res.status(200).sendFile(path.resolve("frontend/others/verify.html"));
      }
    } catch (error) {
      console.error(error);
    }
  }
});

api.get("/user-games", auth, async (req, res) => {
  const templates = await Template.find({});
  var userTemplates = templates.filter(
    (x) => x.author.username == req.session.user
  );

  res.status(200).send({ templates: userTemplates });
});

api.post("/create-template", auth, async (req, res) => {
  var { questions, name, roundTime, show, pause, pauseTime } = req.body;
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
  q2.forEach((x, i) => {
    if (x.answers.length == 0) {
      missingA = true;
    } else {
      var mis = false;
      x.answers.forEach((y, ii) => {
        if (y.correct) {
          mis = true;
        }
        if (/^\s+$/.test(y.answer)) {
          emptyA.true;
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
    const user = await User.findOneAndUpdate(
      { _id: decoded.id },
      { verified: { is: true, when: Date.now() } }
    );
    return res.status(200).redirect("/prihlaseni?alert=verified");
  } catch (err) {
    return res.status(401).send("Invalid Token");
  }
});

/////////////////////////////////////////////////////////////////////////// FILE RESULTS

var resR = express.Router({ mergeParams: true });
app.use("/results", resR);

resR.get(/\/[0-9]{6}.xlsx/, (req, res) => {
  fs.access(
    path.join(__dirname, "/results", path.basename(req.path)),
    fs.constants.F_OK,
    (err) => {
      if (!err) {
        res.sendFile(
          path.join(__dirname, "/results", path.basename(req.path)),
          {
            headers: {
              "content-type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          },
          (err) => {
            return res.sendStatus(500);
          }
        );
      } else {
        return res.sendStatus(404);
      }
    }
  );
});

console.log("Kozooh - " + port);
