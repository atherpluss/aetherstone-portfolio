// Message rapide depuis le popup contact — Pages Function, sur /api/contact.
//
// Remplace l'envoi direct vers formsubmit.co qui figurait en dur dans le
// `action` du formulaire, sur une soixantaine de pages. Deux raisons de
// changer : le service gratuit repondait 429 (limite de debit) et laissait
// des messages se perdre, et l'adresse de destination etait lisible dans le
// HTML de chaque page — une invitation au spam.
//
// L'envoi passe desormais par Cloudflare Email Sending, comme les commandes
// (voir functions/api/order-confirm.js) : adresse de destination verifiee sur
// le compte, envoi gratuit et hors quota.

const DEST = '2395635cegep@gmail.com';
const json = (p, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  // Le formulaire envoie un FormData ; on accepte aussi du JSON par tolerance.
  let champs = {};
  const ctype = request.headers.get('content-type') || '';
  try {
    if (ctype.includes('application/json')) {
      champs = await request.json();
    } else {
      const fd = await request.formData();
      fd.forEach((v, k) => { champs[k] = typeof v === 'string' ? v : ''; });
    }
  } catch (e) {
    return json({ error: 'Requête invalide' }, 400);
  }

  const clean = (v, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const email = clean(champs.Email || champs.email, 160);
  const message = clean(champs.Message || champs.message, 4000);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Adresse courriel invalide' }, 400);
  }
  if (!message) return json({ error: 'Message vide' }, 400);

  const boite = env.LEAD_EMAIL || DEST;

  if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_TOKEN) {
    console.error('contact : configuration Cloudflare Email absente');
    return json({ error: "L'envoi a échoué" }, 502);
  }

  const corps = [
    'MESSAGE RAPIDE — popup contact du site',
    '',
    'De     : ' + email,
    'Recu le: ' + new Date().toISOString(),
    '',
    'Message :',
    message
  ].join('\n');

  try {
    const r = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/email/sending/send',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.CF_EMAIL_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'contact@nadhemhsini.online',
          // Repondre au message renvoie directement au visiteur.
          reply_to: email,
          to: boite,
          subject: 'Message rapide du site — ' + email,
          text: corps
        })
      }
    );
    if (!r.ok) {
      console.error('contact : Cloudflare Email refus', r.status, (await r.text()).slice(0, 300));
      return json({ error: "L'envoi a échoué" }, 502);
    }
  } catch (e) {
    console.error('contact : erreur envoi', String(e).slice(0, 200));
    return json({ error: "L'envoi a échoué" }, 502);
  }

  return json({ ok: true, success: 'true' });
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
