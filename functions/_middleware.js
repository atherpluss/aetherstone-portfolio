// Détection de langue côté serveur — Cloudflare Pages.
//
// Le studio est à Montréal et vise d'abord le public francophone : un
// visiteur au Québec, en France ou dans un autre pays francophone doit
// arriver directement sur la version française, sans cliquer. Un visiteur
// anglophone (US, UK, Australie…) sur la version anglaise.
//
// Pourquoi ici et pas dans le navigateur : Cloudflare connaît le pays réel
// (`request.cf.country`) et la décision est prise AVANT que la page parte.
// Le cookie accompagne la toute première réponse, donc `js/i18n.js` le lit
// dès le premier rendu — pas de page qui s'affiche en anglais puis bascule
// en français sous les yeux du visiteur.
//
// Le choix explicite du visiteur (localStorage, via le lien « Site en
// français » / « Switch to english ») reste prioritaire sur tout ceci.

// Pays où le français est langue officielle ou d'usage courant.
const FRANCOPHONE = new Set([
  'FR', 'BE', 'CH', 'LU', 'MC', // Europe
  'SN', 'CI', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GA', 'CG', 'CD', 'CM', 'TD',
  'CF', 'DJ', 'GN', 'MG', 'RW', 'BI', 'KM', 'SC', 'MU', // Afrique / océan Indien
  'DZ', 'MA', 'TN', // Maghreb
  'HT', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PF', 'NC', 'WF', 'PM', 'BL', 'MF', 'VU'
]);

// Le Canada est bilingue : le pays seul ne tranche pas. Ces provinces et
// territoires sont francophones ou officiellement bilingues.
const FR_CA_REGIONS = new Set(['QC', 'NB']);

function fromAcceptLanguage(header) {
  if (!header) return null;
  // "fr-CA,fr;q=0.9,en;q=0.8" → on retient la première des deux langues connues.
  const parts = header
    .split(',')
    .map((p) => {
      const [tag, ...params] = p.trim().split(';');
      const q = params.find((x) => x.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q.split('=')[1]) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return null;
}

function decide(request) {
  const cf = request.cf || {};
  const country = cf.country || '';
  const region = cf.regionCode || '';
  const accept = fromAcceptLanguage(request.headers.get('Accept-Language'));

  // Québec et Nouveau-Brunswick : français par défaut, sauf si le navigateur
  // demande explicitement l'anglais — un anglophone de Montréal reste servi
  // en anglais.
  if (country === 'CA') {
    if (accept) return accept;
    return FR_CA_REGIONS.has(region) ? 'fr' : 'en';
  }

  if (FRANCOPHONE.has(country)) return 'fr';
  if (country) return accept || 'en';

  // Pas d'information de pays (dev local, requête interne) : on s'en remet
  // aux préférences du navigateur.
  return accept || 'en';
}

export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();

  // On ne touche qu'aux pages HTML : ni les images, ni le CSS, ni /api/*.
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('text/html')) return response;

  // Cookie déjà présent : le visiteur a déjà été classé (ou a choisi
  // lui-même). On ne le réécrit pas à chaque navigation.
  const cookies = request.headers.get('Cookie') || '';
  if (/(?:^|;\s*)siteLang=(fr|en)/.test(cookies)) return response;

  const lang = decide(request);
  const out = new Response(response.body, response);
  out.headers.append(
    'Set-Cookie',
    `siteLang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
  );
  // La réponse dépend du pays et de la langue demandée : sans ça, le cache
  // pourrait servir la version d'un visiteur à un autre.
  out.headers.append('Vary', 'Accept-Language');
  return out;
}
