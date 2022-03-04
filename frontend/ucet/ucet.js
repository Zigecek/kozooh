var queryDict = {};
location.search
  .substring(1)
  .split("?")
  .forEach(function (item) {
    queryDict[item.split("=")[0]] = item.split("=")[1];
  });

if (queryDict.alert == "deleted") {
  alertos(5000, "success", `"${queryDict.name}" úspěšně smazána.`, 1000);
}

axios
  .get("/api/user-games")
  .then(function (res) {
    if (res.data.templates) {
      res.data.templates.forEach((t) => {
        $("#template-list").append(
          $.parseHTML(
            `<li class="list-group-item"><div class="d-flex bd-highlight"><div class="align-self-center p-2 flex-grow-1 bd-highlight"><h3 class="fs-4">${t.name}</h3><p class="m-1"><span class="fw-bold">Počet otázek:</span> ${t.questions.length}</p><p class="m-1"><span class="fw-bold">Použito:</span> ${t.used}x</p></div><div class="align-self-center p-2 bd-highlight"><a href="/upravit/?id=${t.id}" class="m-2 btn btn-sm btn-primary">Upravit</a></div><div class="align-self-center p-2 bd-highlight"><a href="/api/start/?id=${t.id}" class="m-2 btn btn-sm btn-primary">Start</a></div><div class="align-self-center p-2 bd-highlight"> <button onclick="deleteTemplate('${t.id}', this)" class="m-2 btn btn-sm btn-danger">Smazat</button> </div> </div> <div id="delete-alert-${t.id}" class="alert alert-warning fade show visually-hidden" role="alert"><p>Opravdu chceš smazat tuto předlohu?</p><a href="/api/smazat/?id=${t.id}" class="m-2 btn btn-sm btn-danger" >Smazat</a><button onclick="hide(this)" class="m-2 btn btn-sm btn-secondary">Zrušit</button></div></li>`
          )
        );
      });
    } else {
    }
  })
  .catch(function (error) {
    console.log(error);
  });

function deleteTemplate(id) {
  $(`#delete-alert-${id}`).removeClass("visually-hidden");
}
function hide(e) {
  $(e.parentElement).addClass("visually-hidden");
}

axios
  .get("/api/user")
  .then(function (res) {
    if (res.data.username) {
      $("#account").html(
        `<a href="/ucet">${res.data.username}</a> -- <a href="/odhlaseni">Odhlásit</a>`
      );
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
