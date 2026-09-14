/**
 * @file plantilla.js
 * @description Exportación con el formato de la plantilla "2026"
 * (Partidas de compra) que usa el sistema de El Boom Tractopartes.
 *
 * Para cambiar la plantilla solo hay que editar el arreglo PLANTILLA de abajo:
 * cada renglón es una columna del Excel, en el orden en que debe salir.
 *
 * Depende de: utilidades.js (num), cfdi.js (valorDe, precioDe), xlsx.js.
 * Lo usa: app.js.
 */

/** Nombre de la pestaña del Excel, igual que en la plantilla. */
const PLANTILLA_HOJA = "Partidas de compra";

/**
 * Columnas de la plantilla, en orden.
 * @typedef {Object} ColumnaPlantilla
 * @property {string}   titulo - Encabezado exacto de la plantilla.
 * @property {number}   ancho  - Ancho de la columna en Excel.
 * @property {Function} valor  - Recibe (factura, fila) y devuelve el texto de la celda.
 */

/** Texto del código del artículo (la columna que el usuario eligió como Código). */
const textoCodigo = (f, fila) => (f.mapa.codigo ? fila[f.mapa.codigo] ?? "" : "");

/**
 * Texto de la descripción (la columna que el usuario eligió como Descripción).
 * No se usa en la plantilla actual; queda listo por si se vuelve a necesitar
 * una columna de descripción o comentarios.
 */
const textoDescripcion = (f, fila) => (f.mapa.descripcion ? fila[f.mapa.descripcion] ?? "" : "");

/** Número con 2 decimales y punto decimal, o "" si no es número. */
const dec2 = (n) => (n == null ? "" : n.toFixed(2));

/**
 * Columnas de la plantilla "2026" (Partidas de compra), en orden.
 * Para agregar una columna se agrega su entrada aquí; el encabezado,
 * el ancho y el orden del Excel salen de este arreglo.
 * @type {ColumnaPlantilla[]}
 */
const PLANTILLA = [
  { titulo: "Artículo", ancho: 24.57, valor: textoCodigo },
  // Cantidad: sin ceros de más (30, no 30.000000)
  { titulo: "Cantidad", ancho: 43.57, valor: (f, fila) => {
      const c = num(fila.Cantidad);
      return c == null ? "" : String(c);
    } },
  // Costo: precio unitario. Respeta la casilla "restar el descuento al precio unitario".
  { titulo: "Costo",    ancho: 10.57, valor: (f, fila) => dec2(precioDe(f, fila)) },
];

/**
 * Genera y descarga el Excel con el formato de la plantilla.
 * Incluye las partidas de TODAS las facturas cargadas.
 * @param {Factura[]} facturas
 * @param {string} nombreArchivo - Sin extensión.
 */
function descargarPlantilla(facturas, nombreArchivo) {
  // La plantilla no tiene columna de descuento: si la factura trae descuento
  // y no está marcada la casilla, el Costo saldría sin descontar.
  const sinDescontar = facturas.filter((f) => f.descTotal > 0 && !f.restarDesc);
  if (sinDescontar.length) {
    const nombres = sinDescontar.map((f) => f.proveedor).join(", ");
    if (!confirm(
      `El Costo saldrá SIN el descuento de: ${nombres}.\n\n` +
      `La plantilla no tiene columna de descuento. Para que el Costo lo incluya, ` +
      `marca la casilla "Restar el descuento de cada partida al precio unitario" en el paso 2.\n\n` +
      `¿Descargar así?`
    )) return;
  }

  const filas = facturas.flatMap((f) => f.filas.map((fila) => PLANTILLA.map((c) => c.valor(f, fila))));

  const blob = crearXlsx({
    hoja: PLANTILLA_HOJA,
    encabezados: PLANTILLA.map((c) => c.titulo),
    anchos: PLANTILLA.map((c) => c.ancho),
    filas,
  });

  descargarBlob(blob, nombreArchivo + ".xlsx");
}
