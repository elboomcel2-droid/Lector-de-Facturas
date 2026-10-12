/**
 * @file recibo-escaner.js
 * @description Entrada de códigos de barras y avisos al operador.
 *
 * Dos formas de escanear:
 *  1. **Pistola de código de barras** (USB o Bluetooth). Estas pistolas se
 *     comportan como un teclado: "teclan" el código y dan Enter. No necesitan
 *     ningún programa ni permiso: basta con que el recuadro de escaneo tenga
 *     el cursor, y esta app se encarga de mantenerlo ahí.
 *  2. **Cámara del dispositivo**, usando el lector de códigos del navegador
 *     (BarcodeDetector). Funciona en Chrome de Android y de computadora.
 *     Safari del iPhone todavía no lo trae; ahí se usa la pistola o se teclea.
 *
 * Depende de: utilidades.js ($).
 * Lo usa: recibo-app.js.
 */

/* =========================================================
   AVISOS: SONIDO Y VIBRACIÓN
   ========================================================= */

/** Contexto de audio; se crea en el primer uso porque el navegador lo exige. */
let audio = null;

/**
 * Suena un tono corto. Sirve para saber si el escaneo entró sin ver la pantalla.
 * @param {"ok"|"error"|"aviso"} tipo
 */
function sonar(tipo = "ok") {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();

    const frecuencias = { ok: [880], aviso: [660, 660], error: [220, 180] };
    let t = audio.currentTime;

    for (const hz of frecuencias[tipo] || frecuencias.ok) {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.frequency.value = hz;
      osc.type = "square";
      vol.gain.setValueAtTime(0.06, t);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(vol).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.12);
      t += 0.14;
    }
  } catch (e) { /* sin audio: no pasa nada */ }
}

/**
 * Vibra el celular (en computadora no hace nada).
 * @param {number|number[]} patron - Milisegundos.
 */
function vibrar(patron) {
  try { navigator.vibrate?.(patron); } catch (e) {}
}

/** Aviso de escaneo correcto. */
const avisoOk = () => { sonar("ok"); vibrar(40); };

/** Aviso de código no reconocido. */
const avisoError = () => { sonar("error"); vibrar([80, 60, 80]); };

/* =========================================================
   PISTOLA DE ESCANEO (se comporta como teclado)
   ========================================================= */

/**
 * Conecta el recuadro de escaneo: cada Enter entrega el código leído.
 * También vuelve a poner el cursor en el recuadro si el usuario toca otra cosa,
 * para que la pistola nunca "escriba" en el lugar equivocado.
 *
 * @param {HTMLInputElement} campo - Recuadro donde entra el código.
 * @param {Function} alLeer - Recibe el código leído.
 */
function conectarPistola(campo, alLeer) {
  // En celular no se roba el cursor de entrada: abriría el teclado en pantalla
  // todo el tiempo. Se activa en cuanto entra el primer código, que es la señal
  // de que hay una pistola conectada (o de que el usuario quiere teclear ahí).
  let mantenerCursor = !esMovil();

  campo.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = campo.value.trim();
    campo.value = "";
    if (!codigo) return;
    mantenerCursor = true;
    alLeer(codigo);
  });

  // Regresa el cursor al recuadro si se pierde, para que la pistola nunca
  // "escriba" en el lugar equivocado. No lo hace si hay una ventana abierta
  // o si se está usando otro campo o botón.
  setInterval(() => {
    if (!mantenerCursor || campo.disabled) return;
    if (document.body.classList.contains("con-ventana")) return;

    const activo = document.activeElement;
    const ocupado = activo && ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(activo.tagName);
    // preventScroll es importante: sin él el navegador salta hasta el recuadro
    // cada vez que se toca un botón de la lista, y la página se va hasta arriba.
    if (!ocupado) campo.focus({ preventScroll: true });
  }, 900);
}

/** @returns {boolean} Si el dispositivo parece un celular o tableta. */
function esMovil() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
}
