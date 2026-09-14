/**
 * @file pwa.js
 * @description Convierte la página en app instalable (PWA):
 *  - Registra el service worker (sw.js) para instalación y uso sin internet.
 *  - Muestra el botón "Instalar app" cuando el navegador lo permite.
 *
 * Importante: solo funciona si la app se abre desde un servidor http/https
 * (ej. GitHub Pages). Con doble clic (file://) la app funciona, pero no se instala.
 *
 * Depende de: utilidades.js ($).
 */

// Registrar el service worker solo en http/https
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("No se pudo registrar el service worker:", e));
  });
}

/**
 * Evento que Chrome/Edge disparan cuando la app se puede instalar.
 * Se guarda para lanzarlo cuando el usuario presione "Instalar app".
 * @type {Event|null}
 */
let avisoInstalar = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();          // evita el aviso automático del navegador
  avisoInstalar = e;
  $("btnInstalar").hidden = false;
});

$("btnInstalar").addEventListener("click", async () => {
  if (!avisoInstalar) return;
  avisoInstalar.prompt();      // muestra el diálogo de instalación
  await avisoInstalar.userChoice;
  avisoInstalar = null;
  $("btnInstalar").hidden = true;
});

// Ya instalada: ocultar el botón
window.addEventListener("appinstalled", () => ($("btnInstalar").hidden = true));
