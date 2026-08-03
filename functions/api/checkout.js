// Paiement d'une commande boutique — Pages Function, sur /api/checkout.
//
// Fournisseur d'impression : Tapstitch. Contrairement à Printful, Tapstitch
// n'expose pas d'API générale pour un site sur mesure — il s'intègre
// uniquement à des plateformes nommées (Shopify, WooCommerce, Etsy…) dont il
// appelle lui-même l'API. Impossible d'interroger un catalogue de variantes
// ou un tarif de livraison en direct depuis ce site.
//
// D'où l'architecture : ce point d'entrée encaisse via Stripe (produit +
// forfait de livraison FIXE, faute de tarif réel disponible). Une fois le
// paiement confirmé, /api/order-confirm envoie un courriel récapitulatif —
// la commande est ensuite saisie manuellement dans Tapstitch, comme convenu.
//
// Les prix sont redéfinis ici, côté serveur. Ne jamais faire confiance au prix
// envoyé par le navigateur : n'importe qui peut le modifier avant l'envoi.

const PRICE_CAD = 55;

// Forfait de livraison FIXE — il n'existe aucune API Tapstitch à interroger
// pour un tarif réel. Valeur de départ approximative ; à ajuster ici si les
// frais réels observés dans Tapstitch s'écartent trop de ce montant.
// Un seul palier "international" au-delà du Canada/É.-U., par simplicité —
// affiner par pays si le volume de commandes hors Amérique du Nord le justifie.
const SHIPPING_CAD = {
  CA: 1200, // 12,00 $ CAD
  US: 1500, // 15,00 $ CAD
  INTL: 2500 // 25,00 $ CAD
};

// Correspondance site → nom du modèle dans Tapstitch, pour que le courriel de
// commande soit sans ambiguïté au moment de la ressaisie manuelle. Les noms
// doivent matcher exactement ce qui apparaît dans le tableau de bord Tapstitch.
const PRODUCT_NAMES = {
  'aether-market': 'Aether Market',
  'digital-cowboy': 'Digital Cowboy',
  'high-society': 'High Society',
  'bada-bing': 'Bada Bing'
};

const ETATS = {
  CA: ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'],
  US: ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
};
// Rattrapage des saisies en toutes lettres les plus courantes.
const ETAT_ALIAS = {
  'QUEBEC': 'QC', 'QUÉBEC': 'QC', 'MONTREAL': 'QC', 'MONTRÉAL': 'QC',
  'ONTARIO': 'ON', 'TORONTO': 'ON', 'BRITISH COLUMBIA': 'BC', 'COLOMBIE-BRITANNIQUE': 'BC',
  'ALBERTA': 'AB', 'MANITOBA': 'MB', 'NOVA SCOTIA': 'NS', 'NEW BRUNSWICK': 'NB',
  'SASKATCHEWAN': 'SK', 'NEW YORK': 'NY', 'CALIFORNIA': 'CA', 'TEXAS': 'TX', 'FLORIDA': 'FL'
};

const json = (p, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Requête invalide' }, 400); }

  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Configuration Stripe manquante' }, 500);

  const clean = (v, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const r = body.recipient || {};
  const recipient = {
    name: clean(r.name, 100),
    email: clean(r.email, 160),
    phone: clean(r.phone, 40),
    address1: clean(r.address1, 160),
    city: clean(r.city, 80),
    zip: clean(r.zip, 20),
    country_code: (clean(r.country_code, 2) || 'CA').toUpperCase(),
    state_code: clean(r.state_code, 8)
  };
  if (!recipient.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient.email)) return json({ error: 'Adresse courriel invalide' }, 400);
  if (!recipient.address1 || !recipient.city || !recipient.zip) return json({ error: 'Adresse incomplète' }, 400);

  if (ETATS[recipient.country_code]) {
    let code = recipient.state_code.toUpperCase();
    if (ETAT_ALIAS[code]) code = ETAT_ALIAS[code];
    if (ETATS[recipient.country_code].indexOf(code) === -1) {
      return json({ error: 'Sélectionnez votre ' + (recipient.country_code === 'US' ? 'État' : 'province') + ' dans la liste.' }, 400);
    }
    recipient.state_code = code;
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 10) : [];
  const items = [];
  for (const it of rawItems) {
    const name = PRODUCT_NAMES[it && it.id];
    if (!name) continue;
    const qty = Math.min(Math.max(parseInt(it.qty, 10) || 1, 1), 10);
    const size = clean(it.size, 5) || 'M';
    items.push({ id: it.id, name, size, qty });
  }
  if (!items.length) return json({ error: 'Panier vide' }, 400);

  const shippingCad = SHIPPING_CAD[recipient.country_code] || SHIPPING_CAD.INTL;

  // --- Session de paiement Stripe ---
  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', origin + '/pages/shop.html?commande=ok&session_id={CHECKOUT_SESSION_ID}');
  form.set('cancel_url', origin + '/pages/shop.html?commande=annulee');
  form.set('customer_email', recipient.email);
  form.set('locale', 'fr');

  items.forEach((it, i) => {
    form.set(`line_items[${i}][quantity]`, String(it.qty));
    form.set(`line_items[${i}][price_data][currency]`, 'cad');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(PRICE_CAD * 100));
    form.set(`line_items[${i}][price_data][product_data][name]`, it.name + ' — taille ' + it.size);
  });
  form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shippingCad));
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'cad');
  form.set('shipping_options[0][shipping_rate_data][display_name]', 'Livraison');

  // Tout ce qu'il faut pour rédiger le courriel de commande après paiement.
  // Stripe limite chaque valeur à 500 caractères : on reste compact.
  form.set('metadata[dest]', JSON.stringify(recipient).slice(0, 480));
  form.set('metadata[items]', JSON.stringify(items.map((i) => [i.name, i.size, i.qty])).slice(0, 480));

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  const session = await res.json().catch(() => null);
  if (!res.ok || !session || !session.url) {
    console.error('Stripe session error', res.status, JSON.stringify(session).slice(0, 400));
    return json({ error: 'Le paiement n’a pas pu être ouvert' }, 502);
  }
  return json({ url: session.url });
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
