(function () {
  "use strict";

  var cfg = window.SION_CONFIG;

  var client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  function verifier(reponse) {
    if (reponse.error) {
      throw reponse.error;
    }
    return reponse.data;
  }

  function depNom(lien) {
    var dep = Array.isArray(lien.departments) ? lien.departments[0] : lien.departments;
    return dep ? dep.nom : "";
  }

  function messageErreur(err) {
    var texte = ((err && err.message) || "").toLowerCase();
    var code = err && err.code;

    if (!navigator.onLine || texte.indexOf("failed to fetch") !== -1 ||
        texte.indexOf("networkerror") !== -1 || texte.indexOf("load failed") !== -1) {
      return "Pas de connexion Internet. Vérifiez votre réseau puis réessayez.";
    }
    if (texte.indexOf("invalid login credentials") !== -1) {
      return "Adresse e-mail ou mot de passe incorrect.";
    }
    if (texte.indexOf("email not confirmed") !== -1) {
      return "Cette adresse e-mail n'est pas encore confirmée.";
    }
    if (texte.indexOf("rate limit") !== -1 || texte.indexOf("too many") !== -1) {
      return "Trop de tentatives. Patientez quelques minutes puis réessayez.";
    }
    // Messages écrits en français par les règles du serveur
    if (code === "P0001" || code === "42501") {
      return err.message;
    }
    if (code === "23505") {
      return "Ce numéro de téléphone est déjà enregistré.";
    }
    if (texte.indexOf("exceeded the maximum") !== -1 || texte.indexOf("too large") !== -1) {
      return "La photo est trop volumineuse.";
    }
    if (texte.indexOf("mime type") !== -1) {
      return "Format de photo non pris en charge.";
    }
    if (code === "23514") {
      return "Le numéro doit être au format +225 suivi de 10 chiffres.";
    }
    if (texte.indexOf("permission denied") !== -1 || texte.indexOf("row-level security") !== -1) {
      return "Vous n'avez pas l'autorisation d'effectuer cette action.";
    }
    return "Une erreur est survenue. Veuillez réessayer.";
  }

  /* ---------- Session ---------- */

  function connecter(email, motDePasse) {
    return client.auth
      .signInWithPassword({ email: email, password: motDePasse })
      .then(verifier);
  }

  function deconnecter() {
    return client.auth.signOut();
  }

  function utilisateur() {
    return client.auth.getSession().then(function (reponse) {
      var session = verifier(reponse).session;
      return session ? session.user : null;
    });
  }

  function surChangementSession(rappel) {
    client.auth.onAuthStateChange(function (evenement) {
      rappel(evenement);
    });
  }

  /* ---------- Ma fiche ---------- */

  function chargerMaFiche(userId) {
    return client
      .from("members")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(verifier)
      .then(function (membre) {
        if (!membre || !membre.compte_actif || membre.statut !== "membre") {
          return { membre: membre, prive: null, fonctions: [], departements: [], permissions: [] };
        }
        return Promise.all([
          client.from("member_private").select("*").eq("member_id", membre.id).maybeSingle(),
          client.from("member_functions").select("fonction").eq("member_id", membre.id),
          client.from("member_departments").select("principal, departments(nom)").eq("member_id", membre.id),
          client.from("member_permissions").select("permission").eq("member_id", membre.id)
        ]).then(function (r) {
          return {
            membre: membre,
            prive: verifier(r[0]),
            fonctions: verifier(r[1]).map(function (l) { return l.fonction; }),
            departements: verifier(r[2]).map(function (l) {
              return { nom: depNom(l), principal: !!l.principal };
            }),
            permissions: verifier(r[3]).map(function (l) { return l.permission; })
          };
        });
      });
  }

  function modifierMembre(membreId, champs) {
    return client
      .from("members")
      .update(champs)
      .eq("id", membreId)
      .select("id")
      .then(verifier)
      .then(function (lignes) {
        if (!lignes || lignes.length === 0) {
          throw new Error("permission denied");
        }
      });
  }

  function modifierPrive(membreId, champs) {
    return client
      .from("member_private")
      .update(champs)
      .eq("member_id", membreId)
      .select("member_id")
      .then(verifier)
      .then(function (lignes) {
        if (!lignes || lignes.length === 0) {
          throw new Error("permission denied");
        }
      });
  }

  /* ---------- Listes de référence ---------- */

  function listerCommunes() {
    return client
      .from("communes")
      .select("nom")
      .eq("actif", true)
      .then(verifier)
      .then(function (lignes) {
        return lignes.map(function (l) { return l.nom; });
      });
  }

  function listerDepartements() {
    return client
      .from("departments")
      .select("id, nom")
      .then(verifier);
  }

  /* ---------- Annuaire ---------- */

  function listerMembres() {
    return Promise.all([
      client.from("members").select("id, nom, prenom, situation_matrimoniale, commune, quartier, photo_path, statut, compte_actif"),
      client.from("member_departments").select("member_id, principal, departments(nom)")
    ]).then(function (r) {
      var membres = verifier(r[0]);
      var liens = verifier(r[1]);
      var parMembre = {};

      liens.forEach(function (l) {
        if (!parMembre[l.member_id]) { parMembre[l.member_id] = []; }
        parMembre[l.member_id].push({ nom: depNom(l), principal: !!l.principal });
      });

      return membres.map(function (m) {
        m.departements = parMembre[m.id] || [];
        return m;
      });
    });
  }

  function contactVisible(membreId) {
    return client
      .rpc("contact_visible", { p_member: membreId })
      .then(verifier)
      .then(function (lignes) {
        return lignes && lignes.length ? lignes[0] : null;
      });
  }

  function detailPrive(membreId) {
    return client
      .from("member_private")
      .select("*")
      .eq("member_id", membreId)
      .maybeSingle()
      .then(verifier);
  }

  function creerFiche(p) {
    return client
      .rpc("creer_fiche", {
        p_nom: p.nom,
        p_prenom: p.prenom,
        p_telephone: p.telephone,
        p_situation: p.situation,
        p_bapteme_eau: p.baptemeEau,
        p_bapteme_esprit: p.baptemeEsprit,
        p_commune: p.commune,
        p_quartier: p.quartier,
        p_de_passage: p.dePassage,
        p_email: p.email,
        p_dept_principal: p.deptPrincipal,
        p_dept_secondaires: p.deptSecondaires
      })
      .then(verifier);
  }

  /* ---------- Photos de profil ---------- */

  function envoyerPhoto(membreId, blob, ancienChemin) {
    var chemin = membreId + "/" + Date.now() + ".jpg";
    var depot = client.storage.from("avatars");

    return depot
      .upload(chemin, blob, { contentType: "image/jpeg", upsert: false })
      .then(function (r) {
        if (r.error) { throw r.error; }
        return modifierMembre(membreId, { photo_path: chemin }).catch(function (err) {
          depot.remove([chemin]);
          throw err;
        });
      })
      .then(function () {
        if (ancienChemin) {
          depot.remove([ancienChemin]);
        }
        return chemin;
      });
  }

  function urlsPhotos(chemins) {
    if (!chemins.length) {
      return Promise.resolve({});
    }
    return client.storage
      .from("avatars")
      .createSignedUrls(chemins, 3600)
      .then(verifier)
      .then(function (lignes) {
        var carte = {};
        lignes.forEach(function (l) {
          if (l.signedUrl && !l.error) { carte[l.path] = l.signedUrl; }
        });
        return carte;
      });
  }

  function definirDepartements(membreId, principal, secondaires) {
    return client
      .rpc("definir_departements", {
        p_member: membreId,
        p_principal: principal,
        p_secondaires: secondaires
      })
      .then(verifier);
  }

  window.SionApi = {
    connecter: connecter,
    deconnecter: deconnecter,
    utilisateur: utilisateur,
    surChangementSession: surChangementSession,
    chargerMaFiche: chargerMaFiche,
    modifierMembre: modifierMembre,
    modifierPrive: modifierPrive,
    listerCommunes: listerCommunes,
    listerDepartements: listerDepartements,
    listerMembres: listerMembres,
    contactVisible: contactVisible,
    detailPrive: detailPrive,
    creerFiche: creerFiche,
    envoyerPhoto: envoyerPhoto,
    urlsPhotos: urlsPhotos,
    definirDepartements: definirDepartements,
    messageErreur: messageErreur
  };
})();
