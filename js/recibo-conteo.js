/**
 * @file recibo-conteo.js
 * @description Motor del conteo de mercancía recibida.
 *
 * Una **revisión** puede tener varias facturas: pasa cuando un proveedor
 * manda dos facturas del mismo pedido, o cuando en el mismo envío de
 * paquetería llega mercancía de dos proveedores distintos.
 *
 * Guarda qué partidas trae cada factura, cuántas piezas se han contado
 * y qué código de barras corresponde a cada artículo.
 * No toca la pantalla (de eso se encarga recibo-app.js).
 *
 * Depende de: utilidades.js (num), cfdi.js (leerCFDI).
 */

/** Prefijo de localStorage para las revisiones. */
const CLAVE_CONTEO = "recibo:conteo:";

/** Prefijo de localStorage para las equivalencias de códigos por proveedor. */
const CLAVE_ALIAS = "recibo:alias:";

/**
 * Revisión en curso: una o varias facturas que se están contando juntas.
 * @typedef {Object} Sesion
 * @property {string} id            - Identificador (el UUID de la primera factura).
 * @property {string} inicio        - Cuándo se empezó a contar (ISO).
 * @property {FacturaConteo[]} facturas - Facturas incluidas en la revisión.
 * @property {Object} sobrantes     - Códigos que no están en ninguna factura: { codigo: { piezas, nota } }.
 */

/**
 * Factura dentro de una revisión.
 * @typedef {Object} FacturaConteo
 * @property {string} uuid        - Folio fiscal.
 * @property {string} proveedor   - Nombre del emisor.
 * @property {string} rfc         - RFC del emisor (llave de las equivalencias).
 * @property {string} folio       - Serie y folio.
 * @property {string} fecha       - Fecha de la factura.
 * @property {string[]} columnas  - Columnas (atributos) que trae el XML.
 * @property {Object[]} filas     - Renglones del XML tal cual, para poder recalcular.
 * @property {Object} mapa        - Columna del XML elegida para código, descripción y cantidad.
 * @property {Partida[]} partidas - Artículos a recibir.
 */

/**
 * Artículo de una factura.
 * @typedef {Object} Partida
 * @property {string} codigo      - Código del proveedor.
 * @property {string} descripcion - Descripción del proveedor.
 * @property {number} esperada    - Piezas que dice la factura.
 * @property {number} contada     - Piezas contadas hasta ahora.
 * @property {string} nota        - Nota del revisor (por ejemplo por qué faltó).
 */

/** Revisión abierta, o null si no hay ninguna. @type {Sesion|null} */
let sesion = null;

/* =========================================================
   CREAR Y GUARDAR
   ========================================================= */

/**
 * Datos que la revisión necesita de cada partida, con las columnas del XML
 * que se buscan por defecto. El usuario puede cambiarlas al cargar la factura,
 * porque no todos los proveedores acomodan igual su CFDI.
 */
const CAMPOS_RECIBO = [
  { key: "codigo",      label: "Código",      def: ["NoIdentificacion"], color: "#FFCE00" },
  { key: "descripcion", label: "Descripción", def: ["Descripcion"],      color: "#7FA7C4" },
  { key: "cantidad",    label: "Cantidad",    def: ["Cantidad"],         color: "#C98BD9" },
];

/**
 * Columnas propuestas para una factura: primero lo que se guardó de ese
 * proveedor, si no las de por defecto.
 * @param {Factura} factura - Resultado de leerCFDI().
 * @returns {{codigo: string, descripcion: string, cantidad: string}}
 */
function columnasPropuestas(factura) {
  const guardado = cargarMapa(factura.rfc);
  const mapa = {};
  CAMPOS_RECIBO.forEach((c) => (mapa[c.key] = columnaInicial(factura.columnas, c, guardado)));
  return mapa;
}

/**
 * Guarda las columnas elegidas para un proveedor, sin borrar lo que el
 * lector de facturas haya guardado de él.
 * @param {string} rfc
 * @param {Object} mapa
 */
