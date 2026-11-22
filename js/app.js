(function () {
  "use strict";

  var SITUATIONS = ["Marié(e)", "Célibataire", "Veuf(ve)", "Concubinage", "Fiancé(e)"];
  var VUES = ["chargement", "connexion", "message", "mdp", "fiche", "membres", "detail", "ajout", "photo"];
  var VUES_CONNECTEES = ["fiche", "membres", "detail", "ajout", "photo"];
  var VUES_AVEC_ONGLETS = ["fiche", "membres", "detail"];
  var PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var PHOTO_MAX = 10 * 1024 * 1024;

  var VERSION = "7";

  var etat = vide();
  var reference = { communes: null, departements: null };
  var annuaire = { membres: [], charge: false };
  var photos = { urls: {}, horodatage: 0, erreur: "" };
  var detailCourant = null;
  var modeFiche = { type: "creation" };
  var cible = null;
  var utilisateurCourant = null;
  var emailDetail = "";

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

  /* ---------- Photos de profil (affichage) ---------- */

  function remplirAvatar(element, membre) {
    element.textContent = "";
    var url = membre.photo_path ? photos.urls[membre.photo_path] : null;
    if (url) {
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      element.appendChild(img);
    } else {
      element.textContent = initiales(membre);
    }
  }

  /* Retourne une promesse : vrai si de nouvelles photos sont disponibles */
  function chargerPhotos(chemins) {
    if (Date.now() - photos.horodatage > 50 * 60 * 1000) {
      photos.urls = {};
      photos.horodatage = Date.now();
    }
    var manquants = chemins.filter(function (c, i) {
      return c && !photos.urls[c] && chemins.indexOf(c) === i;
    });
    if (!manquants.length) {
      return Promise.resolve(false);
    }
    return SionApi.urlsPhotos(manquants)
      .then(function (carte) {
        photos.erreur = "";
        Object.keys(carte).forEach(function (c) { photos.urls[c] = carte[c]; });
        return true;
      })
      .catch(function (err) {
        photos.erreur = (err && err.message) || "erreur inconnue";
        return false;
      });
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
      photos = { urls: {}, horodatage: 0, erreur: "" };
      detailCourant = null;
      cible = null;
      utilisateurCourant = null;
      emailDetail = "";
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
        utilisateurCourant = user;
        if (user.app_metadata && user.app_metadata.must_change_password === true) {
          $("mdp-nouveau").value = "";
          $("mdp-confirmation").value = "";
          afficherMessage($("msg-mdp"), "");
          montrer("mdp");
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

    remplirAvatar($("avatar"), m);
    chargerPhotos([m.photo_path]).then(function (nouveau) {
      if (nouveau && etat.membre && etat.membre.id === m.id) {
        remplirAvatar($("avatar"), etat.membre);
      }
    });

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
    $("f-tel-bloc").hidden = !p;
    $("f-tel").value = formaterSaisieTelephone(
      p && p.telephone ? p.telephone.replace(/^\+225/, "") : ""
    );

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
    $("f-tel").addEventListener("input", function () {
      this.value = formaterSaisieTelephone(this.value);
    });
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

      var ancienTel = etat.prive && etat.prive.telephone ? etat.prive.telephone : null;
      var chiffres = $("f-tel").value.replace(/\D/g, "");
      if (etat.prive) {
        if (chiffres === "" && ancienTel) {
          afficherMessage(zone, "Le numéro de téléphone est obligatoire : vous devez pouvoir être joint.");
          return;
        }
        if (chiffres !== "" && chiffres.length !== 10) {
          afficherMessage(zone, "Le numéro doit comporter 10 chiffres après +225.");
          return;
        }
      }
      var nouveauTel = chiffres ? "+225" + chiffres : null;

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
            var champsPrive = {
              bapteme_eau: versBooleen($("f-bapteme-eau").value),
              bapteme_esprit: versBooleen($("f-bapteme-esprit").value)
            };
            if (nouveauTel && nouveauTel !== ancienTel) {
              champsPrive.telephone = nouveauTel;
            }
            return SionApi.modifierPrive(etat.membre.id, champsPrive);
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
        return chargerPhotos(liste.map(function (m) { return m.photo_path; }));
      })
      .then(function (nouveau) {
        if (nouveau) { dessinerListe(); }
        var avecPhoto = annuaire.membres.some(function (m) { return !!m.photo_path; });
        if (avecPhoto && photos.erreur) {
          afficherMessage($("msg-membres"), "Les photos n'ont pas pu être chargées : " + photos.erreur);
        }
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

      var avatar = creer("span", "avatar avatar-petit");
      remplirAvatar(avatar, m);
      bouton.appendChild(avatar);

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
    detailCourant = m;

    remplirAvatar($("d-avatar"), m);
    chargerPhotos([m.photo_path]).then(function (nouveau) {
      if (nouveau && detailCourant === m) { remplirAvatar($("d-avatar"), m); }
    });

    $("d-nom").textContent = nomComplet(m);
    $("d-sous").textContent = badge(m.statut) || "Membre";
    afficherMessage($("msg-detail"), "");

    var gerer = peutGerer();
    $("d-actions").hidden = !gerer;
    emailDetail = "";
    afficherAcces(m);

    var base = [
      ["Lieu d'habitation", texte(lieu(m))],
      ["Situation matrimoniale", texte(m.situation_matrimoniale)]
    ].concat(m.statut === "visiteur" ? [] : lignesDepartements(m.departements));
    remplirListe($("d-infos"), base);
    montrer("detail");

    var requete = gerer ? SionApi.detailPrive(id) : SionApi.contactVisible(id);

    requete.then(function (c) {
      if (!c || detailCourant !== m) { return; }
      var lignes = base.slice();
      if (gerer) {
        emailDetail = c.email || "";
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

  /* ---------- Photo : choix, cadrage, envoi ---------- */

  function messagePhoto(texteMessage, type) {
    var zone = (cible && cible.retour === "detail") ? $("msg-detail") : $("msg-fiche");
    afficherMessage(zone, texteMessage, type);
  }

  function demarrerPhoto(membre, retour) {
    cible = { membre: membre, retour: retour };
    afficherMessage($("msg-fiche"), "");
    afficherMessage($("msg-detail"), "");
    $("champ-photo").value = "";
    $("champ-photo").click();
  }

  function fermerPhoto() {
    SionPhoto.reinitialiser();
    montrer(cible && cible.retour === "detail" ? "detail" : "fiche");
  }

  function initPhoto() {
    $("btn-photo").addEventListener("click", function () {
      demarrerPhoto(etat.membre, "fiche");
    });
    $("btn-photo-detail").addEventListener("click", function () {
      if (detailCourant) { demarrerPhoto(detailCourant, "detail"); }
    });

    $("champ-photo").addEventListener("change", function () {
      var fichier = this.files && this.files[0];
      if (!fichier || !cible) { return; }

      if (PHOTO_TYPES.indexOf(fichier.type) === -1) {
        messagePhoto("Format non pris en charge. Choisissez une photo JPG, PNG ou WebP.");
        return;
      }
      if (fichier.size > PHOTO_MAX) {
        messagePhoto("La photo ne doit pas dépasser 10 Mo.");
        return;
      }

      SionPhoto.charger(fichier)
        .then(function () {
          afficherMessage($("msg-photo"), "");
          montrer("photo");
          SionPhoto.dessiner();
        })
        .catch(function () {
          messagePhoto("Cette image ne peut pas être lue. Essayez une autre photo.");
        });
    });

    $("btn-photo-annuler").addEventListener("click", fermerPhoto);

    $("btn-photo-ok").addEventListener("click", function () {
      var bouton = this;
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";
      afficherMessage($("msg-photo"), "");

      SionPhoto.exporter()
        .then(function (blob) {
          return SionApi.envoyerPhoto(cible.membre.id, blob, cible.membre.photo_path);
        })
        .then(function (chemin) {
          cible.membre.photo_path = chemin;
          if (etat.membre && etat.membre.id === cible.membre.id) {
            etat.membre.photo_path = chemin;
          }
          annuaire.charge = false;
          return chargerPhotos([chemin]);
        })
        .then(function () {
          var retour = cible.retour;
          SionPhoto.reinitialiser();
          if (retour === "detail") {
            remplirAvatar($("d-avatar"), cible.membre);
            montrer("detail");
          } else {
            remplirAvatar($("avatar"), etat.membre);
            montrer("fiche");
          }
          messagePhoto("La photo a été enregistrée.", "ok");
        })
        .catch(function (err) {
          afficherMessage($("msg-photo"), SionApi.messageErreur(err));
        })
        .then(function () {
          bouton.disabled = false;
          bouton.textContent = "Enregistrer la photo";
        });
    });
  }

  /* ---------- Formulaire : ajout et modification d'une fiche ---------- */

  function formaterSaisieTelephone(valeur) {
    var chiffres = valeur.replace(/\D/g, "");
    if (chiffres.length > 10 && chiffres.indexOf("225") === 0) {
      chiffres = chiffres.slice(3);
    }
    chiffres = chiffres.slice(0, 10);
    return chiffres.replace(/(\d{2})(?=\d)/g, "$1 ");
  }

  function basculerPassage() {
    if (modeFiche.type !== "creation") { return; }
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

  function preparerFormulaire() {
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
      caseCochee.setAttribute("data-nom", d.libelle);
      etiquette.appendChild(caseCochee);
      etiquette.appendChild(document.createTextNode(" " + d.libelle));
      zone.appendChild(etiquette);
    });

    afficherMessage($("msg-ajout"), "");
  }

  function ouvrirAjout() {
    modeFiche = { type: "creation" };
    preparerFormulaire();
    $("titre-fiche").textContent = "Nouvelle fiche";
    $("btn-creer").textContent = "Enregistrer la fiche";
    $("a-ligne-passage").hidden = false;
    $("a-email-bloc").hidden = false;
    basculerPassage();
    montrer("ajout");
  }

  function ouvrirModification() {
    var m = detailCourant;
    if (!m) { return; }
    afficherMessage($("msg-detail"), "");

    SionApi.detailPrive(m.id)
      .then(function (c) {
        c = c || {};
        modeFiche = { type: "modification", membre: m };
        preparerFormulaire();

        $("titre-fiche").textContent = "Modifier la fiche";
        $("btn-creer").textContent = "Enregistrer les modifications";
        $("a-ligne-passage").hidden = true;
        $("a-aide-passage").hidden = true;
        $("a-email-bloc").hidden = true;
        $("a-membre-seulement").hidden = (m.statut !== "membre");

        $("a-prenom").value = m.prenom || "";
        $("a-nom").value = m.nom || "";
        $("a-tel").value = formaterSaisieTelephone((c.telephone || "").replace(/^\+225/, ""));
        remplirSelect($("a-situation"), optionsSituations(), "Choisir…", m.situation_matrimoniale || "");
        remplirSelect($("a-commune"), optionsCommunes(), "Choisir…", m.commune || "");
        $("a-quartier").value = m.quartier || "";
        $("a-bapteme-eau").value = depuisBooleen(c.bapteme_eau);
        $("a-bapteme-esprit").value = depuisBooleen(c.bapteme_esprit);

        var principal = nomDepartementPrincipal(m.departements);
        var dep = (reference.departements || []).filter(function (d) { return d.nom === principal; })[0];
        $("a-dept").value = dep ? String(dep.id) : "";

        var secondaires = m.departements
          .filter(function (d) { return !d.principal; })
          .map(function (d) { return d.nom; });
        var cases = $("a-secondaires").querySelectorAll("input[type=checkbox]");
        for (var i = 0; i < cases.length; i++) {
          cases[i].checked = secondaires.indexOf(cases[i].getAttribute("data-nom")) !== -1;
        }
        mettreAJourSecondaires();

        montrer("ajout");
      })
      .catch(function (err) {
        afficherMessage($("msg-detail"), SionApi.messageErreur(err));
      });
  }

  function departementsChoisis() {
    var secondaires = [];
    var cases = $("a-secondaires").querySelectorAll("input[type=checkbox]");
    for (var i = 0; i < cases.length; i++) {
      if (cases[i].checked) { secondaires.push(Number(cases[i].value)); }
    }
    return secondaires;
  }

  function enregistrerModification(valeurs, zone, bouton) {
    var m = modeFiche.membre;

    SionApi.modifierMembre(m.id, {
      prenom: valeurs.prenom,
      nom: valeurs.nom,
      situation_matrimoniale: $("a-situation").value || null,
      commune: $("a-commune").value || null,
      quartier: $("a-quartier").value.trim() || null
    })
      .then(function () {
        return SionApi.modifierPrive(m.id, {
          telephone: "+225" + valeurs.chiffres,
          bapteme_eau: versBooleen($("a-bapteme-eau").value),
          bapteme_esprit: versBooleen($("a-bapteme-esprit").value)
        });
      })
      .then(function () {
        if (m.statut !== "membre") { return null; }
        return SionApi.definirDepartements(
          m.id,
          $("a-dept").value ? Number($("a-dept").value) : null,
          departementsChoisis()
        );
      })
      .then(function () {
        return chargerAnnuaire();
      })
      .then(function () {
        ouvrirDetail(m.id);
        afficherMessage($("msg-detail"), "Les modifications ont été enregistrées.", "ok");
        if (etat.membre && etat.membre.id === m.id) {
          return rafraichirFiche();
        }
        return null;
      })
      .catch(function (err) {
        afficherMessage(zone, SionApi.messageErreur(err));
      })
      .then(function () {
        bouton.disabled = false;
        bouton.textContent = "Enregistrer les modifications";
      });
  }

  function initAjout() {
    $("a-passage").addEventListener("change", basculerPassage);
    $("a-dept").addEventListener("change", mettreAJourSecondaires);
    $("a-tel").addEventListener("input", function () {
      this.value = formaterSaisieTelephone(this.value);
    });
    $("btn-modifier-autre").addEventListener("click", ouvrirModification);

    $("btn-annuler-ajout").addEventListener("click", function () {
      if (modeFiche.type === "modification" && detailCourant) {
        montrer("detail");
      } else {
        ouvrirMembres();
      }
    });

    $("form-ajout").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("msg-ajout");
      var bouton = $("btn-creer");

      var prenom = $("a-prenom").value.trim();
      var nom = $("a-nom").value.trim();
      var chiffres = $("a-tel").value.replace(/\D/g, "");
      var passage = modeFiche.type === "creation" && $("a-passage").checked;

      if (!prenom || !nom) {
        afficherMessage(zone, "Le prénom et le nom sont obligatoires.");
        return;
      }
      if (chiffres.length !== 10) {
        afficherMessage(zone, "Le numéro doit comporter 10 chiffres après +225.");
        return;
      }

      if (modeFiche.type === "modification") {
        afficherMessage(zone, "");
        bouton.disabled = true;
        bouton.textContent = "Enregistrement…";
        enregistrerModification({ prenom: prenom, nom: nom, chiffres: chiffres }, zone, bouton);
        return;
      }

      var doublon = annuaire.membres.some(function (m) {
        return normaliser(nomComplet(m)) === normaliser(prenom + " " + nom);
      });
      if (doublon && !window.confirm("Une fiche « " + prenom + " " + nom + " » existe déjà. Créer quand même cette nouvelle fiche ?")) {
        return;
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
        deptSecondaires: passage ? [] : departementsChoisis()
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

  /* ---------- Premier mot de passe personnel ---------- */

  function initMdp() {
    $("btn-voir-mdp2").addEventListener("click", function () {
      var cache = $("mdp-nouveau").type === "password";
      $("mdp-nouveau").type = cache ? "text" : "password";
      $("mdp-confirmation").type = cache ? "text" : "password";
      this.textContent = cache ? "Masquer" : "Afficher";
    });

    $("btn-mdp-quitter").addEventListener("click", deconnexion);

    $("form-mdp").addEventListener("submit", function (e) {
      e.preventDefault();
      var zone = $("msg-mdp");
      var bouton = $("btn-mdp-ok");
      var mdp = $("mdp-nouveau").value;

      if (mdp.length < 10) {
        afficherMessage(zone, "Le mot de passe doit comporter au moins 10 caractères.");
        return;
      }
      if (!/[A-Za-z]/.test(mdp) || !/[0-9]/.test(mdp)) {
        afficherMessage(zone, "Le mot de passe doit contenir des lettres et au moins un chiffre.");
        return;
      }
      if (mdp !== $("mdp-confirmation").value) {
        afficherMessage(zone, "Les deux mots de passe ne sont pas identiques.");
        return;
      }

      afficherMessage(zone, "");
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";

      SionApi.changerMdpInitial(mdp)
        .then(function () {
          return SionApi.connecter(utilisateurCourant.email, mdp);
        })
        .then(function () {
          $("mdp-nouveau").value = "";
          $("mdp-confirmation").value = "";
          return chargerFiche();
        })
        .catch(function (err) {
          afficherMessage(zone, SionApi.messageErreur(err));
        })
        .then(function () {
          bouton.disabled = false;
          bouton.textContent = "Enregistrer mon mot de passe";
        });
    });
  }

  /* ---------- Accès d'un membre (responsables) ---------- */

  function dateCourte(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
  }

  function afficherAcces(m) {
    var visible = peutGerer() && m.statut === "membre";
    $("carte-acces").hidden = !visible;
    $("form-acces").hidden = true;
    if (!visible) { return; }

    var bouton = $("btn-acces");
    if (!m.compte_actif) {
      $("acces-etat").textContent = "Aucun accès n'a été créé pour ce membre.";
      bouton.textContent = "Créer l'accès";
      bouton.hidden = false;
    } else if (m.mdp_temporaire) {
      var date = m.acces_envoye_le ? " le " + dateCourte(m.acces_envoye_le) : "";
      $("acces-etat").textContent = "Accès envoyé" + date + ". Le membre ne s'est pas encore connecté avec un mot de passe personnel.";
      bouton.textContent = "Renvoyer l'accès";
      bouton.hidden = false;
    } else {
      $("acces-etat").textContent = "Compte actif.";
      bouton.hidden = true;
    }
    afficherMessage($("msg-acces"), "");
  }

  function apresAcces(m, message) {
    annuaire.charge = false;
    return chargerAnnuaire().then(function () {
      ouvrirDetail(m.id);
      afficherMessage($("msg-detail"), message, "ok");
    });
  }

  function initAcces() {
    $("btn-acces").addEventListener("click", function () {
      var m = detailCourant;
      if (!m) { return; }

      if (m.compte_actif && m.mdp_temporaire) {
        if (!window.confirm("Envoyer un nouveau mot de passe temporaire à " + nomComplet(m) + " ? L'ancien ne fonctionnera plus.")) {
          return;
        }
        var bouton = this;
        bouton.disabled = true;
        SionApi.creerCompte(m.id, null, "renvoyer")
          .then(function (r) {
            return apresAcces(m, "Un nouvel accès a été envoyé à " + r.email + ".");
          })
          .catch(function (err) {
            afficherMessage($("msg-detail"), SionApi.messageErreur(err));
          })
          .then(function () { bouton.disabled = false; });
        return;
      }

      $("acces-email").value = emailDetail || "";
      afficherMessage($("msg-acces"), "");
      $("form-acces").hidden = false;
      this.hidden = true;
    });

    $("btn-acces-annuler").addEventListener("click", function () {
      $("form-acces").hidden = true;
      $("btn-acces").hidden = false;
    });

    $("form-acces").addEventListener("submit", function (e) {
      e.preventDefault();
      var m = detailCourant;
      var zone = $("msg-acces");
      var bouton = $("btn-acces-envoyer");
      var email = $("acces-email").value.trim();

      if (!m) { return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        afficherMessage(zone, "Saisissez une adresse e-mail valide.");
        return;
      }

      afficherMessage(zone, "");
      bouton.disabled = true;
      bouton.textContent = "Envoi en cours…";

      SionApi.creerCompte(m.id, email, "creer")
        .then(function (r) {
          return apresAcces(m, "L'accès a été créé. Un e-mail a été envoyé à " + r.email + ".");
        })
        .catch(function (err) {
          afficherMessage(zone, SionApi.messageErreur(err));
        })
        .then(function () {
          bouton.disabled = false;
          bouton.textContent = "Créer le compte et envoyer l'e-mail";
        });
    });
  }

  /* ---------- Démarrage ---------- */

  function afficherVersion() {
    var libelle = "Version " + VERSION + " · api " + (SionApi.version || "ancienne");
    var zones = document.querySelectorAll(".version");
    for (var i = 0; i < zones.length; i++) { zones[i].textContent = libelle; }
  }

  function demarrer() {
    afficherVersion();
    initConnexion();
    initEdition();
    initVisibilite();
    initMembres();
    initPhoto();
    initAjout();
    initMdp();
    initAcces();

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
