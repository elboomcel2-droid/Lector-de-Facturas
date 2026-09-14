/**
 * @file sw.js (service worker)
 * @description Permite instalar la app y usarla sin internet.
 *
 * Estrategia "primero red":
 *  - Con internet: siempre descarga la versión más nueva y actualiza la copia.
 *  - Sin internet: usa la copia guardada.
 *
 * Al actualizar el proyecto:
 *  - Si agregas un archivo nuevo, súmalo a ARCHIVOS.
 *  - Cambia VERSION (ej. "lector-xml-v2") para limpiar copias viejas.
 */

/** Nombre de la copia (caché). Cambiarlo borra las copias anteriores. */
const VERSION = "lector-xml-v5";

/** Archivos que se guardan al instalar para funcionar sin internet. */
const ARCHIVOS = [
  "./",
  "./index.html",
  "./recibo.html",
  "./manifest.webmanifest",
  "./css/estilos.css",
  "./css/recibo.css",
  "./js/utilidades.js",
  "./js/campos.js",
  "./js/cfdi.js",
  "./js/xlsx.js",
  "./js/plantilla.js",
  "./js/exportar.js",
  "./js/app.js",
  "./js/ordenar.js",
  "./js/recibo-conteo.js",
  "./js/recibo-escaner.js",
  "./js/recibo-app.js",
  "./js/pwa.js",
  "./img/logo-cabecera.png",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/favicon.png",
];

// Al instalar: guardar todos los archivos de la app
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

// Al activar: borrar copias de versiones anteriores
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cada petición: red primero, copia guardada si no hay internet
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok || resp.type === "opaque") {
          const copia = resp.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