function guardarColumnas(rfc, mapa) {
  try {
    const previo = cargarMapa(rfc) || {};
    localStorage.setItem("lectorxml:" + rfc,
      JSON.stringify({ ...previo, mapa: { ...(previo.mapa || {}), ...mapa } }));
  } catch (e) {}
}

/**
 * Convierte una factura leída del XML al formato del conteo.
 * Se queda con las columnas y los renglones del XML para poder volver a
 * elegir las columnas después sin tener que cargar el archivo otra vez.
 * @param {Factura} factura - Resultado de leerCFDI().
 * @param {Object} [mapa] - Columnas elegidas; si no se da, las propuestas.
 * @returns {FacturaConteo}
 */
function aFacturaConteo(factura, mapa) {
  const f = {
    uuid: factura.uuid,
    proveedor: factura.proveedor,
    rfc: factura.rfc,
    folio: factura.folio,
    fecha: factura.fecha,
    columnas: factura.columnas,
    filas: factura.filas,
    mapa: mapa || columnasPropuestas(factura),
    partidas: [],
  };
  aplicarColumnas(f, f.mapa);
  return f;
}

/**
 * Vuelve a armar las partidas de una factura con las columnas indicadas.
 * Conserva lo que ya se había contado y las notas, porque cada partida
 * sigue siendo el mismo renglón del XML.
 * @param {FacturaConteo} f
 * @param {Object} mapa - { codigo, descripcion, cantidad }
 */
function aplicarColumnas(f, mapa) {
  f.mapa = mapa;
  f.partidas = f.filas.map((fila, i) => {
    const previa = f.partidas[i] || { contada: 0, nota: "" };
    return {
      codigo: mapa.codigo ? fila[mapa.codigo] ?? "" : "",
      descripcion: mapa.descripcion ? fila[mapa.descripcion] ?? "" : "",
      esperada: (mapa.cantidad ? num(fila[mapa.cantidad]) : null) ?? 0,
      contada: previa.contada,
      nota: previa.nota,
    };
  });
}

/**
 * Abre una revisión nueva con una factura.
 * Si esa factura ya se había empezado a contar, recupera el avance.
 * @param {Factura} factura
 * @param {Object} [mapa] - Columnas elegidas.
 * @returns {Sesion}
 */
function crearSesion(factura, mapa) {
  const guardada = cargarSesion(factura.uuid);
  if (guardada) return guardada;

  return {
    id: factura.uuid,
    inicio: new Date().toISOString(),
    facturas: [aFacturaConteo(factura, mapa)],
    sobrantes: {},
  };
}

/**
 * Agrega otra factura a la revisión abierta.
 * @param {Factura} factura
 * @param {Object} [mapa] - Columnas elegidas.
 * @returns {{ok: boolean, motivo?: string}} motivo dice por qué no se pudo.
 */
function agregarFactura(factura, mapa) {
  if (sesion.facturas.some((f) => f.uuid === factura.uuid)) {
    return { ok: false, motivo: "esa factura ya está en la revisión" };
  }
  sesion.facturas.push(aFacturaConteo(factura, mapa));
  guardarSesion();
  return { ok: true };
}

/**
 * Quita una factura de la revisión (con todo su conteo).
 * @param {string} uuid
 */
function quitarFactura(uuid) {
  sesion.facturas = sesion.facturas.filter((f) => f.uuid !== uuid);
  guardarSesion();
}

/** Guarda el avance de la revisión abierta. */
function guardarSesion() {
  if (!sesion) return;
  try {
    localStorage.setItem(CLAVE_CONTEO + sesion.id, JSON.stringify(sesion));
  } catch (e) { /* sin almacenamiento: el conteo solo vive en esta pantalla */ }
}

/**
 * Recupera una revisión guardada.
 * @param {string} id
 * @returns {Sesion|null}
 */
function cargarSesion(id) {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_CONTEO + id));
    return s ? alDiaSesion(s) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Pone al día una revisión guardada con una versión anterior de la app:
 * la convierte al formato de varias facturas, agrega la nota de cada
 * artículo y acomoda los sobrantes.
 * @param {Object} s
 * @returns {Sesion}
 */
