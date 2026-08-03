// Proxy du chat — Cloudflare Pages Function, servie sur /api/chat.
//
// Anciennement un Worker séparé sur *.workers.dev. Le déplacer ici supprime
// trois choses d'un coup : le sous-domaine workers.dev à reporter à la main
// dans le HTML, la configuration CORS (même origine, donc plus de préflight),
// et un second déploiement à maintenir.
//
// MOTEUR : Workers AI (binding `AI`), modèles ouverts hébergés par Cloudflare.
// Aucune clé d'API, aucune carte bancaire, 10 000 neurones/jour gratuits sur
// le plan Workers Free — largement au-delà du trafic d'un site vitrine.
// Le binding s'ajoute une fois dans le tableau de bord :
//   Workers & Pages > le projet > Settings > Bindings > Workers AI, nom `AI`
//
// xAI reste pris en charge en repli : si le binding `AI` est absent mais que
// le secret GROK_API_KEY existe, la fonction bascule dessus. Ça évite de
// perdre le chat si le binding saute, et permet de revenir à Grok plus tard
// sans retoucher au code.

// Le prompt porte la connaissance réelle du travail de Nadhem : sans ça le modèle ne
// sait rien de ce que fait Nadhem et ne peut ni répondre aux questions des
// visiteurs, ni donner envie de travailler avec lui. Tout ce qui suit est
// tiré du site lui-même — si une page change, mettre ce bloc à jour.
const SYSTEM_PROMPT = `You are the assistant on Aetherstone's website. Aetherstone is Nadhem Hsini, an independent multidisciplinary designer based in Montréal, working with clients worldwide.

WHAT HE DOES
Brand identity, packaging, art direction, editorial/book design, illustration, motion design, music videos and mini-documentaries. One practice, many crafts. No house style — a process.

HIS PROCESS (use this to answer "how do you work?")
1. Kick-off — get the brief straight: goal, constraints, audience, until they're actually clear.
2. Research — dig into the brand, market and competition; moodboards and references to find the angle worth pursuing.
3. Design — build the idea into a full visual identity: typography, colour, imagery, the whole system.
4. Production — print-ready files, dielines, mockups; he stays close to production so what ships matches the screen.
5. Delivery — final files plus usage guidelines, everything needed to roll it out. And handoff isn't goodbye: he stays reachable for the question that comes up at the printer.
His line on it: concept before decoration. A nice colour palette isn't an idea. And a good idea poorly crafted is still just an idea.

SELECTED WORK (real projects — you may describe these)
- HESS — visual identity, "groove universel, vacarme absolu"
- Moodgie — identity and packaging, bringing back everyday softness
- Tempo Dolce — identity and packaging for a biscuit that wakes a memory
- Simo — identity and labels for a beer that tells a story
- Écurie 33 — art direction for a music label with no rules or filter
- Casaboom / Casaboom Sousse — summer campaign art direction, and a night in a city for Golf Bräu
- Let's Not Pretend — official music video for WINGZ
- Party Life — art direction for WINGZ
- Azzedine Alaïa — mini-documentary and motion design
- Virgil Was Here — kinetic animation tribute to Virgil Abloh
- Martin Margiela — editorial tribute, "Silence Was His Greatest Collection"
- Beyond Silence — editorial book design
- Chez Stony — miniature reproduction of a Montréal dépanneur
- The Bus — Montréal reproduced to scale, in miniature

SHOP
A small shop of limited pieces: oversized 100% cotton screen-printed tees, printed to order, 55 $ CAD each (Aether Market, High Society, Digital Cowboy, Bada Bing). Limited edition, no restock. Point visitors to the Shop page if they ask.

HOW TO TALK
You are Nadhem's assistant, not Nadhem. Always speak about him in the third person — "he did the labels for Simo", never "I did". Getting this wrong makes the site look like it's pretending, which is the opposite of what Nadhem stands for.
Talk like a sharp, warm collaborator texting a friend — not a form, not a brochure, and not a passive Q&A box either. You have opinions and energy: if a project sounds interesting, say so. Short natural sentences. No emojis. No bullet lists unless genuinely useful.
Always reply in the language the visitor writes in. If it's unclear, default to French — Nadhem is Montréal-based and works French-first.
Be genuinely useful about design: if someone asks what packaging involves, or why an identity costs what it costs, answer properly. Being helpful is what earns the project.
Drive, don't wait. A flat answer with nothing after it lets the conversation die — that's the single most common way this fails. Unless you are closing (see below), every reply ends by moving things forward: a sharp follow-up question, a reaction that invites more detail, or a relevant example that naturally prompts them to say more about their own project. Never just answer and stop. If the visitor gives a one-word or vague reply, don't repeat the same question back — get more specific or offer an example to react to ("something more like Simo's playful side, or HESS's rawer energy?").

YOUR GOAL
Turn interest into a real conversation with Nadhem. Actively find out, one thing at a time, never like a form:
- what they need (identity, packaging, art direction, video, something else)
- what sector or industry it's for
- roughly what budget they have in mind
- timeline, references, anything specific
Ask for the budget directly once the need and sector are clear — don't dance around it. Something like "roughly what budget are you working with?" is normal and expected, not pushy; not asking is what leaves deals stuck in the air.
Follow up on what they actually say. Show you understood their project — reference a relevant past project when it genuinely fits ("he did the labels for Simo, same kind of thing").
CLOSING — this matters more than anything else
As soon as you know the need + the sector + a budget (even a rough one), STOP asking questions and close. Do not ask "one more thing" out of politeness — a visitor who has told you all three is ready, and another question loses them.
Close warmly in one or two sentences: acknowledge the project, say Nadhem will take it from here, ask for their details. Then, on its own line, output exactly [[SHOW_CONTACT_FORM]] and nothing after it.
Close immediately, without waiting for all three, whenever the visitor says anything like "I'm ready to start", "how do we begin", "can I hire you", "send me a quote", or asks to be contacted. Momentum beats completeness — Nadhem can ask the rest by email.
Never end a message with both a question and the tag. It's one or the other.

NEVER
Never invent prices, timelines, availability, client names or projects that aren't listed above. If asked about cost or scheduling, say honestly that it depends on scope and that Nadhem will confirm directly — then move toward getting their details so he can. Never promise anything on his behalf.
His email is atherpluss@gmail.com if someone would rather write directly.`;

