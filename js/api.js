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

  function messageErreur(err) {
    var texte = ((err && err.message) || "").toLowerCase();

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
    if (texte.indexOf("permission denied") !== -1 || texte.indexOf("row-level security") !== -1) {
      return "Vous n'avez pas l'autorisation d'effectuer cette action.";
    }
    return "Une erreur est survenue. Veuillez réessayer.";
  }

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

  function chargerMaFiche(userId) {
    return client
      .from("members")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(verifier)
      .then(function (membre) {
        if (!membre || !membre.compte_actif || membre.statut !== "membre") {
          return { membre: membre, prive: null, fonctions: [], departements: [] };
        }
        return Promise.all([
          client.from("member_private").select("*").eq("member_id", membre.id).maybeSingle(),
          client.from("member_functions").select("fonction").eq("member_id", membre.id),
          client.from("member_departments").select("principal, departments(nom)").eq("member_id", membre.id)
        ]).then(function (r) {
          var fonctions = verifier(r[1]).map(function (l) { return l.fonction; });
          var departements = verifier(r[2]).map(function (l) {
            var dep = Array.isArray(l.departments) ? l.departments[0] : l.departments;
            return { nom: dep ? dep.nom : "", principal: !!l.principal };
          });
          return {
            membre: membre,
            prive: verifier(r[0]),
            fonctions: fonctions,
            departements: departements
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

  window.SionApi = {
    connecter: connecter,
    deconnecter: deconnecter,
    utilisateur: utilisateur,
    surChangementSession: surChangementSession,
    chargerMaFiche: chargerMaFiche,
    modifierMembre: modifierMembre,
    modifierPrive: modifierPrive,
    messageErreur: messageErreur
  };
})();
