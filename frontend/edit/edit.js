var queryDict = {};
location.search
  .substring(1)
  .split("?")
  .forEach(function (item) {
    queryDict[item.split("=")[0]] = item.split("=")[1];
  });
var questions = [];
const id = queryDict.id;

axios
  .get("/api/user-get-temp", {
    params: {
      id: id,
    },
  })
  .then(function (res) {
    var temp = res.data;

    $("#template-name").val(temp.name);
    $("#question-time").val(temp.roundTime);
    $("#template-show").prop("checked", temp.show);
    $("#template-pause").prop("checked", temp.pause);

    $("#pause-time").val(temp.pauseTime);

    if (temp.pause) {
      $("#pause-time").removeClass("visually-hidden");
    } else {
      $("#pause-time").addClass("visually-hidden");
    }

    temp.questions.forEach((q, qi) => {
      newQuestion(q.question);
      q.answers.forEach((a, ai) => {
        newAnswer(qi, a.answer, a.correct);
      });
    });
  })
  .catch(function (error) {
    console.log(error);
    if (error.res.status == 401) {
      return alertos(5000, "danger", "Můžeš upravovat jen své vzory.", 1000);
    }
  });

var listenedInputIDs = [];
function inputListeners() {
  var inputs = document.querySelectorAll("input");
  inputs.forEach((input) => {
    if (!listenedInputIDs.includes(input.id)) {
      if (
        /^q-\d+$/.test(input.id) ||
        /^a-\d+-\d+$/.test(input.id) ||
        /^a-\d+-\d+-correct$/.test(input.id)
      ) {
        input.addEventListener("input", (e) => {
          var splitID = input.id.split("-");
          splitID.shift();

          var index = Number(splitID[0]);
          var index2 = Number(splitID[1]);
          if (/^q-\d+$/.test(input.id)) {
            questions[index].question = input.value;
          } else if (/^a-\d+-\d+$/.test(input.id)) {
            questions[index].answers[index2].answer = input.value;
          } else if (/^a-\d+-\d+-correct$/.test(input.id)) {
            questions[index].answers[index2].correct = input.checked;
          }
          console.log(questions);
        });
        listenedInputIDs.push(input.id);
      }
    }
  });
}
inputListeners();

function createTemplate() {
  var data = {
    show: $("#template-show").prop("checked"),
    pause: $("#template-pause").prop("checked"),
    roundTime: Number($("#question-time").val()),
    pauseTime: Number($("#pause-time").val()),
    name: $("#template-name").val(),
    questions,
    edit: {
      is: true,
      id,
    },
  };
  console.log(data);
  axios
    .post("/api/create-template", data)
    .then(function (res) {
      if (res.data.stav == "redirect") {
        window.location = "/ucet";
      } else if (res.data.stav == "length0") {
        return alertos(
          5000,
          "danger",
          "Nemůžete vytvořit předlohu bez otázek.",
          1000
        );
      } else if (res.data.stav == "missingA") {
        return alertos(
          5000,
          "danger",
          "Nemůžete vytvořit otázku bez odpovědí.",
          1000
        );
      } else if (res.data.stav == "emptyA") {
        return alertos(
          5000,
          "danger",
          "Nemůžete vytvořit prázdnou odpověď.",
          1000
        );
      } else if (res.data.stav == "missingCorrectA") {
        return alertos(
          5000,
          "danger",
          "Nemůžete vytvořit otázku bez správné odpovědi.",
          1000
        );
      } else if (res.data.stav == "missingName") {
        return alertos(
          5000,
          "danger",
          "Nemůžete vytvořit předlohu bez názvu.",
          1000
        );
      } else if (res.data.stav == "negative") {
        return alertos(5000, "danger", "Nemůžete použít záporné číslo.", 1000);
      }
    })
    .catch(function (error) {
      console.log(error);
    });
}

function newQuestion(question) {
  const newIndex = questions.length;
  const html = $.parseHTML(
    `<li id="q-${newIndex}-body" class="list-group-item"><div class="d-flex bd-highlight"><div class="align-self-center p-2 flex-grow-1 bd-highlight"><input id="q-${newIndex}" type="text" class="form-control" placeholder="Otázka" ${
      question ? "value='" + question + "'" : ""
    } /> <h2 class="fs-5 m-3">Odpovědi</h2><ul id="q-${newIndex}-list" class="m-2 list-group">${
      question
        ? ""
        : `<li id="a-${newIndex}-0-body" class="list-group-item"><div class="d-flex bd-highlight"><div class="align-self-center p-2 flex-grow-1 bd-highlight"><input id="a-${newIndex}-0" type="text" class="form-control" placeholder="Odpověď" /><div class="m-3 form-check"><input id="a-${newIndex}-0-correct" type="checkbox" class="form-check-input" /><label class="form-check-label" for="a-${newIndex}-0-correct">Správná odpověď</label></div></div><div class="align-self-center p-2 bd-highlight"><button onclick="deleteAnswer(${newIndex}, 0)" class="m-2 btn btn-sm btn-danger">Smazat</button></div></div></li>`
    }</ul><button class="btn btn-sm btn-primary" onclick="newAnswer(${newIndex})">Nová odpověď</button></div><div class="align-self-center p-2 bd-highlight"><button onclick="deleteQuestion(${newIndex})" class="m-2 btn btn-sm btn-danger">Smazat</button></div></div></li>`
  );
  $("#question-list").append(html);
  questions.push({
    question: question ? question : "",
    answers: question
      ? []
      : [
          {
            answer: "",
            correct: false,
          },
        ],
  });

  inputListeners();
}

function deleteQuestion(index) {
  $(`#q-${index}-body`).remove();
  questions[index] = undefined;
}

function newAnswer(index, answer, correct) {
  const newIndex = questions[index].answers.length;
  const html = $.parseHTML(
    `<li id="a-${index}-${newIndex}-body" class="list-group-item"><div class="d-flex bd-highlight"><div class="align-self-center p-2 flex-grow-1 bd-highlight"><input id="a-${index}-${newIndex}" type="text" class="form-control" placeholder="Odpověď" ${
      answer ? "value='" + answer + "'" : ""
    } /><div class="m-3 form-check"><input id="a-${index}-${newIndex}-correct" type="checkbox" class="form-check-input" ${
      correct ? "checked=" + correct : ""
    } /><label class="form-check-label" for="a-${index}-${newIndex}-correct">Správná odpověď</label></div></div><div class="align-self-center p-2 bd-highlight"><button onclick="deleteAnswer(${index}, ${newIndex})" class="m-2 btn btn-sm btn-danger">Smazat</button></div></div></li>`
  );
  $(`#q-${index}-list`).append(html);
  questions[index].answers.push({
    answer: answer ? answer : "",
    correct: answer ? correct : false,
  });
  inputListeners();
}

function deleteAnswer(index, index2) {
  $(`#a-${index}-${index2}-body`).remove();
  questions[index].answers[index2] = undefined;
}

var pauseNumber = document.getElementById("template-pause");
if (pauseNumber) {
  pauseNumber.addEventListener("change", function () {
    if (this.checked) {
      $("#pause-time").removeClass("visually-hidden");
    } else {
      $("#pause-time").addClass("visually-hidden");
    }
  });
}

axios
  .get("/api/user")
  .then(function (res) {
    if (res.data.username) {
      $("#account").html(`
          <a href="/ucet">${res.data.username}</a>
          -
          <a href="/odhlaseni">Odhlásit</a>`);
    }
  })
  .catch(function (error) {
    console.log(error);
  });

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
