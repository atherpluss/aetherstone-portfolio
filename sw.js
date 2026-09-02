// Aetherstone — Service Worker DESACTIVE (kill switch).
//
// Un Service Worker mettait en cache les fichiers du site, y compris la video
// d'intro. Or une video se lit par requetes Range (reponse 206 Partial
// Content) : mise en cache puis resservie, elle ne demarre plus. La video
// d'ouverture etait cassee a cause de ca.
//
// Ce fichier ne met plus rien en cache. Il se desinstalle lui-meme et efface
// tous les caches laisses par les versions precedentes, automatiquement, sans
// aucune action du visiteur. Ne pas supprimer ce fichier : les navigateurs qui
// ont encore l'ancien Service Worker doivent pouvoir le telecharger pour se
// nettoyer.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Efface tous les caches crees par les anciennes versions.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      // Se desinscrit definitivement.
      await self.registration.unregister();
      // Recharge les onglets ouverts pour qu'ils repartent sans Service Worker.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});

// Aucun handler 'fetch' : plus rien n'est intercepte, le reseau reprend la main.
