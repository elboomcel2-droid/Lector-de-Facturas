/**
 * @file ordenar.js
 * @description Permite acomodar las columnas (tarjetas del paso 2) arrastrándolas.
 * Funciona con mouse, pantalla táctil y teclado:
 *  - Mouse / dedo: arrastrar desde el nombre de la columna (el "asa" con puntitos).
 *  - Teclado: enfocar el nombre con Tab y usar las flechas ← → (o ↑ ↓).
 *
 * Cómo funciona el arrastre:
 *  1. Al presionar el asa se crea una copia de la tarjeta (el "fantasma") que
 *     sigue al puntero, y la tarjeta original queda como hueco punteado.
 *  2. Al pasar sobre otra tarjeta, el hueco se mueve a ese lugar (con animación).
 *  3. Al soltar, se guarda el nuevo orden y se redibuja todo con render().
 *
 * Se usan Pointer Events (no el drag & drop de HTML) porque funcionan igual
 * con mouse y con pantallas táctiles.
 *
 * Depende de: utilidades.js ($), campos.js (campos, ordenarCampos, moverCampo),
 *             app.js (render).
 */

/**
 * Datos del arrastre en curso, o null si no se está arrastrando.
 * @type {null | {
 *   key: string,              // columna que se arrastra
 *   id: number,               // pointerId (mouse o dedo que arrastra)
 *   tarjeta: HTMLElement,     // tarjeta original (se vuelve el hueco)
 *   fantasma: HTMLElement,    // copia que sigue al puntero
 *   dx: number, dy: number,   // distancia del puntero a la esquina de la tarjeta
 *   pausaHasta: number,       // evita mover otra vez mientras corre la animación
 *   x: number, y: number,     // última posición del puntero
 *   pendiente: number|null    // temporizador para revisar al terminar la animación
 * }}
 */
let arrastre = null;

/** Duración de la animación al reacomodar (ms). */
const DURACION_ANIMACION = 180;

/** Tarjetas de columnas en el orden en que están en pantalla (sin "Agregar columna"). */
const tarjetasColumnas = () => [...$("selectores").querySelectorAll(".selector[data-key]")];

/**
 * Anuncia un mensaje a lectores de pantalla.
 * @param {string} texto
 */
function anunciar(texto) {
  $("anuncio").textContent = texto;
}

/**
 * Ejecuta un cambio en el orden de las tarjetas y las anima desde su
 * posición anterior a la nueva (técnica FLIP: First, Last, Invert, Play).
 * @param {Function} cambiar - Función que mueve los elementos en el DOM.
 */
function animarCambio(cambiar) {
  const tarjetas = tarjetasColumnas();
  const antes = new Map(tarjetas.map((t) => [t, t.getBoundingClientRect()]));
  cambiar();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  tarjetas.forEach((t) => {
    const a = antes.get(t);
    const d = t.getBoundingClientRect();
    const dx = a.left - d.left;
    const dy = a.top - d.top;
    if (!dx && !dy) return;
    t.style.transition = "none";
    t.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      t.style.transition = `transform ${DURACION_ANIMACION}ms ease`;
      t.style.transform = "";
    });
  });
}

/* =========================================================
   ARRASTRAR CON MOUSE O DEDO
   ========================================================= */

/** 1. Presionar el asa: empieza el arrastre. */
$("selectores").addEventListener("pointerdown", (e) => {
  const asa = e.target.closest("[data-asa]");
  if (!asa || e.button > 0 || arrastre) return; // solo botón principal o dedo
  e.preventDefault();

  const tarjeta = asa.closest(".selector");
  const r = tarjeta.getBoundingClientRect();

  // Copia que sigue al puntero
  const fantasma = tarjeta.cloneNode(true);
  fantasma.classList.add("fantasma");
  fantasma.removeAttribute("data-key");
  Object.assign(fantasma.style, {
    width: r.width + "px", height: r.height + "px",
    left: r.left + "px", top: r.top + "px",
  });
  document.body.appendChild(fantasma);

  tarjeta.classList.add("hueco");
  document.body.classList.add("arrastrando");

  arrastre = {
    key: asa.dataset.asa, id: e.pointerId, tarjeta, fantasma,
    dx: e.clientX - r.left, dy: e.clientY - r.top, pausaHasta: 0,
    x: e.clientX, y: e.clientY, pendiente: null,
  };

  // La captura se pone en el contenedor (que no se mueve) para seguir
  // recibiendo el movimiento aunque el puntero salga de la tarjeta.
  $("selectores").setPointerCapture(e.pointerId);
});