// Décide s'il est temps d'afficher le formulaire de contact.
//
// Pourquoi ici et pas dans le prompt : on demandait au modèle d'écrire le
// marqueur [[SHOW_CONTACT_FORM]] lui-même, et il l'omettait presque toujours,
// préférant poser une question de plus. Résultat, le formulaire n'apparaissait
// jamais et aucun prospect ne partait. La décision ne pouvait pas rester
// entre les mains du modèle qui rédige.
//
// Le pré-filtre évite un appel d'inférence à chaque tour : tant qu'il n'y a ni
// signal d'engagement ni montant dans la conversation, il est inutile de
// demander quoi que ce soit.
// Intention explicite : le visiteur demande à démarrer, à être contacté ou un
// devis. Aucun jugement n'est nécessaire, et le juge se montrait justement
// trop prudent sur ces cas — il exigeait un budget avant de dire oui, alors
// que quelqu'un qui écrit « on commence comment ? » est déjà acquis.
const INTENT_HINTS =
  /(on commence|par où commencer|par ou commencer|comment (on |ça |ca )?(commence|démarre|demarre)|devis|vous engager|travailler avec (nadhem|vous)|me contacter|contactez[- ]moi|rappelez[- ]moi|ready to start|get started|how do we (start|begin)|hire (him|you)|send me a quote|get a quote|contact me|reach out)/i;
// Un montant chiffré est aussi décisif qu'une intention explicite : personne
// n'annonce « 6000 $ » par curiosité. Le juge, lui, s'est révélé instable sur
// ce cas — même conversation, verdict différent d'un appel à l'autre — donc
// on ne le laisse pas décider de ce qui est déjà certain.
const AMOUNT_HINTS =
  /(\d[\d\s.,]{2,})\s*(\$|k\b|eur|cad|usd|euros?|dollars?)|(\$|eur|usd|cad)\s*\d[\d\s.,]{2,}/i;
// Signaux plus faibles : ils justifient de consulter le juge, pas de conclure.
const MONEY_HINTS = /budget|prêt à démarrer|pret a demarrer|ready to start/i;

