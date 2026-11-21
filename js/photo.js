(function () {
  "use strict";

  var TAILLE_VUE = 320;     // taille du carré affiché à l'écran
  var TAILLE_FINALE = 512;  // taille de la photo enregistrée
  var FOND = "#FCF4E9";

  var courant = { img: null, url: null, zoom: 1, dx: 0, dy: 0 };
  var glisse = null;

  function $(id) {
    return document.getElementById(id);
  }

  /* Calcule où dessiner l'image pour qu'elle remplisse toujours le carré */
  function calculerPlacement(largeur, hauteur, vue, zoom, dx, dy) {
    var base = Math.max(vue / largeur, vue / hauteur);
    var echelle = base * zoom;
    var w = largeur * echelle;
    var h = hauteur * echelle;
    var x = (vue - w) / 2 + dx;
    var y = (vue - h) / 2 + dy;
    x = Math.min(0, Math.max(vue - w, x));
    y = Math.min(0, Math.max(vue - h, y));
    return {
      x: x,
      y: y,
      w: w,
      h: h,
      dx: x - (vue - w) / 2,
      dy: y - (vue - h) / 2
    };
  }

  function dessiner() {
    if (!courant.img) { return; }
    var canevas = $("photo-canvas");
    var ctx = canevas.getContext("2d");
    var p = calculerPlacement(
      courant.img.naturalWidth, courant.img.naturalHeight,
      TAILLE_VUE, courant.zoom, courant.dx, courant.dy
    );
    courant.dx = p.dx;
    courant.dy = p.dy;
    ctx.fillStyle = FOND;
    ctx.fillRect(0, 0, TAILLE_VUE, TAILLE_VUE);
    ctx.drawImage(courant.img, p.x, p.y, p.w, p.h);
  }

  function reinitialiser() {
    if (courant.url) {
      URL.revokeObjectURL(courant.url);
    }
    courant = { img: null, url: null, zoom: 1, dx: 0, dy: 0 };
    glisse = null;
    $("photo-zoom").value = "1";
  }

  function charger(fichier) {
    reinitialiser();
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(fichier);
      var img = new Image();
      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) {
          URL.revokeObjectURL(url);
          reject(new Error("image illisible"));
          return;
        }
        courant = { img: img, url: url, zoom: 1, dx: 0, dy: 0 };
        $("photo-zoom").value = "1";
        dessiner();
        resolve();
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image illisible"));
      };
      img.src = url;
    });
  }

  function exporter() {
    return new Promise(function (resolve, reject) {
      if (!courant.img) {
        reject(new Error("aucune photo"));
        return;
      }
      var c = document.createElement("canvas");
      c.width = TAILLE_FINALE;
      c.height = TAILLE_FINALE;
      var ctx = c.getContext("2d");
      var k = TAILLE_FINALE / TAILLE_VUE;
      var p = calculerPlacement(
        courant.img.naturalWidth, courant.img.naturalHeight,
        TAILLE_VUE, courant.zoom, courant.dx, courant.dy
      );
      ctx.fillStyle = FOND;
      ctx.fillRect(0, 0, TAILLE_FINALE, TAILLE_FINALE);
      ctx.drawImage(courant.img, p.x * k, p.y * k, p.w * k, p.h * k);
      c.toBlob(function (blob) {
        if (blob) { resolve(blob); } else { reject(new Error("export impossible")); }
      }, "image/jpeg", 0.85);
    });
  }

  function initialiser() {
    var canevas = $("photo-canvas");

    $("photo-zoom").addEventListener("input", function () {
      courant.zoom = Number(this.value) || 1;
      dessiner();
    });

    canevas.addEventListener("pointerdown", function (e) {
      if (!courant.img) { return; }
      glisse = { x: e.clientX, y: e.clientY };
      try { canevas.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ }
    });

    canevas.addEventListener("pointermove", function (e) {
      if (!glisse || !courant.img) { return; }
      var rect = canevas.getBoundingClientRect();
      var ratio = rect.width ? TAILLE_VUE / rect.width : 1;
      courant.dx += (e.clientX - glisse.x) * ratio;
      courant.dy += (e.clientY - glisse.y) * ratio;
      glisse = { x: e.clientX, y: e.clientY };
      dessiner();
    });

    function fin() { glisse = null; }
    canevas.addEventListener("pointerup", fin);
    canevas.addEventListener("pointercancel", fin);
  }

  initialiser();

  window.SionPhoto = {
    charger: charger,
    exporter: exporter,
    reinitialiser: reinitialiser,
    dessiner: dessiner,
    calculerPlacement: calculerPlacement
  };
})();
