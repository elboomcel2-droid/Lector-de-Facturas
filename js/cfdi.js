/**
 * @file cfdi.js
 * @description Lectura de facturas CFDI (XML del SAT, versiones 3.3 y 4.0),
 * cálculo de valores por partida y memoria de columnas por proveedor.
 * Este archivo NO toca la pantalla: solo recibe texto y devuelve datos.
 *
 * Depende de: utilidades.js (num), campos.js (campos, columnaInicial).
 * Lo usan: exportar.js y app.js.
 */

/**
 * Una partida (renglón) de la factura: todos los atributos del nodo
 * cfdi:Concepto, más NumeroPedimento si trae información aduanera.
 * @typedef {Object<string,string>} Fila
 * @example { NoIdentificacion: "P181028", Descripcion: "DONALDSON AIR FILTER", Cantidad: "30", ValorUnitario: "446.61", ... }
 */

/**
 * Factura ya leída y lista para usarse en la app.
 * @typedef {Object} Factura
 * @property {string}   id         - Id interno de la sesión (ej. "f1").
 * @property {string}   uuid       - Folio fiscal (UUID del timbre); sirve para no cargar la misma factura dos veces.
 * @property {string}   proveedor  - Nombre del emisor.
 * @property {string}   rfc        - RFC del emisor; es la llave para recordar columnas por proveedor.
 * @property {string}   folio      - Serie y folio (ej. "FYR 103812").
 * @property {string}   fecha      - Fecha de emisión AAAA-MM-DD.
 * @property {string}   tipo       - TipoDeComprobante: "I" ingreso (factura) o "E" egreso (nota de crédito).
 * @property {string}   moneda     - Moneda del comprobante (MXN, USD…).
 * @property {string[]} columnas   - Todos los atributos que aparecen en las partidas, en orden.
 * @property {Fila[]}   filas      - Las partidas.
 * @property {Object<string,string>} mapa - Para cada Campo.key, el atributo del XML elegido.
 * @property {number}   descTotal  - Suma de descuentos de todas las partidas.
 * @property {boolean}  restarDesc - Si el precio unitario se muestra ya con descuento.
 */

/**
 * Resultado de leer una columna en una partida.
 * @typedef {Object} Valor
 * @property {string}      texto  - Valor tal cual viene en el XML ("" en columnas calculadas).
 * @property {number|null} numero - Valor numérico (null en columnas de texto o si no es número).
 */

/** Contador para dar un id único a cada factura cargada en la sesión. */
let contadorFacturas = 0;

/**
 * Tipos de CFDI que NO son facturas de compra: se rechazan con un mensaje claro
 * porque sus partidas no son mercancía (ver leerCFDI).
 * Los que sí se aceptan son "I" (ingreso/factura) y "E" (egreso/nota de crédito).
 */
const TIPOS_RECHAZADOS = {
  P: "es un complemento de pago (REP), no una factura. Sus partidas no son mercancía",
  T: "es un comprobante de traslado, no una factura de compra",
  N: "es un recibo de nómina, no una factura de compra",
};

/** Prefijo de localStorage para la configuración de cada proveedor: "lectorxml:RFC". */
const PREFIJO_PROVEEDOR = "lectorxml:";

/* =========================================================
   MEMORIA DE COLUMNAS POR PROVEEDOR
   ========================================================= */

/**
 * Guarda qué atributo del XML se eligió para cada columna, y si se resta
 * el descuento, para el proveedor de esta factura. Se COMBINA con lo que ya
 * había guardado, para no perder la configuración de columnas que el usuario
 * quitó temporalmente.
 * @param {Factura} factura
 */
function guardarMapa(factura) {
  try {
    const previo = cargarMapa(factura.rfc)?.mapa || {};
    localStorage.setItem(
      PREFIJO_PROVEEDOR + factura.rfc,
      JSON.stringify({ mapa: { ...previo, ...factura.mapa }, restarDesc: factura.restarDesc })
    );
  } catch (e) { /* sin almacenamiento disponible: se ignora */ }
}