async function isReady(env, model, history, lastReply) {
  const userText = history
    .filter((m) => m.role !== 'assistant')
    .map((m) => m.content)
    .join('\n');
  if (INTENT_HINTS.test(userText) || AMOUNT_HINTS.test(userText)) return true;
  if (!MONEY_HINTS.test(userText)) return false;

  const transcript = history
    .map((m) => (m.role === 'assistant' ? 'Assistant: ' : 'Visitor: ') + m.content)
    .concat('Assistant: ' + lastReply)
    .join('\n');

  try {
    const out = await env.AI.run(model, {
      messages: [
        {
          role: 'system',
          content:
            'You judge whether a website visitor is ready to be handed over to the designer. ' +
            'Answer with exactly one word, YES or NO, nothing else.\n' +
            'YES if the visitor has described what they need AND given a budget (even approximate), ' +
            'or if they explicitly asked to start, to be contacted, or to get a quote.\n' +
            'NO otherwise.'
        },
        { role: 'user', content: transcript }
      ],
      temperature: 0,
      max_tokens: 5
    });
    const verdict = (out?.response || out?.choices?.[0]?.message?.content || '').trim().toUpperCase();
    return verdict.startsWith('YES');
  } catch (err) {
    // Un échec du juge ne doit pas casser la conversation : on continue
    // simplement à discuter, le tour suivant réessaiera.
    console.error('isReady error', String(err).slice(0, 200));
    return false;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  // On borne : 16 derniers tours, messages de 2000 caractères max.
  const trimmed = history
    .slice(-16)
    .filter((m) => m && typeof m.content === 'string' && m.content.length <= 2000);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...trimmed.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  ];

  // Chemin normal : Workers AI. `gemma-4-26b-a4b-it` est un modèle ouvert
  // disponible sur le plan gratuit et bon en français — surchargeable par la
  // variable AI_MODEL sans toucher au code.
  //
  // Le modèle principal est un *instruct* classique, choisi délibérément.
  // Les modèles à raisonnement du catalogue (gemma-4-26b-a4b-it,
  // glm-4.7-flash) émettent une longue trace interne avant la réponse : sur
  // les questions ouvertes ils atteignaient `finish_reason: "length"` et
  // renvoyaient `content: null`. Le chat semblait cassé alors que le modèle
  // « répondait » — dans sa trace.
  //
  // Second modèle en secours : si le premier est saturé ou muet, on retente
  // plutôt que de rendre la main sur une erreur.
  const models = [
    env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-3.1-8b-instruct-fast'
  ];

  if (env.AI) {
    for (const model of models) {
      try {
        const out = await env.AI.run(model, { messages, temperature: 0.7, max_tokens: 400 });
        // Deux formats coexistent selon les modèles : `response` (historique)
        // et la forme OpenAI `choices[].message.content`.
        const reply = (out?.response || out?.choices?.[0]?.message?.content || '').trim();
        if (reply) {
          const showContact = await isReady(env, model, trimmed, reply);
          return json({ reply, showContact });
        }
        console.error('Workers AI réponse vide', model, JSON.stringify(out).slice(0, 200));
      } catch (err) {
        // On journalise et on continue : un 429 (quota quotidien épuisé) ou une
        // saturation ponctuelle ne doit pas rendre le chat muet tant qu'il
        // reste une option.
        console.error('Workers AI error', model, String(err).slice(0, 200));
      }
    }
  }

  if (!env.GROK_API_KEY) {
    return json({ error: 'Aucun moteur disponible : ni binding AI, ni GROK_API_KEY' }, 500);
  }

  try {
    const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // `grok-beta` a été retiré par xAI (400 "Model not found") — le chat
        // était muet pour cette seule raison. Surchargeable par la variable
        // GROK_MODEL le jour où celui-ci sera déprécié à son tour.
        model: env.GROK_MODEL || 'grok-4.5',
        messages,
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!upstream.ok) {
      // Le détail de l'erreur amont n'est pas renvoyé au navigateur : il peut
      // contenir des informations de compte. Il part dans les logs Cloudflare.
      console.error('xAI upstream error', upstream.status, await upstream.text());
      return json({ error: 'Upstream error' }, 502);
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || '';
    return json({ reply });
  } catch (err) {
    console.error('chat function exception', err);
    return json({ error: 'Server exception' }, 500);
  }
}

// Toute méthode autre que POST : réponse explicite plutôt qu'un 404 opaque.
export async function onRequest({ request }) {
  if (request.method === 'POST') return; // délégué à onRequestPost
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
