// Paiement d'une commande boutique — Pages Function, sur /api/checkout.
//
// Enchaînement :
//   1. le visiteur remplit le formulaire de commande existant (adresse, etc.) ;
//   2. cette fonction demande à Printful le VRAI tarif de livraison pour cette
//      adresse — pas un forfait inventé ;
//   3. elle crée une session de paiement Stripe (chandails + livraison) ;
//   4. le navigateur est redirigé vers la page de paiement sécurisée de Stripe.
//
// La commande n'est PAS envoyée à Printful ici : elle part seulement une fois
// le paiement confirmé, dans /api/order-confirm. Sinon un panier abandonné
// déclencherait une impression payante.
//
// Les prix sont redéfinis ici, côté serveur. Ne jamais faire confiance au prix
// envoyé par le navigateur : n'importe qui peut le modifier avant l'envoi.

const PRICE_CAD = 55;

// Correspondance site → modèle Printful (Design Maker).
// Les variantes ne sont pas codées en dur : elles sont lues chez Printful au
// moment de la commande, ce qui évite toute dérive si un modèle est modifié.
const TEMPLATES = {
  'aether-market': 105728177,
  'digital-cowboy': 105728160,
  'high-society': 105728147,
  'bada-bing': 105728053
};

const STORE_ID = '15273464';
const CATALOG_PRODUCT = 823; // Stanley/Stella Blaster 2.0
// Le site écrit « XXL », Printful écrit « 2XL ».
const SIZE_ALIAS = { XXL: '2XL' };

// Printful n'accepte que le code officiel à deux lettres. On valide AVANT
// d'encaisser : un client qui paie pour une adresse inexpédiable, c'est un
// remboursement et une commande perdue.
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

function pfHeaders(env) {
  const key = env.PRINTFUL_API_KEY || env.PRINTFUL_TOKEN;
  if (!key) return null;
  return { Authorization: 'Bearer ' + key, 'X-PF-Store-Id': STORE_ID, 'Content-Type': 'application/json' };
}

// Taille demandée → identifiant de variante Printful, en croisant les variantes
// autorisées par le modèle (elles portent la couleur) avec le catalogue (qui
// porte les tailles).
async function resolveVariant(H, templateId, size) {
  const [tplRes, catRes] = await Promise.all([
    fetch('https://api.printful.com/product-templates/' + templateId, { headers: H }),
    fetch('https://api.printful.com/products/' + CATALOG_PRODUCT, { headers: H })
  ]);
  const tpl = await tplRes.json().catch(() => null);
  const cat = await catRes.json().catch(() => null);
  const allowed = tpl && tpl.result && tpl.result.available_variant_ids;
  const variants = cat && cat.result && cat.result.variants;
  if (!allowed || !variants) return null;
  const wanted = (SIZE_ALIAS[size] || size).toUpperCase();
  const match = variants.find((v) => allowed.indexOf(v.id) !== -1 && String(v.size).toUpperCase() === wanted);
  return match ? match.id : null;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Requête invalide' }, 400); }

  const H = pfHeaders(env);
  if (!H) return json({ error: 'Configuration Printful manquante' }, 500);
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
    const tpl = TEMPLATES[it && it.id];
    if (!tpl) continue;
    const qty = Math.min(Math.max(parseInt(it.qty, 10) || 1, 1), 10);
    const size = clean(it.size, 5) || 'M';
    const variantId = await resolveVariant(H, tpl, size);
    if (!variantId) return json({ error: 'Taille indisponible pour ' + it.id + ' (' + size + ')' }, 400);
    items.push({ id: it.id, name: clean(it.name, 60) || it.id, size, qty, template: tpl, variant: variantId });
  }
  if (!items.length) return json({ error: 'Panier vide' }, 400);

  // --- Livraison : tarif réel demandé à Printful pour cette adresse ---
  let shippingCad = null;
  let motifLivraison = null;
  try {
    const rateRes = await fetch('https://api.printful.com/shipping/rates', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        recipient: {
          address1: recipient.address1, city: recipient.city, country_code: recipient.country_code,
          state_code: recipient.state_code || undefined, zip: recipient.zip
        },
        items: items.map((i) => ({ variant_id: i.variant, quantity: i.qty })),
        currency: 'CAD',
        locale: 'fr_FR'
      })
    });
    const rj = await rateRes.json().catch(() => null);
    const first = rj && rj.result && rj.result[0];
    if (first && first.rate) shippingCad = Math.round(parseFloat(first.rate) * 100);
    else {
      // Le message de Printful est explicite (« Invalid state code », « Invalid
      // zip »…) : on le remonte au client, c'est lui qui peut corriger.
      const brut = rj && rj.result ? String(rj.result) : '';
      if (/state/i.test(brut)) motifLivraison = 'Province ou État invalide pour ce pays.';
      else if (/zip|postal/i.test(brut)) motifLivraison = 'Code postal invalide pour cette adresse.';
      else if (brut) motifLivraison = 'Livraison impossible : ' + brut.slice(0, 120);
      console.error('tarif livraison indisponible', rateRes.status, JSON.stringify(rj).slice(0, 300));
    }
  } catch (e) {
    console.error('erreur tarif livraison', String(e).slice(0, 200));
  }
  // Un tarif indisponible signifie presque toujours une adresse que Printful
  // ne sait pas livrer. Mieux vaut refuser ici que d'encaisser un paiement
  // pour une commande qui sera rejetée ensuite.
  if (shippingCad === null) {
    return json({ error: motifLivraison || 'Livraison impossible vers cette adresse. Vérifiez le code postal, la ville et la province.' }, 400);
  }

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

  // Tout ce qu'il faut pour fabriquer la commande Printful après paiement.
  // Stripe limite chaque valeur à 500 caractères : on reste compact.
  form.set('metadata[dest]', JSON.stringify(recipient).slice(0, 480));
  form.set('metadata[items]', JSON.stringify(items.map((i) => [i.variant, i.template, i.qty, i.name])).slice(0, 480));

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
