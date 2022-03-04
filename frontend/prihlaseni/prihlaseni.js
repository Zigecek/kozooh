var queryDict = {};
location.search
  .substring(1)
  .split("?")
  .forEach(function (item) {
    queryDict[item.split("=")[0]] = item.split("=")[1];
  });

if (queryDict.alert == "verified") {
  alertos(5000, "success", "Tvůj email byl ověřen, můžeš se přihlásit!", 1000);
}

var inputs = document.querySelectorAll("input");
function validate(event, input) {
  if (!input.checkValidity()) {
    event.preventDefault();
    event.stopPropagation();
  }

  input.parentElement.classList.add("was-validated");
}
inputs.forEach(function (input) {
  input.addEventListener("input", (e) => validate(e, input), false);
  input.addEventListener("blur", (e) => validate(e, input), false);
  input.addEventListener(
    "focus",
    function (event) {
      input.parentElement.classList.remove("was-validated");
      $("#sendForm").removeClass("was-validated");
    },
    false
  );
});

var forms = document.querySelectorAll(".needs-validation");
Array.prototype.slice.call(forms).forEach(function (form) {
  form.addEventListener(
    "submit",
    function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }

      event.preventDefault();
      $("#submit").addClass("visually-hidden");
      $("#loading-blue").removeClass("visually-hidden");

      function clearUsername() {
        var newInputs = document.querySelectorAll("input");
        Array.prototype.slice.call(newInputs).forEach(function (input) {
          if (input.id != "username") {
            $(input).removeClass("is-invalid").removeClass("is-valid").val("");
            $(input.parentElement).removeClass("was-validated");
          }
        });
        $("#sendForm").removeClass("was-validated");
      }
      function clearAll() {
        var newInputs = document.querySelectorAll("input");
        Array.prototype.slice.call(newInputs).forEach(function (input) {
          $(input).removeClass("is-invalid").removeClass("is-valid").val("");
          $(input.parentElement).removeClass("was-validated");
        });
        $("#sendForm").removeClass("was-validated");
      }
      axios
        .post("/api/log", {
          username: $("#username").val(),
          password: $("#password").val().hashCode(),
        })
        .then(function (res) {
          $("#submit").removeClass("visually-hidden");
          $("#loading-blue").addClass("visually-hidden");
          if (res.data.stav == "loged") {
            window.location = "/?alert=login";
          } else if (res.data.stav == "fillAll") {
            alertos(4000, "danger", "Špatně vyplněná políčka.", 1000);
            clearAll();
          } else if (res.data.stav == "userIsnt") {
            alertos(4000, "danger", "Uživatel neexistuje.", 1000);
            clearAll();
          } else if (res.data.stav == "pswd") {
            alertos(4000, "danger", "Špatné heslo.", 1000);
            clearUsername();
          } else if (res.data.stav == "notVerified") {
            alertos(
              4000,
              "danger",
              "Před přihlášením si musíš ověřit email.",
              1000
            );
            clearAll();
          } else {
            alertos(4000, "danger", "Došlo k chybě.", 1000);
            clearAll();
          }
        })
        .catch(function (error) {
          console.log(error);
        });

      form.classList.add("was-validated");
    },
    false
  );
});

String.prototype.hashCode = function () {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }
  return new Uint32Array([hash])[0].toString(36);
};

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
