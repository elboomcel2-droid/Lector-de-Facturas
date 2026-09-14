/**
 * @file exportar.js
 * @description Junta las partidas de todas las facturas en una sola lista,
 * les da formato y las exporta (copiar para Excel y descargar CSV).
 *
 * Depende de: utilidades.js (fmt), campos.js (campos), cfdi.js (valorDe).
 * Lo usa: app.js.
 */

/**
 * Renglón del resultado final.
 * @typedef {Object} Renglon
 * @property {string}  proveedor - Nombre del proveedor de la factura.
 * @property {string}  folio     - Serie y folio de la factura.
 * @property {Valor[]} valores   - Un valor por cada columna activa, en el mismo orden que `campos`.
 */

/**
 * Lista plana con las partidas de TODAS las facturas cargadas,
 * con los valores de las columnas activas.
 * @param {Factura[]} facturas
 * @returns {Renglon[]}
 */
function armarResultado(facturas) {
  return facturas.flatMap((f) =>
    f.filas.map((fila) => ({
      proveedor: f.proveedor,
      folio: f.folio,
      valores: campos.map((c) => valorDe(f, fila, c)),
    }))
  );
}

/**
 * Formato para MOSTRAR en pantalla (con separador de miles).
 * @param {Campo} campo
 * @param {Valor} v
 * @returns {string} Ej. "1,234.50", "5.00 %", "30".
 */
function valorPantalla(campo, v) {
  if (campo.tipo === "texto" || v.numero == null) return v.texto;
  if (campo.tipo === "dinero") return fmt(v.numero);
  if (campo.tipo === "porcentaje") return fmt(v.numero) + " %";
  return v.numero.toLocaleString("es-MX", { maximumFractionDigits: 4 });
}

/**
 * Formato para EXPORTAR: sin separador de miles para que Excel lo tome como número.
 * Los porcentajes salen con "%" para que Excel los reconozca como porcentaje.
 * @param {Campo} campo
 * @param {Valor} v
 * @returns {string} Ej. "1234.50", "5.00%", "30".
 */
function valorExportar(campo, v) {
  if (campo.tipo === "texto" || v.numero == null) return v.texto;
  if (campo.tipo === "dinero") return v.numero.toFixed(2);
  if (campo.tipo === "porcentaje") return v.numero.toFixed(2) + "%";
  return String(v.numero);
}

/**
 * Encabezados de la exportación.
 * @param {boolean} conExtra - true para incluir Proveedor y Folio al inicio.
 * @returns {string[]}
 */
const encabezados = (conExtra) => [
  ...(conExtra ? ["Proveedor", "Folio"] : []),
  ...campos.map((c) => c.label),
];

/**
 * Valores de un renglón listos para exportar.
 * @param {Renglon} r
 * @param {boolean} conExtra - true para incluir Proveedor y Folio al inicio.
 * @returns {string[]}
 */
const valoresFila = (r, conExtra) => [
  ...(conExtra ? [r.proveedor, r.folio] : []),
  ...campos.map((c, i) => valorExportar(c, r.valores[i])),
];

/**
 * Copia el resultado al portapapeles separado por tabuladores,
 * el formato que Excel pega directo en celdas.
 * @param {Renglon[]} filas
 * @param {boolean} conExtra
 * @returns {Promise<void>}
 */
async function copiarParaExcel(filas, conExtra) {
  // Tabs o saltos dentro de un valor romperían las celdas de Excel
  const limpiar = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  const texto = [encabezados(conExtra), ...filas.map((r) => valoresFila(r, conExtra))]
    .map((fila) => fila.map(limpiar).join("\t"))
    .join("\n");

  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    // Respaldo para navegadores o contextos que bloquean el portapapeles
    const ta = document.createElement("textarea");
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/**
 * Descarga el resultado como CSV. Incluye BOM (\uFEFF) para que Excel
 * muestre bien los acentos y la ñ.
 * @param {Renglon[]} filas
 * @param {boolean} conExtra
 * @param {string} nombreArchivo - Nombre sin extensión.
 */
function descargarCSV(filas, conExtra, nombreArchivo) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`; // entre comillas, escapando comillas internas
  const csv = [encabezados(conExtra), ...filas.map((r) => valoresFila(r, conExtra))]
    .map((fila) => fila.map(q).join(","))
    .join("\r\n");

  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