function alDiaSesion(s) {
  // Antes cada revisión era una sola factura, con las partidas en la raíz
  if (!s.facturas) {
    s = {
      id: s.uuid,
      inicio: s.inicio,
      sobrantes: s.sobrantes || {},
      facturas: [{
        uuid: s.uuid, proveedor: s.proveedor, rfc: s.rfc,
        folio: s.folio, fecha: s.fecha, partidas: s.partidas || [],
      }],
    };
  }

  s.facturas = s.facturas.map((f) => ({
    ...f,
    partidas: (f.partidas || []).map((p) => ({ nota: "", ...p })),
  }));

  const sobrantes = {};
  for (const [codigo, datos] of Object.entries(s.sobrantes || {})) {
    sobrantes[codigo] = typeof datos === "number" ? { piezas: datos, nota: "" } : datos;
  }
  s.sobrantes = sobrantes;
  return s;
}

/** Revisiones guardadas, de la más reciente a la más vieja. @returns {Sesion[]} */
function sesionesGuardadas() {
  const lista = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(CLAVE_CONTEO)) continue;
    try {
      lista.push(alDiaSesion(JSON.parse(localStorage.getItem(k))));
    } catch (e) { /* entrada dañada: se ignora */ }
  }
  return lista.sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
}

/** Borra una revisión guardada. */
function borrarSesion(id) {
  try { localStorage.removeItem(CLAVE_CONTEO + id); } catch (e) {}
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

/** Equivalencias aprendidas de un proveedor: { códigoDeBarras: códigoDeLaFactura }. */
function cargarAlias(rfc) {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ALIAS + rfc)) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Recuerda que un código de barras corresponde a un artículo.
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

/* =========================================================
   RECORRER LAS PARTIDAS DE TODAS LAS FACTURAS
   ========================================================= */

/**
 * Todas las partidas de la revisión, con la factura a la que pertenecen.
 * @returns {{fi: number, pi: number, f: FacturaConteo, p: Partida}[]}
 *   fi = número de factura, pi = número de partida dentro de esa factura.
 */
function partidasPlanas() {
  const salida = [];
  sesion.facturas.forEach((f, fi) =>
    f.partidas.forEach((p, pi) => salida.push({ fi, pi, f, p })));
  return salida;
}

/** Atajo para llegar a una partida. */
const partidaEn = (fi, pi) => sesion.facturas[fi].partidas[pi];

/* =========================================================
   BUSCAR A QUÉ PARTIDA CORRESPONDE UN CÓDIGO
   ========================================================= */

/**
 * Busca en TODAS las facturas de la revisión a qué artículos podría
 * corresponder un código escaneado. Prueba, en orden:
 *   1. Código igual al de la factura.
 *   2. Equivalencia guardada del proveedor de cada factura.
 *   3. Que uno contenga al otro, si es la única coincidencia.
 *
 * Puede devolver varias coincidencias: pasa cuando el mismo artículo viene
 * en dos facturas de la revisión. En ese caso la pantalla pregunta cuál es.
 *
 * @param {string} codigo - Lo que entregó la pistola o se tecleó.
 * @returns {{coincidencias: {fi: number, pi: number}[], motivo: string}}
 */
function buscarPartidas(codigo) {
  const n = normalizar(codigo);
  if (!n) return { coincidencias: [], motivo: "vacio" };

  const todas = partidasPlanas();

  // 1. Código igual
  const exactas = todas.filter(({ p }) => normalizar(p.codigo) === n);
  if (exactas.length) return { coincidencias: exactas.map(({ fi, pi }) => ({ fi, pi })), motivo: "codigo" };

  // 2. Equivalencia guardada (una por proveedor de la revisión)
  const porAlias = [];
  for (const { fi, pi, f, p } of todas) {
    const alias = cargarAlias(f.rfc)[n];
    if (alias && normalizar(p.codigo) === normalizar(alias)) porAlias.push({ fi, pi });
  }
  if (porAlias.length) return { coincidencias: porAlias, motivo: "equivalencia" };

  // 3. Coincidencia parcial: solo si es la única y el código tiene largo suficiente
  if (n.length >= 5) {
    const parciales = todas.filter(({ p }) => {
      const c = normalizar(p.codigo);
      return c.length >= 5 && (c.includes(n) || n.includes(c));
    });
    if (parciales.length === 1) {
      return { coincidencias: [{ fi: parciales[0].fi, pi: parciales[0].pi }], motivo: "parecido" };
    }
  }

  return { coincidencias: [], motivo: "desconocido" };
}

