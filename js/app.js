(function () {
  var cfg = window.SION_CONFIG;
  var elServeur = document.getElementById("etat-serveur");
  var elReseau = document.getElementById("etat-reseau");
  var bouton = document.getElementById("btn-verifier");

  function afficher(element, texte, classe) {
    element.textContent = texte;
    element.className = "etat " + classe;
  }

  function verifierReseau() {
    if (navigator.onLine) {
      afficher(elReseau, "En ligne", "ok");
    } else {
      afficher(elReseau, "Hors connexion", "erreur");
    }
  }

  function verifierServeur() {
    if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf("COLLEZ") === 0) {
      afficher(elServeur, "Adresse à renseigner dans js/config.js", "erreur");
      return;
    }
    afficher(elServeur, "Vérification…", "attente");

    fetch(cfg.SUPABASE_URL + "/auth/v1/health", {
      headers: { apikey: cfg.SUPABASE_KEY }
    })
      .then(function (reponse) {
        if (reponse.ok) {
          afficher(elServeur, "Connecté", "ok");
        } else {
          afficher(elServeur, "Refusé (code " + reponse.status + ")", "erreur");
        }
      })
      .catch(function () {
        afficher(elServeur, "Serveur injoignable", "erreur");
      });
  }

  function toutVerifier() {
    verifierReseau();
    verifierServeur();
  }

  window.addEventListener("online", toutVerifier);
  window.addEventListener("offline", toutVerifier);
  bouton.addEventListener("click", toutVerifier);
  toutVerifier();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
