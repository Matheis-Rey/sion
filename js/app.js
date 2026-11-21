(function () {
  "use strict";

  var SITUATIONS = ["Marié(e)", "Célibataire", "Veuf(ve)", "Concubinage", "Fiancé(e)"];
  var VUES = ["chargement", "connexion", "message", "fiche", "membres", "detail", "ajout"];
  var VUES_CONNECTEES = ["fiche", "membres", "detail", "ajout"];
  var VUES_AVEC_ONGLETS = ["fiche", "membres", "detail"];

  var etat = vide();
  var reference = { communes: null, departements: null };
  var annuaire = { membres: [], charge: false };

  function vide() {
    return { membre: null, prive: null, fonctions: [], departements: [], permissions: [] };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function peutGerer() {
    return etat.fonctions.indexOf("Pasteur") !== -1 ||
           etat.permissions.indexOf("gerer_membres") !== -1;
  }

  /* ---------- Utilitaires d'affichage ---------- */

  function montrer(nom) {
    VUES.forEach(function (n) {
      $("vue-" + n).hidden = (n !== nom);
    });

    var connecte = VUES_CONNECTEES.indexOf(nom) !== -1;
    var avecOnglets = VUES_AVEC_ONGLETS.indexOf(nom) !== -1;
    $("barre").hidden = !connecte;
    $("onglets").hidden = !avecOnglets;
    document.body.className = avecOnglets ? "avec-onglets" : "";

    var actif = (nom === "fiche") ? "onglet-fiche" : "onglet-membres";
    ["onglet-fiche", "onglet-membres"].forEach(function (id) {
      if (id === actif && avecOnglets) {
        $(id).setAttribute("aria-current", "page");
      } else {
        $(id).removeAttribute("aria-current");
      }
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

  function initiales(membre) {
    var i = ((membre.prenom || "").charAt(0) + (membre.nom || "").charAt(0)).toUpperCase();
    return i || "?";
  }

  function nomComplet(membre) {
    return ((membre.prenom || "") + " " + (membre.nom || "")).trim();
  }

  function normaliser(s) {
    return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function comparer(a, b) {
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  }

  function texte(valeur) {
    return valeur ? valeur : "Non renseigné";
  }

  function ouiNon(valeur) {
    if (valeur === true) { return "Oui"; }
    if (valeur === false) { return "Non"; }
    return "Non renseigné";
  }

  function formaterTelephone(tel) {
    var m = /^\+225(\d{10})$/.exec(tel || "");
    if (!m) { return texte(tel); }
    return "+225 " + m[1].replace(/(\d{2})(?=\d)/g, "$1 ");
  }

  function lieu(membre) {
    return [membre.quartier, membre.commune].filter(Boolean).join(", ");
  }

  function nomDepartementPrincipal(departements) {
    var p = departements.filter(function (d) { return d.principal; })[0];
    return p ? p.nom : "";
  }

  function lignesDepartements(departements) {
    var principal = nomDepartementPrincipal(departements);
    var secondaires = departements
      .filter(function (d) { return !d.principal; })
      .map(function (d) { return d.nom; });
    return [
      ["Département principal", principal || "Aucun"],
      ["Départements secondaires", secondaires.length ? secondaires.join(", ") : "Aucun"]
    ];
  }

  function remplirListe(dl, lignes) {
    dl.textContent = "";
    lignes.forEach(function (l) {
      dl.appendChild(creer("dt", null, l[0]));
      dl.appendChild(creer("dd", null, l[1]));
    });
  }

  /* options : tableau de {valeur, libelle} */
  function remplirSelect(select, options, libelleVide, valeurCourante) {
    select.textContent = "";
    var toutes = [{ valeur: "", libelle: libelleVide }].concat(options);
    if (valeurCourante && !toutes.some(function (o) { return o.valeur === valeurCourante; })) {
      toutes.push({ valeur: valeurCourante, libelle: valeurCourante });
    }
    toutes.forEach(function (o) {
      var opt = creer("option", null, o.libelle);
      opt.value = o.valeur;
      select.appendChild(opt);
    });
    select.value = valeurCourante || "";
  }

  function optionsSituations() {
    return SITUATIONS.map(function (s) { return { valeur: s, libelle: s }; });
  }

  function optionsCommunes() {
    return (reference.communes || []).slice().sort(comparer).map(function (c) {
      return { valeur: c, libelle: c };
    });
  }

  function optionsDepartements() {
    return (reference.departements || []).slice()
      .sort(function (a, b) { return comparer(a.nom, b.nom); })
      .map(function (d) { return { valeur: String(d.id), libelle: d.nom }; });
  }

  function optionsOuiNon() {
    return [{ valeur: "oui", libelle: "Oui" }, { valeur: "non", libelle: "Non" }];
  }

  function versBooleen(valeur) {
    if (valeur === "oui") { return true; }
    if (valeur === "non") { return false; }
    return null;
  }

  function depuisBooleen(valeur) {
    if (valeur === true) { return "oui"; }
    if (valeur === false) { return "non"; }
    return "";
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
      etat = vide();
      annuaire = { membres: [], charge: false };
      $("champ-mdp").value = "";
      afficherMessage($("msg-connexion"), "");
      montrer("connexion");
    });
  }

  /* ---------- Chargement initial ---------- */

  function chargerReferences() {
    if (reference.communes && reference.departements) {
      return Promise.resolve();
    }
    return Promise.all([SionApi.listerCommunes(), SionApi.listerDepartements()])
      .then(function (r) {
        reference.communes = r[0];
        reference.departements = r[1];
      });
  }

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
          return chargerReferences().then(function () {
            etat = donnees;
            afficherFiche();
            montrer("fiche");
          });
        });
      })
      .catch(function (err) {
        vueMessage("Chargement impossible", SionApi.messageErreur(err), true);
      });
  }

  /* ---------- Ma fiche ---------- */

  function afficherFiche() {
    var m = etat.membre;
    var p = etat.prive || {};

    $("avatar").textContent = initiales(m);
    $("fiche-nom").textContent = nomComplet(m);
    $("fiche-fonctions").textContent = etat.fonctions.length ? etat.fonctions.join(" · ") : "Membre";

    remplirListe($("liste-infos"), [
      ["Lieu d'habitation", texte(lieu(m))],
      ["Situation matrimoniale", texte(m.situation_matrimoniale)],
      ["Téléphone", formaterTelephone(p.telephone)],
      ["Adresse e-mail", texte(p.email)],
      ["Baptême d'eau", ouiNon(p.bapteme_eau)],
      ["Baptême du Saint-Esprit", ouiNon(p.bapteme_esprit)]
    ].concat(lignesDepartements(etat.departements)));

    $("v-telephone").checked = !!p.show_telephone;
    $("v-email").checked = !!p.show_email;
    $("v-baptemes").checked = !!p.show_baptemes;
    $("carte-visibilite").hidden = !etat.prive;
  }

  function ouvrirEdition() {
    var m = etat.membre;
    var p = etat.prive;

    $("f-prenom").value = m.prenom || "";
    $("f-nom").value = m.nom || "";
    remplirSelect($("f-situation"), optionsSituations(), "Non renseignée", m.situation_matrimoniale);
    remplirSelect($("f-commune"), optionsCommunes(), "Non renseignée", m.commune);
    $("f-quartier").value = m.quartier || "";

    remplirSelect($("f-bapteme-eau"), optionsOuiNon(), "Non renseigné", depuisBooleen(p && p.bapteme_eau));
    remplirSelect($("f-bapteme-esprit"), optionsOuiNon(), "Non renseigné", depuisBooleen(p && p.bapteme_esprit));
    $("f-baptemes").hidden = !p;

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

  function rafraichirFiche() {
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
        commune: $("f-commune").value || null,
        quartier: $("f-quartier").value.trim() || null
      };

      afficherMessage(zone, "");
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";

      SionApi.modifierMembre(etat.membre.id, champs)
        .then(function () {
          if (etat.prive) {
            return SionApi.modifierPrive(etat.membre.id, {
              bapteme_eau: versBooleen($("f-bapteme-eau").value),
              bapteme_esprit: versBooleen($("f-bapteme-esprit").value)
            });
          }
          return null;
        })
        .then(rafraichirFiche)
        .then(function () {
          annuaire.charge = false;
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

  function initVisibilite() {
    [
      ["v-telephone", "show_telephone"],
      ["v-email", "show_email"],
      ["v-baptemes", "show_baptemes"]
    ].forEach(function (couple) {
      var caseCochee = $(couple[0]);
      var colonne = couple[1];

      caseCochee.addEventListener("change", function () {
        var valeur = caseCochee.checked;
        var champs = {};
        champs[colonne] = valeur;
        caseCochee.disabled = true;

        SionApi.modifierPrive(etat.membre.id, champs)
          .then(function () {
            etat.prive[colonne] = valeur;
            afficherMessage($("msg-fiche"), "Votre choix de confidentialité est enregistré.", "ok");
          })
          .catch(function (err) {
            caseCochee.checked = !valeur;
            afficherMessage($("msg-fiche"), SionApi.messageErreur(err));
          })
          .then(function () {
            caseCochee.disabled = false;
          });
      });
    });
  }

  /* ---------- Liste des membres ---------- */

  function ouvrirMembres() {
    var gerer = peutGerer();
    $("btn-ajouter").hidden = !gerer;
    $("zone-filtre").hidden = !gerer;
    montrer("membres");
    if (!annuaire.charge) {
      return chargerAnnuaire();
    }
    return Promise.resolve();
  }

  function chargerAnnuaire() {
    afficherMessage($("msg-membres"), "");
    $("compteur").textContent = "Chargement…";
    return SionApi.listerMembres()
      .then(function (liste) {
        annuaire.membres = liste;
        annuaire.charge = true;
        dessinerListe();
      })
      .catch(function (err) {
        $("compteur").textContent = "";
        $("liste-membres").textContent = "";
        afficherMessage($("msg-membres"), SionApi.messageErreur(err));
      });
  }

  function badge(statut) {
    if (statut === "visiteur") { return "De passage"; }
    if (statut === "desactive") { return "Désactivé"; }
    return "";
  }

  function dessinerListe() {
    var requete = normaliser($("recherche").value);
    var filtre = $("filtre-statut").value;

    var resultat = annuaire.membres.filter(function (m) {
      if (filtre === "membre" && m.statut !== "membre") { return false; }
      if (filtre === "visiteur" && m.statut !== "visiteur") { return false; }
      if (!requete) { return true; }
      var contenu = normaliser([
        m.prenom, m.nom, m.commune, m.quartier, nomDepartementPrincipal(m.departements)
      ].join(" "));
      return requete.split(/\s+/).every(function (mot) {
        return contenu.indexOf(mot) !== -1;
      });
    });

    resultat.sort(function (a, b) {
      return comparer(a.nom || "", b.nom || "") || comparer(a.prenom || "", b.prenom || "");
    });

    $("compteur").textContent = resultat.length + (resultat.length > 1 ? " personnes" : " personne");

    var liste = $("liste-membres");
    liste.textContent = "";
    resultat.forEach(function (m) {
      var li = creer("li");
      var bouton = creer("button", "item-membre");
      bouton.type = "button";

      bouton.appendChild(creer("span", "avatar avatar-petit", initiales(m)));

      var texteBloc = creer("span", "item-texte");
      var titre = creer("strong", null, nomComplet(m));
      var b = badge(m.statut);
      if (b) { titre.appendChild(creer("span", "badge", b)); }
      texteBloc.appendChild(titre);

      var sous = [nomDepartementPrincipal(m.departements), m.commune].filter(Boolean).join(" · ");
      texteBloc.appendChild(creer("span", "item-sous", sous || "—"));
      bouton.appendChild(texteBloc);

      bouton.addEventListener("click", function () { ouvrirDetail(m.id); });
      li.appendChild(bouton);
      liste.appendChild(li);
    });
  }

  function initMembres() {
    $("recherche").addEventListener("input", dessinerListe);
    $("filtre-statut").addEventListener("change", dessinerListe);
    $("btn-ajouter").addEventListener("click", ouvrirAjout);
  }

  /* ---------- Détail d'un membre ---------- */

  function ouvrirDetail(id) {
    var m = annuaire.membres.filter(function (x) { return x.id === id; })[0];
    if (!m) { return; }

    $("d-avatar").textContent = initiales(m);
    $("d-nom").textContent = nomComplet(m);
    $("d-sous").textContent = badge(m.statut) || "Membre";

    var base = [
      ["Lieu d'habitation", texte(lieu(m))],
      ["Situation matrimoniale", texte(m.situation_matrimoniale)]
    ].concat(m.statut === "visiteur" ? [] : lignesDepartements(m.departements));
    remplirListe($("d-infos"), base);
    montrer("detail");

    var gerer = peutGerer();
    var requete = gerer ? SionApi.detailPrive(id) : SionApi.contactVisible(id);

    requete.then(function (c) {
      if (!c) { return; }
      var lignes = base.slice();
      if (gerer) {
        lignes.push(["Téléphone", formaterTelephone(c.telephone)]);
        lignes.push(["Adresse e-mail", texte(c.email)]);
        lignes.push(["Baptême d'eau", ouiNon(c.bapteme_eau)]);
        lignes.push(["Baptême du Saint-Esprit", ouiNon(c.bapteme_esprit)]);
      } else {
        if (c.telephone) { lignes.push(["Téléphone", formaterTelephone(c.telephone)]); }
        if (c.email) { lignes.push(["Adresse e-mail", c.email]); }
        if (c.bapteme_eau !== null && c.bapteme_eau !== undefined) {
          lignes.push(["Baptême d'eau", ouiNon(c.bapteme_eau)]);
        }
        if (c.bapteme_esprit !== null && c.bapteme_esprit !== undefined) {
          lignes.push(["Baptême du Saint-Esprit", ouiNon(c.bapteme_esprit)]);
        }
      }
      remplirListe($("d-infos"), lignes);
    }).catch(function () {
      /* les informations de base restent affichées */
    });
  }

  /* ---------- Ajout d'une personne ---------- */

  function formaterSaisieTelephone(valeur) {
    var chiffres = valeur.replace(/\D/g, "");
    if (chiffres.length > 10 && chiffres.indexOf("225") === 0) {
      chiffres = chiffres.slice(3);
    }
    chiffres = chiffres.slice(0, 10);
    return chiffres.replace(/(\d{2})(?=\d)/g, "$1 ");
  }

  function basculerPassage() {
    var passage = $("a-passage").checked;
    $("a-membre-seulement").hidden = passage;
    $("a-aide-passage").hidden = !passage;
  }

  function mettreAJourSecondaires() {
    var principal = $("a-dept").value;
    var cases = $("a-secondaires").querySelectorAll("input[type=checkbox]");
    for (var i = 0; i < cases.length; i++) {
      var identique = principal !== "" && cases[i].value === principal;
      if (identique) { cases[i].checked = false; }
      cases[i].disabled = identique;
    }
  }

  function ouvrirAjout() {
    $("form-ajout").reset();
    remplirSelect($("a-situation"), optionsSituations(), "Choisir…", "");
    remplirSelect($("a-bapteme-eau"), optionsOuiNon(), "Choisir…", "");
    remplirSelect($("a-bapteme-esprit"), optionsOuiNon(), "Choisir…", "");
    remplirSelect($("a-commune"), optionsCommunes(), "Choisir…", "");
    remplirSelect($("a-dept"), optionsDepartements(), "Aucun", "");

    var zone = $("a-secondaires");
    zone.textContent = "";
    optionsDepartements().forEach(function (d) {
      var etiquette = creer("label", "ligne-case");
      var caseCochee = creer("input");
      caseCochee.type = "checkbox";
      caseCochee.value = d.valeur;
      etiquette.appendChild(caseCochee);
      etiquette.appendChild(document.createTextNode(" " + d.libelle));
      zone.appendChild(etiquette);
    });

    afficherMessage($("msg-ajout"), "");
    basculerPassage();
    montrer("ajout");
  }

  function initAjout() {
    $("a-passage").addEventListener("change", basculerPassage);
    $("a-dept").addEventListener("change", mettreAJourSecondaires);
    $("a-tel").addEventListener("input", function () {
      this.value = formaterSaisieTelephone(this.value);
    });
    $("btn-annuler-ajout").addEventListener("click", function () { ouvrirMembres(); });

    $("form-ajout").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("msg-ajout");
      var bouton = $("btn-creer");

      var prenom = $("a-prenom").value.trim();
      var nom = $("a-nom").value.trim();
      var chiffres = $("a-tel").value.replace(/\D/g, "");
      var passage = $("a-passage").checked;

      if (!prenom || !nom) {
        afficherMessage(zone, "Le prénom et le nom sont obligatoires.");
        return;
      }
      if (chiffres.length !== 10) {
        afficherMessage(zone, "Le numéro doit comporter 10 chiffres après +225.");
        return;
      }

      var doublon = annuaire.membres.some(function (m) {
        return normaliser(nomComplet(m)) === normaliser(prenom + " " + nom);
      });
      if (doublon && !window.confirm("Une fiche « " + prenom + " " + nom + " » existe déjà. Créer quand même cette nouvelle fiche ?")) {
        return;
      }

      var secondaires = [];
      if (!passage) {
        var cases = $("a-secondaires").querySelectorAll("input[type=checkbox]");
        for (var i = 0; i < cases.length; i++) {
          if (cases[i].checked) { secondaires.push(Number(cases[i].value)); }
        }
      }

      afficherMessage(zone, "");
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";

      SionApi.creerFiche({
        nom: nom,
        prenom: prenom,
        telephone: "+225" + chiffres,
        situation: $("a-situation").value || null,
        baptemeEau: versBooleen($("a-bapteme-eau").value),
        baptemeEsprit: versBooleen($("a-bapteme-esprit").value),
        commune: $("a-commune").value || null,
        quartier: $("a-quartier").value.trim() || null,
        dePassage: passage,
        email: passage ? null : ($("a-email").value.trim() || null),
        deptPrincipal: (!passage && $("a-dept").value) ? Number($("a-dept").value) : null,
        deptSecondaires: secondaires
      })
        .then(function () {
          annuaire.charge = false;
          return ouvrirMembres();
        })
        .then(function () {
          afficherMessage($("msg-membres"), "La fiche de " + prenom + " " + nom + " a été créée.", "ok");
        })
        .catch(function (err) {
          afficherMessage(zone, SionApi.messageErreur(err));
        })
        .then(function () {
          bouton.disabled = false;
          bouton.textContent = "Enregistrer la fiche";
        });
    });
  }

  /* ---------- Démarrage ---------- */

  function demarrer() {
    initConnexion();
    initEdition();
    initVisibilite();
    initMembres();
    initAjout();

    $("btn-deconnexion").addEventListener("click", deconnexion);
    $("btn-quitter").addEventListener("click", deconnexion);
    $("btn-reessayer").addEventListener("click", chargerFiche);
    $("btn-retour-liste").addEventListener("click", function () { montrer("membres"); });
    $("onglet-fiche").addEventListener("click", function () {
      afficherMessage($("msg-fiche"), "");
      montrer("fiche");
    });
    $("onglet-membres").addEventListener("click", function () {
      afficherMessage($("msg-membres"), "");
      ouvrirMembres();
    });

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