/**
 * Localiza a qué artículo corresponde un código escaneado.
 * No suma piezas: de eso se encarga la pantalla, que primero pregunta
 * cuántas piezas llegaron.
 * @param {string} codigo
 * @returns {{estado: "encontrado"|"varias"|"desconocido"|"vacio",
 *   coincidencias?: {fi:number,pi:number}[], motivo?: string}}
 */
function escanear(codigo) {
  const { coincidencias, motivo } = buscarPartidas(codigo);
  if (motivo === "vacio") return { estado: "vacio" };
  if (!coincidencias.length) return { estado: "desconocido", motivo };
  if (coincidencias.length > 1) return { estado: "varias", coincidencias, motivo };
  return { estado: "encontrado", coincidencias, motivo };
}

/* =========================================================
   CONTAR Y ANOTAR
   ========================================================= */

/**
 * Suma (o resta) piezas a una partida.
 * @param {number} fi - Número de factura.
 * @param {number} pi - Número de partida.
 * @param {number} [cantidad=1]
 * @returns {Partida} La partida ya actualizada.
 */
function contar(fi, pi, cantidad = 1) {
  const p = partidaEn(fi, pi);
  p.contada = Math.max(0, p.contada + cantidad);
  guardarSesion();
  return p;
}

/**
 * Registra un código que no está en ninguna factura de la revisión.
 * @param {string} codigo
 * @param {number} [cantidad=1]
 */
function contarSobrante(codigo, cantidad = 1) {
  const c = codigo.trim();
  const previo = sesion.sobrantes[c] || { piezas: 0, nota: "" };
  previo.piezas = Math.max(0, previo.piezas + cantidad);
  if (previo.piezas) sesion.sobrantes[c] = previo;
  else delete sesion.sobrantes[c];
  guardarSesion();
}

/**
 * Guarda la nota de un artículo de una factura.
 * @param {number} fi
 * @param {number} pi
 * @param {string} texto
 */
function anotarPartida(fi, pi, texto) {
  partidaEn(fi, pi).nota = texto.trim();
  guardarSesion();
}

/**
 * Guarda la nota de un código que no viene en ninguna factura.
 * @param {string} codigo
 * @param {string} texto
 */
function anotarSobrante(codigo, texto) {
  if (sesion.sobrantes[codigo]) {
    sesion.sobrantes[codigo].nota = texto.trim();
    guardarSesion();
  }
}

/* =========================================================
   RESUMEN
   ========================================================= */

/**
 * Totales de un conjunto de partidas.
 * @param {Partida[]} partidas
 * @returns {{piezasEsperadas:number, piezasContadas:number, completas:number,
 *   pendientes:number, faltantes:number, sobran:number, avance:number}}
 */
function totales(partidas) {
  const piezasEsperadas = partidas.reduce((s, x) => s + x.esperada, 0);
  const piezasContadas = partidas.reduce((s, x) => s + x.contada, 0);
  return {
    piezasEsperadas,
    piezasContadas,
    completas: partidas.filter((x) => x.contada === x.esperada).length,
    pendientes: partidas.filter((x) => x.contada < x.esperada).length,
    faltantes: partidas.reduce((s, x) => s + Math.max(0, x.esperada - x.contada), 0),
    sobran: partidas.reduce((s, x) => s + Math.max(0, x.contada - x.esperada), 0),
    avance: piezasEsperadas ? Math.min(100, (piezasContadas / piezasEsperadas) * 100) : 0,
  };
}

/** Totales de una factura. */
const totalesFactura = (f) => totales(f.partidas);

/** Totales de toda la revisión, incluyendo la mercancía no facturada. */
function resumen() {
  const t = totales(sesion.facturas.flatMap((f) => f.partidas));
  t.sobrantes = Object.values(sesion.sobrantes).reduce((s, x) => s + x.piezas, 0);
  return t;
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
