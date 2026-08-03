/* Analytics — Google Analytics 4 avec Consent Mode v2.
 *
 * Le studio est à Montréal et adresse la France : la Loi 25 (Québec) et le
 * RGPD imposent un consentement PRÉALABLE au dépôt de cookies de mesure.
 * D'où le fonctionnement ici : les signaux de consentement sont initialisés
 * à "denied", GA4 ne dépose rien tant que le visiteur n'a pas accepté, et
 * l'acceptation est mémorisée dans le cookie `cookieConsent` (même clé que
 * le code de bandeau déjà présent dans pages/approach.html).
 *
 * POUR ACTIVER : renseigner GA4_ID ci-dessous avec l'identifiant de mesure
 * de la propriété (format G-XXXXXXXXXX). Tant qu'il est vide, aucun script
 * Google n'est chargé et aucune requête ne part — le site reste propre.
 */
(function () {
  var GA4_ID = 'G-Y8MQ2P4Q93'; // propriete "Atherstone", flux nadhemhsini.online

  var CONSENT_COOKIE = 'cookieConsent';
  var CONSENT_DAYS = 180;

  function readConsent() {
    var m = document.cookie.match(/(?:^|;\s*)cookieConsent=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeConsent(value) {
    var d = new Date();
    d.setTime(d.getTime() + CONSENT_DAYS * 864e5);
    document.cookie = CONSENT_COOKIE + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax' +
      (location.protocol === 'https:' ? ';Secure' : '');
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // Consent Mode v2 : tout refusé par défaut, y compris avant chargement de GA4.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });

  var loaded = false;
  function loadGA4() {
    if (loaded || !GA4_ID) return;
    loaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
    document.head.appendChild(s);
    gtag('js', new Date());
    // anonymize_ip reste explicite : GA4 le fait par défaut, l'écrire le rend auditable.
    gtag('config', GA4_ID, { anonymize_ip: true });
  }

  function grant() {
    gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',        // aucune publicité sur ce site : on ne l'ouvre pas.
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    loadGA4();
  }

  var existing = readConsent();
  if (existing === 'accepted') { grant(); return; }
  if (existing === 'refused') { return; }
  if (!GA4_ID) return; // pas d'ID : inutile d'ennuyer le visiteur avec un bandeau.

  /* ---- Bandeau de consentement ---------------------------------------
     Le site n'en avait aucun de fonctionnel : le code vivait dans
     pages/approach.html mais l'élément #cookie n'existait sur aucune page.
     Celui-ci est volontairement sobre et reprend les variables de thème. */
  function banner() {
    var wrap = document.createElement('div');
    wrap.id = 'consentBar';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Consentement aux cookies de mesure');
    // Sur mobile, le texte long faisait grimper le bandeau a un quart de
    // l'ecran. Message court la ou la place manque, message complet ailleurs.
    var court = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    wrap.innerHTML =
      (court
        ? '<p>Cookies de mesure d\'audience, rien sans votre accord. ' +
          '<a href="/pages/legal.html">En savoir plus</a></p>'
        : '<p>Ce site utilise des cookies de mesure d\'audience pour comprendre ce qui est consulté. ' +
          'Rien n\'est déposé sans votre accord. <a href="/pages/legal.html">En savoir plus</a></p>') +
      '<div class="consent-actions">' +
      '<button type="button" data-consent="refused">Refuser</button>' +
      '<button type="button" data-consent="accepted" class="is-primary">Accepter</button>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-consent]');
      if (!b) return;
      var v = b.getAttribute('data-consent');
      writeConsent(v);
      if (v === 'accepted') grant();
      wrap.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', banner);
  } else {
    banner();
  }
})();
