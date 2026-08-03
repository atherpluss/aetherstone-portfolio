# Déploiement — nadhemhsini.online

Site statique sur **Cloudflare Pages**. Le chat n'est plus un Worker séparé :
il tourne comme **Pages Function** sur le même domaine, donc un seul
déploiement, aucun sous-domaine à reporter, aucun CORS à configurer.

Rien n'a été exécuté à ta place : le déploiement demande l'authentification
de ton compte Cloudflare.

---

## 0. Avant de publier

Récupérer 618 Mo d'assets qui ne sont référencés nulle part. Ils sont déjà
exclus du déploiement par `.gitignore`, mais autant libérer la place — leur
inventaire complet est dans `_quarantine/MANIFESTE.txt` :

```bash
rm -rf _quarantine
```

---

## 1. Publier le site

```bash
cd ~/Downloads/bib-site/namma-clone
npx wrangler pages deploy . --project-name=nadhemhsini --branch=production
```

**Le `cd` n'est pas décoratif.** Lancée depuis ton dossier personnel, la
commande essaie d'uploader tout `~` et meurt sur un fichier socket
(`Unknown system error -102`). Ce n'est pas un bug de Wrangler : le `.`
désigne le dossier courant.

**`--branch=production` n'est pas optionnel.** Sans lui, wrangler prend le nom
de la branche git locale (`main`), que ce projet ne considère pas comme la
production : le déploiement part en **Preview**, et `nadhemhsini.pages.dev`
continue de répondre 404 alors que l'URL du déploiement fonctionne. C'est
exactement ce qui s'est passé au premier essai.

La première exécution ouvre l'authentification Cloudflare dans le navigateur
et propose de créer le projet. Wrangler renvoie ensuite une URL en
`*.pages.dev` : vérifie-la avant de brancher le domaine.

Le dossier `functions/` est détecté automatiquement — `/api/chat` et la
détection de langue sont déployés avec le site, sans configuration.

---

## 2. Le chat — rien à payer, rien à configurer

Le chat tourne sur **Workers AI**, les modèles ouverts hébergés par
Cloudflare. Pas de clé d'API, pas de carte bancaire : **10 000 neurones par
jour** sont inclus gratuitement dans le plan Workers Free, très au-delà du
trafic d'un site vitrine.

Le binding est déjà en place sur le projet (Settings > Bindings > Workers AI,
nom de variable `AI`). Si tu recrées le projet un jour, c'est la seule chose
à refaire.

Modèle utilisé : `@cf/google/gemma-4-26b-a4b-it`, changeable sans toucher au
code via une variable `AI_MODEL`. **Évite les modèles à raisonnement** type
`glm-4.7-flash` : ils dépensent le budget de tokens dans leur trace de
réflexion et renvoient une réponse vide.

xAI reste branché en repli : si tu poses un jour un secret `GROK_API_KEY`
valide, la fonction bascule dessus quand Workers AI est indisponible.

### Ce que le chatbot sait

Le prompt système de `functions/api/chat.js` contient les vrais services, la
méthode en cinq étapes et les 15 projets. **Quand tu ajoutes un projet au
site, ajoute-le aussi dans ce bloc** — sinon l'assistant ne pourra pas en
parler, et il a interdiction d'inventer.

### Réception des demandes

Quand la conversation est mûre, le formulaire s'affiche et la demande part
vers `2395635cegep@gmail.com` via `/api/lead`, avec un récapitulatif rédigé
automatiquement (besoin, secteur, budget, délai) suivi de la conversation
complète. Répondre au visiteur se fait d'un simple « Répondre ».

Le moment du basculement est décidé **côté serveur**, pas par le modèle :
intention explicite ("on commence comment", "devis") ou montant chiffré →
formulaire immédiat ; sinon un juge tranche. Le modèle omettait le marqueur
`[[SHOW_CONTACT_FORM]]` presque à chaque fois, et aucune demande ne partait.

**Activation formsubmit — à faire une fois.** Un mail « Activate Form » a été
envoyé à `2395635cegep@gmail.com`. Tant que le lien n'est pas cliqué,
`/api/lead` répond 502 et le visiteur voit « L'envoi a échoué ». Vérifier
ensuite avec :

```bash
curl -s -X POST https://nadhemhsini.pages.dev/api/lead \
  -H 'content-type: application/json' \
  -d '{"email":"toi@exemple.com","messages":[{"role":"user","content":"test"}]}'
```

Réponse attendue : `{"ok":true}`.

---

## 3. Brancher le domaine

Tableau de bord Cloudflare → Workers & Pages → `nadhemhsini` → Custom
domains → ajouter `nadhemhsini.online`.

Si le domaine n'est pas encore chez Cloudflare, l'ajouter d'abord comme zone
et basculer les serveurs de noms chez le registrar où tu l'as acheté.

`_headers` et `_redirects` sont lus automatiquement, rien à configurer.

---

## 4. Analytics — une valeur à renseigner

Créer une propriété sur analytics.google.com, récupérer l'identifiant de
mesure (`G-XXXXXXXXXX`), puis ligne 15 de `js/analytics.js` :

```js
var GA4_ID = 'G-XXXXXXXXXX';
```

Tant que c'est vide, **aucun script Google n'est chargé** et le bandeau de
consentement ne s'affiche pas. Une fois rempli, le bandeau apparaît et rien
n'est déposé avant un clic sur « Accepter » — Consent Mode v2, défauts en
`denied`, comme l'exigent la Loi 25 au Québec et le RGPD en France.

**Search Console** : ajouter la propriété `nadhemhsini.online` sur
search.google.com/search-console. La vérification par **enregistrement DNS
TXT** est la plus simple puisque le domaine sera déjà sur Cloudflare, et
elle évite de toucher au HTML. Soumettre ensuite le sitemap :

```
https://nadhemhsini.online/sitemap.xml
```

---

## 5. Vérifier après mise en ligne

- `https://nadhemhsini.online/robots.txt` et `/sitemap.xml` répondent.
- Une URL inexistante affiche bien la page 404 personnalisée.
- Le chat répond (il utilise `/api/chat`, même domaine).
- Les en-têtes de sécurité sur securityheaders.com.
- **PageSpeed Insights** : c'est le seul moyen d'obtenir les vrais LCP / INP
  / CLS. Tout a été mesuré en local jusqu'ici, ces trois indicateurs ne sont
  observables qu'en conditions réseau réelles.

### Tester la détection de langue

Elle repose sur le pays réel vu par Cloudflare, donc elle ne peut pas être
testée en local. Une fois en ligne :

```bash
curl -sI https://nadhemhsini.online/ -H 'Accept-Language: fr-FR' | grep -i set-cookie
curl -sI https://nadhemhsini.online/ -H 'Accept-Language: en-US' | grep -i set-cookie
```

Doit renvoyer `siteLang=fr` puis `siteLang=en`.

---

## Ce qui reste ouvert

- Les 3 pages `index`, `approach` et `legal` sont rédigées en anglais dans
  la source ; les 16 autres en français. La détection bascule l'habillage et
  ces 3 pages, mais le référencement bilingue complet (URLs distinctes +
  hreflang) suppose de traduire la source. Voir la note en fin de session.
- Le formulaire de contact passe par formsubmit.co vers
  `2395635cegep@gmail.com` — confirmé comme la bonne adresse.
