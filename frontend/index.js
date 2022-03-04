var queryDict = {};
location.search
  .substring(1)
  .split("?")
  .forEach(function (item) {
    queryDict[item.split("=")[0]] = item.split("=")[1];
  });

if (queryDict.alert == "login") {
  alertos(5000, "success", "Byl jsi úspěšně přihlásen!", 1000);
} else if (queryDict.alert == "alrLoged") {
  alertos(5000, "warning", "Už jsi přihlášen!", 1000);
}

function join() {
  if ($("#game-id").val() && $("#nickname").val()) {
    var url = "/" + $("#game-id").val();
    $("#submit").attr("disabled", true);
    axios
      .post("/join", {
        nickname: $("#nickname").val(),
        gameID: $("#game-id").val(),
      })
      .then(function (res) {
        if (res.data.stav == "notStarting") {
          alertos(5000, "warning", "Tato hra už bohužel probíhá!", 1000);
          $("#submit").attr("disabled", false);
        } else if (res.data.stav == "missingG") {
          alertos(5000, "warning", "Musíš zadat číslo hry...", 1000);
          $("#submit").attr("disabled", false);
        } else if (res.data.stav == "missingN") {
          alertos(5000, "warning", "Bez přezdívky to nejde...", 1000);
          $("#submit").attr("disabled", false);
        } else if (res.data.stav == "notExist") {
          alertos(5000, "danger", "Tato hra neexistuje.", 1000);
          $("#submit").attr("disabled", false);
        } else if (res.data.stav == "in") {
          window.location.href = url;
        }
      })
      .catch(function (error) {
        if (error) {
          alertos(5000, "danger", "Toto číslo hry neexistuje!", 1000);
          $("#submit").attr("disabled", false);
          $("#game-id").val("");
        }
        console.log(error);
      });
  }
}
axios
  .get("/api/user")
  .then(function (res) {
    console.log(res.data);
    if (res.data.username) {
      $("#account").html(`
            <a href="/ucet">${res.data.username}</a>
            -
            <a href="/odhlaseni">Odhlásit</a>`);
    }
  })
  .catch(function (error) {
    $("#submit").removeClass("visually-hidden");
    $("#loading-blue").addClass("visually-hidden");
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