/**
 * Coloca el hueco en el lugar de la tarjeta que está bajo el puntero.
 * @param {number} x - Posición del puntero (clientX).
 * @param {number} y - Posición del puntero (clientY).
 * @param {boolean} [animar=true] - Animar el reacomodo.
 */
function colocarHueco(x, y, animar = true) {
  const { tarjeta } = arrastre;
  const bajo = document.elementFromPoint(x, y)?.closest(".selector[data-key]");
  if (!bajo || bajo === tarjeta) return;

  // Si la tarjeta viene de atrás, se coloca antes; si viene de adelante, después
  const tarjetas = tarjetasColumnas();
  const vieneDeAtras = tarjetas.indexOf(tarjeta) > tarjetas.indexOf(bajo);
  const mover = () => bajo.parentNode.insertBefore(tarjeta, vieneDeAtras ? bajo : bajo.nextSibling);

  if (!animar) return mover();
  animarCambio(mover);
  arrastre.pausaHasta = performance.now() + DURACION_ANIMACION;
}

/** 2. Mover: el fantasma sigue al puntero y el hueco cambia de lugar. */
$("selectores").addEventListener("pointermove", (e) => {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  arrastre.x = e.clientX;
  arrastre.y = e.clientY;

  arrastre.fantasma.style.left = e.clientX - arrastre.dx + "px";
  arrastre.fantasma.style.top = e.clientY - arrastre.dy + "px";

  const espera = arrastre.pausaHasta - performance.now();
  if (espera > 0) {
    // Mientras corre la animación no se reacomoda; al terminar se revisa
    // la última posición del puntero (por si ya no se mueve).
    if (!arrastre.pendiente) {
      arrastre.pendiente = setTimeout(() => {
        if (!arrastre) return;
        arrastre.pendiente = null;
        colocarHueco(arrastre.x, arrastre.y);
      }, espera);
    }
    return;
  }
  colocarHueco(e.clientX, e.clientY);
});

/** 3. Soltar: se ubica el hueco en el lugar final, se guarda el orden y se redibuja. */
function soltar(e) {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  const { key, fantasma } = arrastre;

  clearTimeout(arrastre.pendiente);
  if (e.type === "pointerup") colocarHueco(e.clientX, e.clientY, false);

  fantasma.remove();
  document.body.classList.remove("arrastrando");
  arrastre = null;

  const ordenAntes = campos.map((c) => c.key).join();
  ordenarCampos(tarjetasColumnas().map((t) => t.dataset.key));
  render();

  if (campos.map((c) => c.key).join() !== ordenAntes) {
    const pos = campos.findIndex((c) => c.key === key);
    anunciar(`${campos[pos].label} en la posición ${pos + 1} de ${campos.length}`);
  }
}
$("selectores").addEventListener("pointerup", soltar);
$("selectores").addEventListener("pointercancel", soltar);

/* =========================================================
   ACOMODAR CON TECLADO
   ========================================================= */

$("selectores").addEventListener("keydown", (e) => {
  const asa = e.target.closest("[data-asa]");
  if (!asa) return;
  const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!delta) return;
  e.preventDefault();

  const key = asa.dataset.asa;
  const pos = moverCampo(key, delta);
  render();
  document.querySelector(`[data-asa="${key}"]`)?.focus(); // conservar el foco para seguir moviendo
  anunciar(`${campos[pos].label} en la posición ${pos + 1} de ${campos.length}`);
});
