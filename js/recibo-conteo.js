/**
 * @file recibo-conteo.js
 * @description Motor del conteo de mercancía recibida.
 * Guarda qué partidas trae la factura, cuántas piezas se han contado
 * y qué código de barras corresponde a cada artículo.
 * No toca la pantalla (de eso se encarga recibo-app.js).
 *
 * Depende de: utilidades.js (num), cfdi.js (leerCFDI, precioDe).
 */

/** Prefijo de localStorage para el conteo de cada factura. */
const CLAVE_CONTEO = "recibo:conteo:";

/** Prefijo de localStorage para las equivalencias de códigos por proveedor. */
const CLAVE_ALIAS = "recibo:alias:";

/**
 * Recepción en curso.
 * @typedef {Object} Recepcion
 * @property {string} uuid        - Folio fiscal de la factura.
 * @property {string} proveedor   - Nombre del emisor.
 * @property {string} rfc         - RFC del emisor (llave de las equivalencias).
 * @property {string} folio       - Serie y folio.
 * @property {string} fecha       - Fecha de la factura.
 * @property {Partida[]} partidas - Artículos a recibir.
 * @property {Object} sobrantes   - Códigos escaneados que no están en la factura: { codigo: piezas }.
 * @property {string} inicio      - Cuándo se empezó a contar (ISO).
 */

/**
 * Artículo de la factura.
 * @typedef {Object} Partida
 * @property {string} codigo      - Código del proveedor.
 * @property {string} descripcion - Descripción del proveedor.
 * @property {number} esperada    - Piezas que dice la factura.
 * @property {number} contada     - Piezas contadas hasta ahora.
 */

/** Recepción abierta, o null si no hay ninguna. @type {Recepcion|null} */
let recepcion = null;

/* =========================================================
   CREAR Y GUARDAR
   ========================================================= */

/**
 * Convierte una factura leída del XML en una recepción lista para contar.
 * Si esa factura ya se había empezado a contar, recupera el avance.
 * @param {Factura} factura - Resultado de leerCFDI().
 * @returns {Recepcion}
 */
function crearRecepcion(factura) {
  const guardada = cargarConteo(factura.uuid);
  if (guardada) return guardada;

  return {
    uuid: factura.uuid,
    proveedor: factura.proveedor,
    rfc: factura.rfc,
    folio: factura.folio,
    fecha: factura.fecha,
    inicio: new Date().toISOString(),
    sobrantes: {},
    partidas: factura.filas.map((fila) => ({
      codigo: factura.mapa.codigo ? fila[factura.mapa.codigo] ?? "" : "",
      descripcion: factura.mapa.descripcion ? fila[factura.mapa.descripcion] ?? "" : "",
      esperada: num(fila.Cantidad) ?? 0,
      contada: 0,
    })),
  };
}

/** Guarda el avance de la recepción abierta. */
function guardarConteo() {
  if (!recepcion) return;
  try {
    localStorage.setItem(CLAVE_CONTEO + recepcion.uuid, JSON.stringify(recepcion));
  } catch (e) { /* sin almacenamiento: el conteo solo vive en esta pantalla */ }
}

/**
 * Recupera el avance guardado de una factura.
 * @param {string} uuid
 * @returns {Recepcion|null}
 */
function cargarConteo(uuid) {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CONTEO + uuid));
  } catch (e) {
    return null;
  }
}

/** Lista de recepciones guardadas, de la más reciente a la más vieja. */
function recepcionesGuardadas() {
  const lista = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(CLAVE_CONTEO)) continue;
    try {
      lista.push(JSON.parse(localStorage.getItem(k)));
    } catch (e) { /* entrada dañada: se ignora */ }
  }
  return lista.sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
}

/** Borra el conteo guardado de una factura. */
function borrarConteo(uuid) {
  try { localStorage.removeItem(CLAVE_CONTEO + uuid); } catch (e) {}
}

/* =========================================================
   EQUIVALENCIAS DE CÓDIGOS DE BARRAS
   ========================================================= */

/**
 * Deja un código comparable: sin espacios, guiones ni puntos, en mayúsculas.
 * Así "A170-70-18X" y "a170 70 18x" se consideran el mismo.
 * @param {string} c
 * @returns {string}
 */
const normalizar = (c) => String(c ?? "").toUpperCase().replace(/[\s\-._/]/g, "");

/** Equivalencias aprendidas para un proveedor: { códigoDeBarras: códigoDeLaFactura }. */
function cargarAlias(rfc) {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ALIAS + rfc)) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Recuerda que un código de barras corresponde a un artículo de la factura.
 * Queda guardado para las siguientes facturas del mismo proveedor.
 * @param {string} rfc
 * @param {string} codigoBarras
 * @param {string} codigoPartida
 */
function guardarAlias(rfc, codigoBarras, codigoPartida) {
  const alias = cargarAlias(rfc);
  alias[normalizar(codigoBarras)] = codigoPartida;
  try { localStorage.setItem(CLAVE_ALIAS + rfc, JSON.stringify(alias)); } catch (e) {}
}

