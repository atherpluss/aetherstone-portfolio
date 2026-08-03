// Réception d'un prospect issu du chatbot — Pages Function, sur /api/lead.
//
// Le chat envoyait auparavant vers `formspree.io/f/mrenvadv`, un identifiant
// hérité du template d'origine : les demandes ne parvenaient à personne.
// Elles partent désormais vers la même adresse que les formulaires du site.
//
// Le traitement est ici et pas dans le navigateur pour trois raisons :
// l'adresse de destination n'apparaît plus dans le HTML (moins de spam),
// le récapitulatif est rédigé côté serveur par le modèle, et l'échec d'envoi
// devient détectable — le visiteur ne voit plus « Envoyé » quand rien ne part.

const DEST = '2395635cegep@gmail.com';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const json = (p, s = 200) => new Response(JSON.stringify(p), { status: s, headers: JSON_HEADERS });

// Demande au modèle d'extraire l'essentiel de la conversation. Le mail doit
// être lisible en dix secondes sur un téléphone : besoin, secteur, budget,
// délai. En cas d'échec, on n'abandonne pas l'envoi — la transcription
// complète suffit à rappeler le prospect.
async function summarize(env, transcript) {
  if (!env.AI) return null;
  try {
    const out = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content:
            "Tu résumes une conversation entre un visiteur et l'assistant d'un studio de design. " +
            'Réponds en français, en texte brut, exactement sous cette forme et rien d\'autre :\n' +
            'BESOIN: ...\nSECTEUR: ...\nBUDGET: ...\nDELAI: ...\nRESUME: (deux phrases max)\n' +
            "Si une information est absente, écris 'non précisé'. N'invente rien."
        },
        { role: 'user', content: transcript }
      ],
      temperature: 0.2,
      max_tokens: 1024
    });
    return (out?.response || out?.choices?.[0]?.message?.content || '').trim() || null;
  } catch (err) {
    console.error('lead summarize error', String(err).slice(0, 200));
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const email = clean(body.email, 160);
  // Garde-fou minimal : sans adresse exploitable, le prospect est inutile.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Adresse email manquante ou invalide' }, 400);
  }

  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const phone = clean(body.phone, 40);

  const history = Array.isArray(body.messages) ? body.messages : [];
  const transcript = history
    .slice(-40)
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => (m.role === 'assistant' ? 'Assistant : ' : 'Visiteur : ') + m.content.slice(0, 2000))
    .join('\n');

  const recap = await summarize(env, transcript);
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Non précisé';

  const payload = {
    _subject: `Nouveau prospect via le chatbot — ${name}`,
    // formsubmit renvoie l'accusé à cette adresse : répondre au visiteur
    // devient un simple « Répondre » depuis la boîte mail.
    _replyto: email,
    _template: 'table',
    Nom: name,
    Email: email,
    Telephone: phone || 'Non précisé',
    Recapitulatif: recap || 'Résumé indisponible — voir la conversation ci-dessous.',
    Conversation: transcript || 'Aucune conversation enregistrée.',
    Recu_le: new Date().toISOString()
  };

  const origin = new URL(request.url).origin;

  try {
    const res = await fetch(`https://formsubmit.co/ajax/${env.LEAD_EMAIL || DEST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // formsubmit rejette tout appel sans origine ("open this page through
        // a web server") — un appel serveur n'en a pas, il faut la fournir.
        Origin: origin,
        Referer: origin + '/'
      },
      body: JSON.stringify(payload)
    });

    // Piège : formsubmit répond 200 même en cas d'échec, le verdict est dans
    // le corps. Se fier au seul code HTTP ferait passer un envoi raté pour
    // un succès — exactement ce que ce point d'entrée doit éviter.
    const text = await res.text();
    let ok = res.ok;
    try {
      const data = JSON.parse(text);
      ok = ok && String(data.success) === 'true';
      if (!ok) console.error('formsubmit refus', res.status, String(data.message).slice(0, 300));
    } catch (e) {
      ok = false;
      console.error('formsubmit réponse illisible', res.status, text.slice(0, 300));
    }

    if (!ok) return json({ error: "L'envoi a échoué" }, 502);
    return json({ ok: true });
  } catch (err) {
    console.error('lead send exception', String(err).slice(0, 200));
    return json({ error: "L'envoi a échoué" }, 502);
  }
}

// Toute méthode autre que POST : réponse explicite plutôt qu'un 404 opaque.
export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
