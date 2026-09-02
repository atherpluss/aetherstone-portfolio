// Confirmation de commande — Pages Function, sur /api/order-confirm.
//
// Appelée avec l'identifiant de session Stripe au retour du paiement. Elle
// vérifie AUPRÈS DE STRIPE que la session est réellement payée avant de faire
// quoi que ce soit : le paramètre d'URL vient du navigateur, il ne prouve rien.
//
// Fournisseur d'impression : Tapstitch, saisie manuelle des commandes.
// Tapstitch n'a pas d'API pour un site sur mesure (voir functions/api/
// checkout.js pour le détail) — il ne reste donc plus de commande à créer
// automatiquement. Cette fonction envoie à la place un courriel récapitulatif
// à Nadhem, à ressaisir dans Tapstitch.
//
// Anti-doublon : Printful refusait auparavant une commande déjà enregistrée
// (external_id). Sans lui, un simple rechargement de la page de confirmation
// renverrait le même courriel. Le Cache API de Cloudflare sert de mémoire
// courte (24 h) pour ne notifier chaque commande qu'une fois — aucune
// infrastructure supplémentaire à provisionner pour ça.

const json = (p, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get('session_id') || '').trim();
  if (!sessionId.startsWith('cs_')) return json({ error: 'Session invalide' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Configuration Stripe manquante' }, 500);

  const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
  });
  const session = await sRes.json().catch(() => null);
  if (!sRes.ok || !session) return json({ error: 'Session introuvable' }, 502);
  if (session.payment_status !== 'paid') return json({ paye: false, statut: session.payment_status }, 200);

  // Marqueur de doublon : une clé de cache dédiée, propre à cette session.
  const cache = caches.default;
  const markerUrl = new URL(request.url);
  markerUrl.search = '';
  markerUrl.pathname = '/__order-notified/' + sessionId;
  const marker = new Request(markerUrl.toString());
  if (await cache.match(marker)) {
    return json({ paye: true, deja_enregistree: true });
  }

  let dest, items;
  try {
    dest = JSON.parse(session.metadata.dest);
    items = JSON.parse(session.metadata.items);
  } catch (e) {
    console.error('métadonnées illisibles', String(e).slice(0, 200));
    return json({ error: 'Commande illisible' }, 500);
  }

  const shippingCad = session.total_details && typeof session.total_details.amount_shipping === 'number'
    ? (session.total_details.amount_shipping / 100).toFixed(2)
    : '?';
  const totalCad = typeof session.amount_total === 'number' ? (session.amount_total / 100).toFixed(2) : '?';

  const lignes = items.map(function (a) {
    return '- ' + a[0] + ' — taille ' + a[1] + ' — quantité ' + a[2];
  }).join('\n');

  const adresse = [dest.address1, dest.city, dest.state_code, dest.zip, dest.country_code].filter(Boolean).join(', ');

  const corps = [
    'NOUVELLE COMMANDE PAYÉE — à saisir dans Tapstitch',
    '',
    'Client    : ' + (dest.name || (session.customer_details && session.customer_details.name) || 'Non précisé'),
    'Email     : ' + dest.email,
    'Téléphone : ' + (dest.phone || 'Non précisé'),
    'Adresse   : ' + adresse,
    '',
    'Articles :',
    lignes,
    '',
    'Livraison facturée : ' + shippingCad + ' CAD',
    'Total payé         : ' + totalCad + ' CAD',
    'Référence Stripe   : ' + sessionId,
    '',
    'À faire : créer cette commande dans Tapstitch avec ces articles et cette adresse.'
  ].join('\n');

  // --- Envoi du récapitulatif -----------------------------------------------
  // Canal unique : API Cloudflare Email Sending. L'adresse d'arrivée est
  // vérifiée sur le compte, donc l'envoi est gratuit et hors quota. Il remplace
  // formsubmit.co, dont la limite de débit (429) laissait passer des commandes
  // payées sans que personne ne soit prévenu.
  let envoye = false;
  if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_TOKEN) {
    console.error('commande : configuration Cloudflare Email absente');
  } else {
    try {
      const mailRes = await fetch(
        'https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/email/sending/send',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + env.CF_EMAIL_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'contact@nadhemhsini.online',
            // Répondre au récapitulatif écrit directement au client.
            reply_to: dest.email,
            to: env.LEAD_EMAIL || '2395635cegep@gmail.com',
            subject: 'Nouvelle commande payée — à saisir dans Tapstitch',
            text: corps
          })
        }
      );
      envoye = mailRes.ok;
      if (!envoye) console.error('Cloudflare Email refus (commande)', mailRes.status, (await mailRes.text()).slice(0, 300));
    } catch (e) {
      console.error('erreur envoi courriel commande', String(e).slice(0, 200));
    }
  }

  if (!envoye) {
    // Le paiement est acquis quoi qu'il arrive ; seul l'envoi du récapitulatif
    // a échoué. On ne pose pas le marqueur de doublon, pour qu'un nouvel
    // essai (rechargement de la page) puisse retenter l'envoi.
    return json({
      paye: true, transmise: false,
      detail: 'Paiement confirmé, mais le courriel de commande n’a pas pu être envoyé. Vérifier manuellement avec la référence Stripe.',
      reference: sessionId
    }, 502);
  }

  // Marqueur posé pour 24 h : au-delà, un identifiant de session Stripe très
  // ancien n'a de toute façon plus de raison de revenir sur cette page.
  await cache.put(marker, new Response('1', { headers: { 'Cache-Control': 'max-age=86400' } }));

  return json({ paye: true, transmise: true, reference: sessionId });
}

export async function onRequest({ request }) {
  if (request.method === 'GET') return;
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
}
