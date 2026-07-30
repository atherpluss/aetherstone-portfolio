/* Site-wide FR/EN toggle for the "Site en français" / "Switch to english" links.
   Works by walking text nodes and swapping in a French translation from DICT
   when found (matched on the trimmed text), while caching the original English
   text on the node so switching back to English is lossless. Persists the
   choice in localStorage (same pattern as the dark-mode toggle). */
(function(){
  var DICT = {
    // Nav / menu / footer chrome
    "Home": "Accueil",
    "Shop": "Boutique",
    "Open": "Ouvrir",
    "Close": "Fermer",
    "Dark mode": "Mode sombre",
    "Light mode": "Mode clair",
    "Let's talk!": "Discutons !",
    "Contact us": "Nous contacter",
    "Legal": "Mentions légales",
    "Aetherstone — Nadhem Hsini, independent creative.": "Aetherstone — Nadhem Hsini, créatif indépendant.",
    "I am an independent brand designer based between Tunis & Paris.": "Je suis designer de marque indépendant, basé entre Tunis et Paris.",
    "Big project? Crazy thought? Or just feel like chatting?": "Un grand projet ? Une idée folle ? Ou juste envie de discuter ?",

    // Contact form
    "Let's work": "Travaillons",
    "together": "ensemble",
    "Name": "Nom",
    "Email": "E-mail",
    "Phone": "Téléphone",
    "Interest": "Intérêt",
    "Full package": "Offre complète",
    "By clicking on “Send”, you accept": "En cliquant sur « Envoyer », vous acceptez",
    "our policy": "notre politique",
    "Thank you! Your submission has been received!": "Merci ! Votre message a bien été reçu !",
    "Oops! Something went wrong while submitting the form.": "Oups, une erreur est survenue lors de l'envoi du formulaire.",
    "Continue browsing": "Continuer la navigation",
    "Thank": "Merci",
    "you!": " !",

    // Cookie banner
    "We care about your data, and we'd use cookies only to improve your experience. By using this website, you accept our": "Nous accordons de l'importance à vos données, et n'utilisons les cookies que pour améliorer votre expérience. En utilisant ce site, vous acceptez notre",
    "Cookies Policy": "Politique de cookies",
    "Accept cookies": "Accepter les cookies",
    "Learn more": "En savoir plus",

    // Homepage hero heading
    "Independent creative crafting premium Brands": "Créatif indépendant, artisan de marques d'exception",

    // Homepage intro paragraph (desktop, split by <br> + hover spans)
    "It’s never “just a logo.”": "Ce n'est jamais « juste un logo ».",
    "Every": "Chaque",
    "detail": "détail",
    "matters.": "compte.",
    "I craft visual identities.": "Je façonne des identités visuelles.",
    "Your vision. My obsession.": "Votre vision. Mon obsession.",
    "Your brand. My": "Votre marque. Mon",
    "playground": "terrain de jeu",

    // Homepage intro paragraph (mobile variant, split differently)
    "It’s never": "Ce n'est jamais",
    "“just a logo”": "« juste un logo »",
    "Every detail": "Chaque détail",
    "matters. I craft": "compte. Je façonne",
    "visual identities.": "des identités visuelles.",
    "Your vision.": "Votre vision.",
    "My obsession.": "Mon obsession.",
    "Your brand.": "Votre marque.",
    "My playground.": "Mon terrain de jeu.",

    // Services list
    "Identity": "Identité",
    "Artwork": "Illustrations",
    "Advertising": "Publicité",
    "Creative Ads": "Publicités créatives",

    // Selected works / playground
    "Selected works": "Projets sélectionnés",
    "Playground": "Terrain de jeu",
    "See more →": "Voir plus →",

    // CTA section
    "Work with us if average isn’t your thing.": "Travaillez avec nous si l'ordinaire n'est pas votre truc.",
    "Drop it, we'll build it!": "Dites-le, on s'occupe de tout !",
    "say hello": "dites bonjour",

    // Work project pages (shared labels; role/name credits are already in French)
    "Credits": "Crédits",
    "Scope": "Périmètre",
    "Next project": "Projet suivant"
  };

  function getLang(){
    try { return localStorage.getItem('lang') || 'en'; } catch(e){ return 'en'; }
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1 };
  var SKIP_CLOSEST = '#citySwitchSingle, #timeSwitchSingle, .cities_list, .locales-list, .w-locales-list';

  function walkableNodes(root){
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while((n = walker.nextNode())){ nodes.push(n); }
    return nodes;
  }

  function applyLang(lang){
    walkableNodes(document.body).forEach(function(node){
      var parent = node.parentElement;
      if(!parent || SKIP_TAGS[parent.tagName]) return;
      if(parent.closest && parent.closest(SKIP_CLOSEST)) return;
      if(node.__i18nOriginal === undefined){ node.__i18nOriginal = node.textContent; }
      var original = node.__i18nOriginal;
      var trimmed = original.trim();
      if(!trimmed){ return; }
      if(lang === 'fr' && Object.prototype.hasOwnProperty.call(DICT, trimmed)){
        node.textContent = original.replace(trimmed, DICT[trimmed]);
      } else {
        node.textContent = original;
      }
    });
    document.documentElement.setAttribute('lang', lang === 'fr' ? 'fr-FR' : 'en-US');
  }

  function setLang(lang){
    try { localStorage.setItem('lang', lang); } catch(e){}
    applyLang(lang);
  }

  function wireSwitchers(){
    document.querySelectorAll('.w-locales-list a, .locales-list a').forEach(function(a){
      var label = a.textContent.trim();
      a.addEventListener('click', function(e){
        e.preventDefault();
        if(label === 'Site en français'){ setLang('fr'); }
        else if(label === 'Switch to english'){ setLang('en'); }
      });
    });
  }

  function init(){
    applyLang(getLang());
    wireSwitchers();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__aetherI18n = { setLang: setLang, getLang: getLang, applyLang: applyLang };
})();