/**
 * Lee la configuración guardada de un proveedor.
 * @param {string} rfc - RFC del proveedor.
 * @returns {{mapa: Object<string,string>, restarDesc: boolean}|null}
 */
function cargarMapa(rfc) {
  try {
    return JSON.parse(localStorage.getItem(PREFIJO_PROVEEDOR + rfc));
  } catch (e) {
    return null;
  }
}

/* =========================================================
   LECTURA DEL XML
   ========================================================= */

/**
 * Busca el primer nodo con ese nombre sin importar el prefijo
 * (cfdi:, tfd:, etc.). Así funciona con CFDI 3.3 y 4.0.
 * @param {Document} doc
 * @param {string} tag - Nombre del nodo sin prefijo (ej. "Emisor").
 * @returns {Element|undefined}
 */
const primerNodo = (doc, tag) => doc.getElementsByTagNameNS("*", tag)[0];

/**
 * Lee el contenido de un CFDI y lo convierte en una Factura.
 *
 * Pasos:
 *  1. Valida que sea XML y que el nodo raíz sea "Comprobante".
 *  2. Toma los nodos Concepto (partidas) y junta todos sus atributos.
 *  3. Agrega NumeroPedimento si la partida trae InformacionAduanera.
 *  4. Lee emisor, folio, fecha y UUID.
 *  5. Asigna columnas: lo guardado del proveedor o las de por defecto.
 *
 * @param {string} texto - Contenido completo del archivo XML.
 * @param {string} nombreArchivo - Nombre del archivo (respaldo si no hay UUID).
 * @returns {Factura}
 * @throws {Error} Con mensaje claro si el archivo no es un CFDI válido o no tiene partidas.
 */
function leerCFDI(texto, nombreArchivo) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("el archivo no es un XML válido");

  const comprobante = doc.documentElement;
  if (comprobante.localName !== "Comprobante") throw new Error("no es un CFDI");

  // Solo facturas (I) y notas de crédito (E) traen partidas de mercancía.
  // Un complemento de pago, por ejemplo, trae una sola partida "Pago" con valor 0.
  const tipo = comprobante.getAttribute("TipoDeComprobante") || "I";
  if (TIPOS_RECHAZADOS[tipo]) throw new Error(TIPOS_RECHAZADOS[tipo]);

  // Solo los Concepto hijos directos de Conceptos (evita nodos de complementos)
  const nodoConceptos = primerNodo(doc, "Conceptos");
  const conceptos = nodoConceptos ? [...nodoConceptos.children].filter((n) => n.localName === "Concepto") : [];
  if (!conceptos.length) throw new Error("no tiene partidas");

  // Columnas = unión de todos los atributos de las partidas, en el orden en que aparecen
  const columnas = [];
  const agregarColumna = (c) => { if (!columnas.includes(c)) columnas.push(c); };

  const filas = conceptos.map((concepto) => {
    const fila = {};
    for (const atributo of concepto.attributes) {
      fila[atributo.name] = atributo.value;
      agregarColumna(atributo.name);
    }
    // El pedimento viene en un nodo hijo; puede haber varios por partida
    const pedimentos = [...concepto.getElementsByTagNameNS("*", "InformacionAduanera")]
      .map((n) => n.getAttribute("NumeroPedimento"))
      .filter(Boolean);
    if (pedimentos.length) {
      fila.NumeroPedimento = pedimentos.join(", ");
      agregarColumna("NumeroPedimento");
    }
    // Tasa de IVA de la partida (se usa en la plantilla de Excel)
    const tasa = tasaIvaDe(concepto);
    if (tasa != null) fila.TasaIva = String(tasa);
    return fila;
  });

  const emisor = primerNodo(doc, "Emisor");
  const timbre = primerNodo(doc, "TimbreFiscalDigital");
  const rfc = emisor?.getAttribute("Rfc") || "SIN-RFC";

  // Columna del XML para cada columna activa
  const guardado = cargarMapa(rfc);
  const mapa = {};
  campos.forEach((c) => (mapa[c.key] = columnaInicial(columnas, c, guardado)));

  const descTotal = filas.reduce((suma, f) => suma + (num(f.Descuento) || 0), 0);

  return {
    id: "f" + ++contadorFacturas,
    uuid: timbre?.getAttribute("UUID") || nombreArchivo,
    proveedor: emisor?.getAttribute("Nombre") || "Proveedor sin nombre",
    rfc,
    folio: [comprobante.getAttribute("Serie"), comprobante.getAttribute("Folio")].filter(Boolean).join(" "),
    fecha: (comprobante.getAttribute("Fecha") || "").slice(0, 10),
    tipo,
    moneda: comprobante.getAttribute("Moneda") || "",
    columnas,
    filas,
    mapa,
    descTotal,
    restarDesc: descTotal > 0 && !!guardado?.restarDesc,
  };
}

