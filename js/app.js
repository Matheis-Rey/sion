(function () {
  "use strict";

  var SITUATIONS = ["Célibataire", "Marié(e)", "Divorcé(e)", "Veuf / Veuve"];
  var VUES = ["chargement", "connexion", "message", "fiche"];
  var etat = { membre: null, prive: null, fonctions: [], departements: [] };

  function $(id) {
    return document.getElementById(id);
  }

  function montrer(nom) {
    VUES.forEach(function (n) {
      $("vue-" + n).hidden = (n !== nom);
    });
    window.scrollTo(0, 0);
  }

  function afficherMessage(zone, texte, type) {
    zone.textContent = texte || "";
    zone.className = "message " + (type || "erreur");
    zone.hidden = !texte;
  }

  function creer(balise, classe, texte) {
    var e = document.createElement(balise);
    if (classe) { e.className = classe; }
    if (texte !== undefined && texte !== null) { e.textContent = texte; }
    return e;
  }

  function vueMessage(titre, texte, avecReessayer) {
    $("message-titre").textContent = titre;
    $("message-texte").textContent = texte;
    $("btn-reessayer").hidden = !avecReessayer;
    montrer("message");
  }

  /* ---------- Connexion ---------- */

  function initConnexion() {
    var champEmail = $("champ-email");
    var champMdp = $("champ-mdp");
    var zone = $("msg-connexion");
    var bouton = $("btn-connexion");

    $("btn-voir-mdp").addEventListener("click", function () {
      var cache = champMdp.type === "password";
      champMdp.type = cache ? "text" : "password";
      this.textContent = cache ? "Masquer" : "Afficher";
    });

    $("form-connexion").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = champEmail.value.trim();
      var mdp = champMdp.value;

      if (!email || !mdp) {
        afficherMessage(zone, "Saisissez votre adresse e-mail et votre mot de passe.");
        return;
      }

      afficherMessage(zone, "");
      bouton.disabled = true;
      bouton.textContent = "Connexion…";

      SionApi.connecter(email, mdp)
        .then(function () {
          champMdp.value = "";
          return chargerFiche();
        })
        .catch(function (err) {
          afficherMessage(zone, SionApi.messageErreur(err));
        })
        .then(function () {
          bouton.disabled = false;
          bouton.textContent = "Se connecter";
        });
    });
  }

  function deconnexion() {
    SionApi.deconnecter().catch(function () {}).then(function () {
      etat = { membre: null, prive: null, fonctions: [], departements: [] };
      $("champ-mdp").value = "";
      afficherMessage($("msg-connexion"), "");
      montrer("connexion");
    });
  }

  /* ---------- Chargement de la fiche ---------- */

  function chargerFiche() {
    montrer("chargement");
    return SionApi.utilisateur()
      .then(function (user) {
        if (!user) {
          montrer("connexion");
          return null;
        }
        return SionApi.chargerMaFiche(user.id).then(function (donnees) {
          var m = donnees.membre;
          if (!m || !m.compte_actif || m.statut !== "membre") {
            vueMessage(
              "Compte non activé",
              "Votre compte n'est pas encore activé. Veuillez contacter un responsable de l'Église.",
              false
            );
            return null;
          }
          etat = donnees;
          afficherFiche();
          montrer("fiche");
          return null;
        });
      })
      .catch(function (err) {
        vueMessage("Chargement impossible", SionApi.messageErreur(err), true);
      });
  }

  /* ---------- Affichage de la fiche ---------- */

  function oui(valeur) {
    if (valeur === true) { return "Oui"; }
    if (valeur === false) { return "Non"; }
    return "Non renseigné";
  }

  function texte(valeur) {
    return valeur ? valeur : "Non renseigné";
  }

  function afficherFiche() {
    var m = etat.membre;
    var p = etat.prive || {};

    var initiales = ((m.prenom || "").charAt(0) + (m.nom || "").charAt(0)).toUpperCase();
    $("avatar").textContent = initiales || "?";
    $("fiche-nom").textContent = (m.prenom + " " + m.nom).trim();
    $("fiche-fonctions").textContent = etat.fonctions.length ? etat.fonctions.join(" · ") : "Membre";

    var principal = etat.departements.filter(function (d) { return d.principal; })[0];
    var secondaires = etat.departements
      .filter(function (d) { return !d.principal; })
      .map(function (d) { return d.nom; });

    var lieu = [m.quartier, m.commune].filter(Boolean).join(", ");

    var lignes = [
      ["Lieu d'habitation", texte(lieu)],
      ["Situation matrimoniale", texte(m.situation_matrimoniale)],
      ["Téléphone", texte(p.telephone)],
      ["Adresse e-mail", texte(p.email)],
      ["Baptême d'eau", oui(p.bapteme_eau)],
      ["Baptême du Saint-Esprit", oui(p.bapteme_esprit)],
      ["Département principal", principal ? principal.nom : "Aucun"],
      ["Départements secondaires", secondaires.length ? secondaires.join(", ") : "Aucun"]
    ];

    var liste = $("liste-infos");
    liste.textContent = "";
    lignes.forEach(function (l) {
      liste.appendChild(creer("dt", null, l[0]));
      liste.appendChild(creer("dd", null, l[1]));
    });

    $("v-telephone").checked = !!p.show_telephone;
    $("v-email").checked = !!p.show_email;
    $("v-baptemes").checked = !!p.show_baptemes;
    $("carte-visibilite").hidden = !etat.prive;
  }

  /* ---------- Modification de la fiche ---------- */

  function remplirSituations(valeurCourante) {
    var select = $("f-situation");
    select.textContent = "";
    var options = [""].concat(SITUATIONS);
    if (valeurCourante && options.indexOf(valeurCourante) === -1) {
      options.push(valeurCourante);
    }
    options.forEach(function (v) {
      var o = creer("option", null, v === "" ? "Non renseignée" : v);
      o.value = v;
      select.appendChild(o);
    });
    select.value = valeurCourante || "";
  }

  function ouvrirEdition() {
    var m = etat.membre;
    var p = etat.prive;

    $("f-prenom").value = m.prenom || "";
    $("f-nom").value = m.nom || "";
    remplirSituations(m.situation_matrimoniale);
    $("f-commune").value = m.commune || "";
    $("f-quartier").value = m.quartier || "";
    $("f-bapteme-eau").checked = !!(p && p.bapteme_eau);
    $("f-bapteme-esprit").checked = !!(p && p.bapteme_esprit);
    $("f-bapteme-eau").parentNode.hidden = !p;
    $("f-bapteme-esprit").parentNode.hidden = !p;

    afficherMessage($("msg-form"), "");
    afficherMessage($("msg-fiche"), "");
    $("carte-infos").hidden = true;
    $("carte-visibilite").hidden = true;
    $("form-fiche").hidden = false;
    $("form-fiche").scrollIntoView();
  }

  function fermerEdition() {
    $("form-fiche").hidden = true;
    $("carte-infos").hidden = false;
    $("carte-visibilite").hidden = !etat.prive;
    window.scrollTo(0, 0);
  }

  function rafraichir() {
    return SionApi.utilisateur().then(function (user) {
      return SionApi.chargerMaFiche(user.id);
    }).then(function (donnees) {
      etat = donnees;
      afficherFiche();
    });
  }

  function initEdition() {
    $("btn-modifier").addEventListener("click", ouvrirEdition);
    $("btn-annuler").addEventListener("click", fermerEdition);

    $("form-fiche").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("msg-form");
      var bouton = $("btn-enregistrer");

      var prenom = $("f-prenom").value.trim();
      var nom = $("f-nom").value.trim();
      if (!prenom || !nom) {
        afficherMessage(zone, "Le prénom et le nom sont obligatoires.");
        return;
      }

      var champs = {
        prenom: prenom,
        nom: nom,
        situation_matrimoniale: $("f-situation").value || null,
        commune: $("f-commune").value.trim() || null,
        quartier: $("f-quartier").value.trim() || null
      };

      afficherMessage(zone, "");
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";

      SionApi.modifierMembre(etat.membre.id, champs)
        .then(function () {
          if (etat.prive) {
            return SionApi.modifierPrive(etat.membre.id, {
              bapteme_eau: $("f-bapteme-eau").checked,
              bapteme_esprit: $("f-bapteme-esprit").checked
            });
          }
          return null;
        })
        .then(rafraichir)
        .then(function () {
          fermerEdition();
          afficherMessage($("msg-fiche"), "Vos modifications ont été enregistrées.", "ok");
        })
        .catch(function (err) {
          afficherMessage(zone, SionApi.messageErreur(err));
        })
        .then(function () {
          bouton.disabled = false;
          bouton.textContent = "Enregistrer";
        });
    });
  }

  /* ---------- Confidentialité ---------- */

  function initVisibilite() {
    [
      ["v-telephone", "show_telephone"],
      ["v-email", "show_email"],
      ["v-baptemes", "show_baptemes"]
    ].forEach(function (couple) {
      var case_ = $(couple[0]);
      var colonne = couple[1];

      case_.addEventListener("change", function () {
        var valeur = case_.checked;
        var champs = {};
        champs[colonne] = valeur;
        case_.disabled = true;

        SionApi.modifierPrive(etat.membre.id, champs)
          .then(function () {
            etat.prive[colonne] = valeur;
            afficherMessage($("msg-fiche"), "Votre choix de confidentialité est enregistré.", "ok");
          })
          .catch(function (err) {
            case_.checked = !valeur;
            afficherMessage($("msg-fiche"), SionApi.messageErreur(err));
          })
          .then(function () {
            case_.disabled = false;
          });
      });
    });
  }

  /* ---------- Démarrage ---------- */

  function demarrer() {
    initConnexion();
    initEdition();
    initVisibilite();

    $("btn-deconnexion").addEventListener("click", deconnexion);
    $("btn-quitter").addEventListener("click", deconnexion);
    $("btn-reessayer").addEventListener("click", chargerFiche);

    SionApi.surChangementSession(function (evenement) {
      if (evenement === "SIGNED_OUT") {
        montrer("connexion");
      }
    });

    chargerFiche();
  }

  demarrer();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
