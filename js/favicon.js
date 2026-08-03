// Favicon adaptatif — deux jeux d'icônes.
//
//   favicon-dark-*   : logo clair sur fond noir  → contexte sombre
//   favicon-light-*  : logo noir sur fond clair  → contexte clair
//
// Deux sources décident, dans cet ordre :
//   1. le choix explicite du visiteur sur le site (bouton Mode sombre, mémorisé
//      dans localStorage sous `darkMode`) ;
//   2. à défaut, le thème du navigateur (`prefers-color-scheme`).
//
// Les balises `<link rel="icon" media="...">` posées dans le HTML suffisent aux
// navigateurs qui les respectent, mais leur prise en charge reste inégale et
// elles ignorent le bouton du site. Ce script tranche donc lui-même et réécrit
// le `href`, ce qui fonctionne partout.

(function () {
  var SETS = {
    dark: { small: '/wf/favicon-dark-32.png' },
    light: { small: '/wf/favicon-light-32.png' }
  };

  // iOS ne rebascule jamais l'icone d'ecran d'accueil selon le theme, et il
  // aplatit la transparence sur du NOIR : un logo noir transparent donnerait
  // une icone invisible. D'ou un fichier unique, opaque, fond clair.
  var TOUCH = '/wf/webclip-180.png';

  function storedChoice() {
    try {
      var v = localStorage.getItem('darkMode');
      if (v === 'enabled') return 'dark';
      if (v === 'disabled') return 'light';
    } catch (e) {}
    return null;
  }

  function browserPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function currentTheme() {
    // La classe reflète l'état réel de la page une fois le site chargé ;
    // elle est posée par le script de thème avant le premier rendu.
    if (document.documentElement.classList.contains('is-dark')) return 'dark';
    var stored = storedChoice();
    if (stored) return stored;
    return browserPrefersDark() ? 'dark' : 'light';
  }

  // Un seul <link> par rel, réutilisé : empiler des balises laisse certains
  // navigateurs sur l'ancienne icône.
  function linkFor(rel, id) {
    var el = document.getElementById(id);
    if (el) return el;
    // On retire les déclarations existantes du même rôle pour éviter qu'une
    // icône héritée du template ne reprenne la main.
    var sel = rel === 'icon'
      ? 'link[rel~="icon"]:not([rel~="apple-touch-icon"])'
      : 'link[rel~="apple-touch-icon"]';
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (n) {
      if (n.id !== id) n.parentNode.removeChild(n);
    });
    el = document.createElement('link');
    el.id = id;
    el.rel = rel;
    el.type = 'image/png';
    document.head.appendChild(el);
    return el;
  }

  var applying = false;
  function apply() {
    if (applying) return;
    applying = true;
    var set = SETS[currentTheme()] || SETS.light;
    var icon = linkFor('icon', 'faviconIcon');
    var touch = linkFor('apple-touch-icon', 'faviconTouch');
    // Le paramètre force le navigateur à relire le fichier : sans lui,
    // Chrome et Safari gardent l'icône précédente en cache pour l'onglet.
    var bust = '?t=' + (currentTheme() === 'dark' ? 'd' : 'l');
    if (icon.getAttribute('href') !== set.small + bust) icon.setAttribute('href', set.small + bust);
    if (touch.getAttribute('href') !== TOUCH) touch.setAttribute('href', TOUCH);
    applying = false;
  }

  apply();

  // Le visiteur bascule le mode sombre du site : la classe change sur <html>.
  if (window.MutationObserver) {
    new MutationObserver(apply).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Le visiteur change le thème de son système pendant la visite.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }

  document.addEventListener('DOMContentLoaded', apply);
})();