/* =========================================================
   VALORES POR PARTIDA
   ========================================================= */

/**
 * Precio unitario de una partida.
 * Si "restar descuento" está activo y el precio viene de ValorUnitario:
 *   precio = (Importe − Descuento) ÷ Cantidad
 * En otro caso, el valor de la columna elegida.
 * @param {Factura} factura
 * @param {Fila} fila
 * @returns {number|null}
 */
function precioDe(factura, fila) {
  if (factura.restarDesc && factura.mapa.precio === "ValorUnitario") {
    const cantidad = num(fila.Cantidad);
    const importe = num(fila.Importe);
    if (cantidad && importe != null) return (importe - (num(fila.Descuento) || 0)) / cantidad;
  }
  return num(fila[factura.mapa.precio]);
}

/**
 * Valor de una columna en una partida. Es el punto único por donde pasan
 * todas las columnas antes de mostrarse o exportarse.
 * @param {Factura} factura
 * @param {Fila} fila
 * @param {Campo} campo
 * @returns {Valor}
 */
function valorDe(factura, fila, campo) {
  if (campo.calculado) return valorCalculado(fila, campo);
  const col = factura.mapa[campo.key];
  if (!col) return { texto: "", numero: null };
  const texto = fila[col] ?? "";
  if (campo.tipo === "texto") return { texto, numero: null };
  const numero = campo.key === "precio" ? precioDe(factura, fila) : num(texto);
  return { texto, numero };
}

/**
 * Columnas especiales que se calculan con otros datos de la partida.
 * Para agregar una nueva: defínela en CATALOGO con `calculado: true`
 * y agrega aquí su fórmula con un `if (campo.key === "...")`.
 * @param {Fila} fila
 * @param {Campo} campo
 * @returns {Valor}
 */
function valorCalculado(fila, campo) {
  // Descuento % = Descuento ÷ Importe × 100
  if (campo.key === "descuentoPct") {
    const importe = num(fila.Importe);
    if (!importe) return { texto: "", numero: null };
    const descuento = num(fila.Descuento) || 0;
    return { texto: "", numero: (descuento / importe) * 100 };
  }
  return { texto: "", numero: null };
}

/**
 * Tasa de IVA de una partida, leída del nodo Traslado del concepto.
 * @param {Element} concepto - Nodo cfdi:Concepto.
 * @returns {number|null} Porcentaje (ej. 16), o null si la partida no tiene traslados.
 */
function tasaIvaDe(concepto) {
  const traslado = [...concepto.getElementsByTagNameNS("*", "Traslado")]
    .find((t) => t.getAttribute("Impuesto") === "002"); // 002 = IVA
  const tasa = num(traslado?.getAttribute("TasaOCuota"));
  return tasa == null ? null : tasa * 100; // el XML la trae como fracción (0.160000)
}