/** Cuántas equivalencias hay guardadas de un proveedor. */
const cuentaAlias = (rfc) => Object.keys(cargarAlias(rfc)).length;

/* =========================================================
   BUSCAR A QUÉ PARTIDA CORRESPONDE UN CÓDIGO
   ========================================================= */

/**
 * Busca la partida que corresponde a un código escaneado.
 * Prueba, en orden:
 *   1. Código igual al de la factura.
 *   2. Equivalencia guardada de ese proveedor.
 *   3. Que uno contenga al otro y que sea la única coincidencia
 *      (por ejemplo el código de barras trae el código con un prefijo).
 *
 * @param {string} codigo - Lo que entregó la pistola o la cámara.
 * @returns {{indice: number, motivo: string}} indice -1 si no se encontró.
 */
function buscarPartida(codigo) {
  const n = normalizar(codigo);
  if (!n) return { indice: -1, motivo: "vacio" };

  const exacta = recepcion.partidas.findIndex((p) => normalizar(p.codigo) === n);
  if (exacta >= 0) return { indice: exacta, motivo: "codigo" };

  const alias = cargarAlias(recepcion.rfc)[n];
  if (alias) {
    const i = recepcion.partidas.findIndex((p) => normalizar(p.codigo) === normalizar(alias));
    if (i >= 0) return { indice: i, motivo: "equivalencia" };
  }

  // Coincidencia parcial: solo si es la única y el código tiene largo suficiente
  if (n.length >= 5) {
    const parciales = recepcion.partidas
      .map((p, i) => ({ i, c: normalizar(p.codigo) }))
      .filter(({ c }) => c.length >= 5 && (c.includes(n) || n.includes(c)));
    if (parciales.length === 1) return { indice: parciales[0].i, motivo: "parecido" };
  }

  return { indice: -1, motivo: "desconocido" };
}

/* =========================================================
   CONTAR
   ========================================================= */

/**
 * Suma (o resta) piezas a una partida.
 * @param {number} indice
 * @param {number} [cantidad=1]
 * @returns {Partida} La partida ya actualizada.
 */
function contar(indice, cantidad = 1) {
  const p = recepcion.partidas[indice];
  p.contada = Math.max(0, p.contada + cantidad);
  guardarConteo();
  return p;
}

/**
 * Registra un código que no está en la factura (mercancía de más o equivocada).
 * @param {string} codigo
 * @param {number} [cantidad=1]
 */
function contarSobrante(codigo, cantidad = 1) {
  const c = codigo.trim();
  recepcion.sobrantes[c] = Math.max(0, (recepcion.sobrantes[c] || 0) + cantidad);
  if (!recepcion.sobrantes[c]) delete recepcion.sobrantes[c];
  guardarConteo();
}

/**
 * Procesa un código escaneado.
 * @param {string} codigo
 * @returns {{estado: string, indice?: number, partida?: Partida, motivo?: string}}
 *   estado: "contado" (se sumó), "desconocido" (hay que decidir a qué artículo va)
 *   o "vacio".
 */
function escanear(codigo) {
  const { indice, motivo } = buscarPartida(codigo);
  if (motivo === "vacio") return { estado: "vacio" };
  if (indice < 0) return { estado: "desconocido", motivo };
  return { estado: "contado", indice, partida: contar(indice, 1), motivo };
}

/* =========================================================
   RESUMEN
   ========================================================= */

/**
 * Totales del conteo.
 * @returns {{piezasEsperadas: number, piezasContadas: number, completas: number,
 *   pendientes: number, faltantes: number, sobran: number, sobrantes: number,
 *   avance: number}}
 */
function resumen() {
  const p = recepcion.partidas;
  const piezasEsperadas = p.reduce((s, x) => s + x.esperada, 0);
  const piezasContadas = p.reduce((s, x) => s + x.contada, 0);
  return {
    piezasEsperadas,
    piezasContadas,
    completas: p.filter((x) => x.contada === x.esperada).length,
    pendientes: p.filter((x) => x.contada < x.esperada).length,
    faltantes: p.reduce((s, x) => s + Math.max(0, x.esperada - x.contada), 0),
    sobran: p.reduce((s, x) => s + Math.max(0, x.contada - x.esperada), 0),
    sobrantes: Object.values(recepcion.sobrantes).reduce((s, n) => s + n, 0),
    avance: piezasEsperadas ? Math.min(100, (piezasContadas / piezasEsperadas) * 100) : 0,
  };
}

/**
 * Estado de una partida, para pintarla de color.
 * @param {Partida} p
 * @returns {"pendiente"|"parcial"|"completa"|"sobra"}
 */
function estadoPartida(p) {
  if (p.contada === 0) return "pendiente";
  if (p.contada < p.esperada) return "parcial";
  if (p.contada > p.esperada) return "sobra";
  return "completa";
}
