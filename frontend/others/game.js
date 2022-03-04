$("#screen").html($("#starting").html());
const gameID = window.location.pathname.substring(1, 7);
$("#game-number").text(gameID);
var queryDict = {};
var role = "";
var interval = null;
var intervalTime = 0;
location.search
  .substring(1)
  .split("?")
  .forEach(function (item) {
    queryDict[item.split("=")[0]] = item.split("=")[1];
  });

const socket = io(window.location.origin);
socket.on("connect", () => {
  axios
    .post("/api/game-auth", {
      sid: socket.id,
      gameID,
    })
    .then(function (res) {})
    .catch(function (error) {
      console.error(error);
    });
});

socket.on("screen", (screen) => {
  if (screen.is == "STARTING") {
    stopInterval();
    $("#screen").html($("#starting").html());
    $("#game-number").text(gameID);
    screen.guests.forEach((g) => {
      var html = $.parseHTML(
        `<div class="m-3 border border-secondary rounded-1 d-inline-flex flex-nowrap bd-highlight"><h3 class="fs-4 bg-light px-4 py-1 m-0">${g.nickname}</h3></div>`
      );

      $("#player-list").append(html);
    });
  } else if (screen.is == "COUNTDOWN") {
    stopInterval();
    $("#screen").html($("#countdown").html());
    $("#countdown-time").text(screen.time);
    $("#questionTotal").removeClass("visually-hidden").text(screen.totalQ);
    $("#questionCurrent")
      .removeClass("visually-hidden")
      .text(screen.questionID + 1);
    $("#statss").removeClass("visually-hidden");
  } else if (screen.is == "QUESTION-SHOWED") {
    runInterval(screen.roundTime);
    $("#screen").html($("#question-showed").html());
    $("#question-text").text(screen.question);
    var type = ["primary", "danger", "success", "warning"];
    screen.answers.forEach((a, i) => {
      var html = $.parseHTML(
        `<div id="aBtn${i}" class="d-inline-flex flex-nowrap bd-highlight" style="width: 46%; height: 46%; margin: 1.5%"><button onclick="questionClick(${i})" class="btn btn-${type[i]} btn-lg w-100 h-100">${a}</button></div>`
      );
      $("#button-list").append(html);
    });
    if (role == "CONTROL") {
      var audio = document.getElementById("audioplayer");
      function getRndInteger(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      var url = "./others/audio/" + getRndInteger(0, 5) + ".mp3";

      audio.src = url;

      audio.oncanplay = function () {
        audio.play();
      };
      audio.load();
    }
  } else if (screen.is == "QUESTION-HIDDEN") {
    if (role == "CONTROL") return;
    runInterval(screen.roundTime);
    $("#screen").html($("#question-hidden").html());
    var type = ["primary", "danger", "success", "warning"];
    for (let i = 0; i < screen.answers.length; i++) {
      var html = $.parseHTML(
        `<div class="d-inline-flex flex-nowrap bd-highlight" style="width: 46%; height: 46%; margin: 1.5%"><button onclick="questionClick(${i})" class="btn btn-${type[i]} btn-lg w-100 h-100"></button></div>`
      );
      $("#button-list").append(html);
    }
  } else if (screen.is == "PAUSE") {
    stopInterval();
    document.getElementById("audioplayer").pause();
    $("#screen").html($("#pause").html());
    screen.guests.forEach((g, i) => {
      var html = $.parseHTML(
        `<li class="list-group-item d-flex justify-content-between align-items-start"><div class="ms-2 me-auto"><div class="fw-bold">${g.nickname}</div></div><span class="badge bg-primary rounded-pill">${g.coins}</span></li>`
      );
      $("#position-list").append(html);
    });
    if (role != "CONTROL") {
      $("#coins").text(
        screen.guests.find((x) => x.nickname == $("#nickname").text()).coins
      );
    }
  } else if (screen.is == "EVALUATION") {
    stopInterval();
    document.getElementById("audioplayer").pause();
    $("#screen").html($("#evaluation").html());
    $("#statss").addClass("visually-hidden");
    screen.average.questions.forEach((q, qi) => {
      var answers = "";
      q.answers.forEach((a, ai) => {
        answers =
          answers +
          "\n" +
          `<li class="list-group-item justify-content-between align-items-start"><h3 class="fs-5 m-3">${
            a.answer
          }</h3><div class="progress"><div class="progress-bar bg-${
            a.correct ? "success" : "danger"
          }" role="progressbar" style="width: ${
            a.percent
          }%"></div></div><h3 class="fs-4 m-2">${a.votes}/${
            screen.average.players
          } (${a.percent}%)</h3></li>`;
      });
      var html = $.parseHTML(
        `<li class="list-group-item justify-content-between align-items-start"><h3 class="fs-5 m-3">${q.question}</h3><div class="ms-2 me-auto w-100"><div><ul class="list-group m-4 fs-4">${answers}</ul></div></div></li>`
      );
      $("#question-list").append(html);
    });
    screen.guests.forEach((g) => {
      var html = $.parseHTML(
        `<li class="list-group-item d-flex justify-content-between align-items-start"><div class="ms-2 me-auto"><div class="fw-bold">${g.nickname}</div><div class="fs-5">${g.correct}/${screen.average.questions.length} (${g.uspesnost}%)</div></div><span class="badge bg-primary rounded-pill">${g.coins}</span></li>`
      );
      $("#winner-list").append(html);
    });
    $("#xlsx").attr(
      "href",
      window.location.hostname + "/results/" + gameID + ".xlsx"
    );
    if (role != "CONTROL") {
      $("#coins").text(
        screen.guests.find((x) => x.nickname == $("#nickname").text().coins)
      );
    }
  } else if (screen.is == "RESULT") {
    stopInterval();
    if (role != "CONTROL") {
      $("#screen").html($("#result").html());
      $("#resIcon").attr(
        "src",
        screen.correct
          ? "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Eo_circle_light-green_checkmark.svg/2048px-Eo_circle_light-green_checkmark.svg.png"
          : "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Cross_red_circle.svg/1200px-Cross_red_circle.svg.png"
      );
    } else {
      for (let i = 0; i <= 3; i++) {
        if (!screen.correct.includes(i)) {
          $("#aBtn" + i)
            .attr("disabled", true)
            .addClass("opacity0");
        } else {
          $("#aBtn" + i)
            .addClass("btn-success")
            .removeClass("btn-primary")
            .removeClass("btn-danger")
            .removeClass("btn-warning");
        }
      }
    }
  }
});

function questionClick(index) {
  if (role != "CONTROL") {
    socket.emit("answer", {
      index,
      gameID,
    });
    $("#screen").html($("#waiting").html());
  }
}

function startGame() {
  $("#startGame").addClass("visually-hidden");
  socket.emit("start", gameID);
}

socket.on("auth", (x) => {
  role = x.role;
  if (role == "CONTROL") {
    $("#startGame").removeClass("visually-hidden");
    $("#nickname").remove();
    $("#coins").remove();
    $("#coinIcon").remove();
  } else {
    $("#nickname").text(x.nickname);
    $("#coins").text(x.coins);
  }
});

function runInterval(roundTime) {
  var progress = document.getElementById("progress");
  progress.style.animation = "fade " + roundTime + "s";
}

function stopInterval() {
  clearInterval(interval);
  intervalTime = 0;

  var prog = document.getElementById("progress");
  prog.style.animation = "";
}

function alertos(time, type, text, fadeouttime) {
  var div = document.createElement("div");
  var el = $(div);
  el.addClass(["opacity-75", "alert", `alert-${type}`, "m-2"]);
  el.attr("role", "alert");
  el.text(text);
  el.appendTo("#alerts");

  setTimeout(() => {
    el.fadeOut(0.75 * fadeouttime);
    setTimeout(() => {
      el.removeClass("opacity-75");
    }, 0.25 * fadeouttime);
  }, time);
}
