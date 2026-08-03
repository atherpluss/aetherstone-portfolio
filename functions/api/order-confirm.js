// Envoi de la commande à Printful — Pages Function, sur /api/order-confirm.
//
// Appelée avec l'identifiant de session Stripe au retour du paiement. Elle
// vérifie AUPRÈS DE STRIPE que la session est réellement payée avant de créer
// quoi que ce soit : le paramètre vient du navigateur, il ne prouve rien par
// lui-même.
//
// Idempotence : la commande Printful porte `external_id` = identifiant de
// session Stripe. Si la page est rechargée ou l'appel rejoué, Printful refuse
// le doublon au lieu d'imprimer deux fois.
//
// PRINTFUL_AUTO_CONFIRM : tant que cette variable ne vaut pas "1", la commande
// arrive chez Printful en BROUILLON, à confirmer à la main. C'est le réglage
// prudent pour les premières ventes — rien ne part en production par accident.

const STORE_ID = '15273464';

// Même normalisation qu'au paiement : une session déjà encaissée peut contenir
// un code de province saisi en toutes lettres (avant la mise en place de la
// liste fermée). Sans ce rattrapage, la commande resterait bloquée alors que
// le client a payé.
const ETATS = {
  CA: ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'],
  US: ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
};
const ETAT_ALIAS = {
  'QUEBEC': 'QC', 'QUÉBEC': 'QC', 'MONTREAL': 'QC', 'MONTRÉAL': 'QC',
  'ONTARIO': 'ON', 'TORONTO': 'ON', 'BRITISH COLUMBIA': 'BC', 'COLOMBIE-BRITANNIQUE': 'BC',
  'ALBERTA': 'AB', 'MANITOBA': 'MB', 'NOVA SCOTIA': 'NS', 'NEW BRUNSWICK': 'NB',
  'SASKATCHEWAN': 'SK', 'NEW YORK': 'NY', 'CALIFORNIA': 'CA', 'TEXAS': 'TX', 'FLORIDA': 'FL'
};
function normaliserEtat(pays, code) {
  if (!ETATS[pays]) return code || undefined;
  let c = String(code || '').trim().toUpperCase();
  if (ETAT_ALIAS[c]) c = ETAT_ALIAS[c];
  return ETATS[pays].indexOf(c) !== -1 ? c : undefined;
}
const json = (p, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get('session_id') || '').trim();
  if (!sessionId.startsWith('cs_')) return json({ error: 'Session invalide' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Configuration Stripe manquante' }, 500);

  // 1. La session est-elle vraiment payée ?
  const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
  });
  const session = await sRes.json().catch(() => null);
  if (!sRes.ok || !session) return json({ error: 'Session introuvable' }, 502);
  if (session.payment_status !== 'paid') return json({ paye: false, statut: session.payment_status }, 200);

  const key = env.PRINTFUL_API_KEY || env.PRINTFUL_TOKEN;
  if (!key) return json({ error: 'Configuration Printful manquante' }, 500);
  const H = { Authorization: 'Bearer ' + key, 'X-PF-Store-Id': STORE_ID, 'Content-Type': 'application/json' };

  let dest, items;
  try {
    dest = JSON.parse(session.metadata.dest);
    items = JSON.parse(session.metadata.items);
  } catch (e) {
    console.error('métadonnées illisibles', String(e).slice(0, 200));
    return json({ error: 'Commande illisible' }, 500);
  }

  // Printful limite la longueur de `external_id` ; un identifiant de session
  // Stripe complet (≈ 66 caractères) est refusé. On retire le préfixe et on
  // garde 32 caractères : déterministe, donc l'anti-doublon reste valable.
  const externalId = sessionId.replace(/^cs_(test|live)_/, '').slice(0, 32);

  const order = {
    external_id: externalId,
    recipient: {
      name: dest.name || (session.customer_details && session.customer_details.name) || 'Client',
      email: dest.email,
      phone: dest.phone || undefined,
      address1: dest.address1,
      city: dest.city,
      state_code: normaliserEtat(dest.country_code, dest.state_code),
      country_code: dest.country_code,
      zip: dest.zip
    },
    items: items.map(function (a) {
      return { variant_id: a[0], product_template_id: a[1], quantity: a[2], name: a[3] };
    })
  };

  // GARDE-FOU FINANCIER : un paiement en mode test n'apporte aucun argent, mais
  // une commande confirmée chez Printful est imprimée et facturée pour de vrai.
  // La confirmation automatique est donc ignorée tant que le paiement n'est pas
  // un paiement réel — quel que soit le réglage de PRINTFUL_AUTO_CONFIRM.
  const paiementReel = session.livemode === true;
  const confirm = paiementReel && env.PRINTFUL_AUTO_CONFIRM === '1';
  const res = await fetch('https://api.printful.com/orders?confirm=' + (confirm ? '1' : '0'), {
    method: 'POST', headers: H, body: JSON.stringify(order)
  });
  const pj = await res.json().catch(() => null);

  if (!res.ok) {
    // Doublon = la commande existe déjà : ce n'est pas une erreur pour le client.
    const msg = (pj && pj.result) ? String(pj.result) : '';
    // Printful écrit « External ID » avec un espace : le motif doit couvrir
    // les deux graphies, sinon un simple rechargement de page affichait une
    // erreur rouge alors que la commande était bien enregistrée.
    if (res.status === 409 || /external[ _]?id/i.test(msg)) {
      return json({ paye: true, deja_enregistree: true });
    }
    console.error('Printful order error', res.status, JSON.stringify(pj).slice(0, 500));
    return json({
      paye: true, transmise: false,
      detail: 'La commande est payée mais n’a pas pu être transmise.',
      motif: msg.slice(0, 160)
    }, 502);
  }

  return json({
    paye: true,
    transmise: true,
    brouillon: !confirm,
    mode: paiementReel ? 'production' : 'test',
    commande: pj && pj.result ? pj.result.id : null
  });
}

export async function onRequest({ request }) {
  if (request.method === 'GET') return;
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
}
