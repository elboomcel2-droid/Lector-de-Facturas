/**
 * @file recibo-reporte.js
 * @description Reportes de la revisión de mercancía:
 *  - PDF con la estructura de la factura, **una sección por factura**
 *    y cada artículo marcado por color.
 *  - Excel con las mismas columnas más el proveedor, la factura y la nota.
 *
 * Colores del PDF:
 *  - Verde: llegó completo.
 *  - Azul:  hay que revisar (llegó incompleto, llegó de más o no viene en la factura).
 *  - Rojo:  no llegó nada.
 *
 * Depende de: pdf.js, xlsx.js, recibo-conteo.js.
 * Lo usa: recibo-app.js.
 */

/** Columnas de la tabla del PDF, con su ancho en puntos. */
const COLUMNAS_REPORTE = [
  { titulo: "Código",      ancho: 92,  alinear: "izquierda" },
  { titulo: "Descripción", ancho: 200, alinear: "izquierda" },
  { titulo: "Factura",     ancho: 44,  alinear: "derecha" },
  { titulo: "Recibido",    ancho: 48,  alinear: "derecha" },
  { titulo: "Dif.",        ancho: 38,  alinear: "derecha" },
  { titulo: "Estado",      ancho: 118, alinear: "izquierda" },
];

/**
 * Clasifica cómo llegó un artículo.
 * @param {Partida} p
 * @returns {{color: string, estado: string}}
 */
function clasificar(p) {
  if (p.contada === 0 && p.esperada > 0) return { color: "rojo", estado: "No llegó" };
  if (p.contada < p.esperada) return { color: "azul", estado: "Faltan " + (p.esperada - p.contada) };
  if (p.contada > p.esperada) return { color: "azul", estado: "Sobran " + (p.contada - p.esperada) };
  return { color: "verde", estado: "Completo" };
}

/**
 * Renglones de una factura, ya clasificados.
 * @param {FacturaConteo} f
 * @returns {{celdas: string[], color: string, nota: string}[]}
 */
function renglonesFactura(f) {
  return f.partidas.map((p) => {
    const { color, estado } = clasificar(p);
    const dif = p.contada - p.esperada;
    return {
      celdas: [p.codigo, p.descripcion, String(p.esperada), String(p.contada),
        dif === 0 ? "0" : (dif > 0 ? "+" : "") + dif, estado],
      color,
      nota: p.nota || "",
    };
  });
}

/** Renglones de la mercancía que no viene en ninguna factura. */
function renglonesSobrantes() {
  return Object.entries(sesion.sobrantes).map(([codigo, datos]) => ({
    celdas: [codigo, "No viene en ninguna factura", "0", String(datos.piezas), "+" + datos.piezas, "No facturado"],
    color: "azul",
    nota: datos.nota || "",
  }));
}

/* =========================================================
   PDF
   ========================================================= */

/**
 * Dibuja el encabezado de una hoja: placa de la empresa, datos de la
 * factura que se está reportando y la leyenda de colores.
 * @param {Hoja} hoja
 * @param {FacturaConteo|null} f - Factura de esta sección (null en la hoja de resumen).
 * @returns {number} Altura donde sigue el contenido.
 */
function encabezadoPdf(hoja, f) {
  const x = MARGEN;
  const ancho = HOJA.ancho - MARGEN * 2;

  // Placa amarilla con el nombre de la empresa (como el logo)
  hoja.caja(x, 28, 132, 38, TINTA.amarillo);
  hoja.texto("EL BOOM", x + 66, 48, { tam: 17, negritas: true, alinear: "centro" });
  hoja.texto("TRACTOPARTES", x + 66, 60, { tam: 8.5, negritas: true, alinear: "centro" });

  hoja.texto("Revisión de mercancía recibida", x + ancho, 44, { tam: 16, negritas: true, alinear: "derecha" });
  const revisado = new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  hoja.texto("Revisado el " + revisado, x + ancho, 58, { tam: 8, color: TINTA.gris, alinear: "derecha" });

  let y = 84;
  if (f) {
    const dato = (etiqueta, valor, px, anchoDato) => {
      hoja.texto(etiqueta, px, y, { tam: 7, color: TINTA.gris });
      hoja.texto(cortar(valor || "—", anchoDato, 9.5), px, y + 12, { tam: 9.5, negritas: true });
    };
    dato("PROVEEDOR", f.proveedor, x, 210);
    dato("RFC", f.rfc, x + 220, 90);
    dato("FACTURA", f.folio || "sin folio", x + 320, 90);
    dato("FECHA FACTURA", f.fecha, x + 420, 120);
    y = 112;
  }

  // Leyenda de colores
  const leyenda = [["verde", "Llegó completo"], ["azul", "Revisar"], ["rojo", "No llegó"]];
  let lx = x;
  for (const [color, texto] of leyenda) {
    hoja.caja(lx, y + 2, 12, 11, TINTA[color]);
    hoja.texto(texto, lx + 17, y + 11, { tam: 8.5 });
    lx += 26 + anchoTexto(texto, 8.5);
  }

  hoja.linea(x, y + 26, x + ancho, TINTA.negro, 1.2);
  return y + 26;
}

/** Dibuja la fila de títulos de la tabla y devuelve la altura donde sigue. */
function tituloTablaPdf(hoja, y) {
  const x = MARGEN;
  const ancho = HOJA.ancho - MARGEN * 2;
  hoja.caja(x, y, ancho, 18, TINTA.negro);

  let px = x + 6;
  for (const c of COLUMNAS_REPORTE) {
    hoja.texto(c.titulo, c.alinear === "derecha" ? px + c.ancho - 12 : px, y + 12.5,
      { tam: 8.5, negritas: true, color: [1, 1, 1], alinear: c.alinear });
    px += c.ancho;
  }
  return y + 18;
}

/**
 * Dibuja un renglón de la tabla.
 * @returns {number} Altura donde sigue.
 */
function renglonPdf(hoja, y, fila) {
  const x = MARGEN;
  const ancho = HOJA.ancho - MARGEN * 2;
  const lineasDesc = renglones(fila.celdas[1], COLUMNAS_REPORTE[1].ancho - 12, 8.5, 2);
  const lineasNota = fila.nota ? renglones("Nota: " + fila.nota, ancho - 24, 8, 2) : [];
  const alto = Math.max(20, 8 + lineasDesc.length * 10 + lineasNota.length * 10);

  hoja.caja(x, y, ancho, alto, TINTA[fila.color]);

  let px = x + 6;
  COLUMNAS_REPORTE.forEach((c, i) => {
    const alineado = c.alinear === "derecha" ? px + c.ancho - 12 : px;
    if (i === 1) {
      lineasDesc.forEach((t, j) => hoja.texto(t, px, y + 13 + j * 10, { tam: 8.5 }));
    } else {
      hoja.texto(cortar(fila.celdas[i], c.ancho - 12, i === 0 ? 9.5 : 9), alineado, y + 13,
        { tam: i === 0 ? 9.5 : 9, negritas: i === 0 || i === 5, alinear: c.alinear });
    }
    px += c.ancho;
  });

  lineasNota.forEach((t, j) =>
    hoja.texto(t, x + 12, y + 13 + lineasDesc.length * 10 + j * 10, { tam: 8, color: TINTA.gris }));

  hoja.linea(x, y + alto, x + ancho);
  return y + alto;
}

/** Altura de un renglón sin dibujarlo (para saber si cabe en la hoja). */
function altoRenglon(fila) {
  const lineasDesc = renglones(fila.celdas[1], COLUMNAS_REPORTE[1].ancho - 12, 8.5, 2);
  const lineasNota = fila.nota ? renglones("Nota: " + fila.nota, HOJA.ancho - MARGEN * 2 - 24, 8, 2) : [];
  return Math.max(20, 8 + lineasDesc.length * 10 + lineasNota.length * 10);
}

/**
 * Dibuja el resumen de una factura al final de su sección.
 * @returns {number} Altura donde sigue.
 */
function resumenFacturaPdf(hoja, y, f) {
  const x = MARGEN;
  const t = totalesFactura(f);
  const noLlegaron = f.partidas.filter((p) => p.contada === 0).length;
  const conDif = f.partidas.filter((p) => p.contada !== p.esperada && p.contada > 0).length;

  hoja.texto(
    `${f.partidas.length} artículos · ${t.completas} completos · ${conDif} por revisar · ` +
    `${noLlegaron} no llegaron · ${t.piezasContadas} de ${t.piezasEsperadas} piezas`,
    x, y + 14, { tam: 9, negritas: true });
  return y + 22;
}

/**
 * Genera el PDF del reporte. Cada factura empieza en su propia hoja,
 * con su encabezado y su tabla.
 * @returns {Blob}
 */
function crearPdfReporte() {
  const x = MARGEN;
  const ancho = HOJA.ancho - MARGEN * 2;
  const limite = HOJA.alto - MARGEN - 26; // deja lugar para el pie de página
  const hojas = [];

  /** Abre una hoja nueva para la factura indicada. */
  const nuevaHoja = (f) => {
    const h = new Hoja();
    hojas.push(h);
    return { hoja: h, y: tituloTablaPdf(h, encabezadoPdf(h, f) + 10) };
  };

  // --- Una sección por factura ---
  for (const f of sesion.facturas) {
    let { hoja, y } = nuevaHoja(f);

    for (const fila of renglonesFactura(f)) {
      if (y + altoRenglon(fila) > limite) ({ hoja, y } = nuevaHoja(f));
      y = renglonPdf(hoja, y, fila);
    }
    if (y + 26 > limite) ({ hoja, y } = nuevaHoja(f));
    y = resumenFacturaPdf(hoja, y, f);
  }

  // --- Mercancía que no viene en ninguna factura ---
  const sobrantes = renglonesSobrantes();
  if (sobrantes.length) {
    let { hoja, y } = nuevaHoja(null);
    hoja.texto("Mercancía que no viene en ninguna factura", x, y - 24, { tam: 11, negritas: true });
    for (const fila of sobrantes) {
      if (y + altoRenglon(fila) > limite) ({ hoja, y } = nuevaHoja(null));
      y = renglonPdf(hoja, y, fila);
    }
  }

  // --- Resumen general y firmas ---
  const hoja = new Hoja();
  hojas.push(hoja);
  let y = encabezadoPdf(hoja, null) + 10;

  hoja.texto("Resumen de la revisión", x, y + 14, { tam: 13, negritas: true });
  y += 26;

  // Una línea por factura
  hoja.caja(x, y, ancho, 16, TINTA.negro);
  hoja.texto("Factura", x + 6, y + 11.5, { tam: 8.5, negritas: true, color: [1, 1, 1] });
  hoja.texto("Proveedor", x + 110, y + 11.5, { tam: 8.5, negritas: true, color: [1, 1, 1] });
  hoja.texto("Completos", x + 350, y + 11.5, { tam: 8.5, negritas: true, color: [1, 1, 1], alinear: "derecha" });
  hoja.texto("Revisar", x + 420, y + 11.5, { tam: 8.5, negritas: true, color: [1, 1, 1], alinear: "derecha" });
  hoja.texto("No llegó", x + 480, y + 11.5, { tam: 8.5, negritas: true, color: [1, 1, 1], alinear: "derecha" });
  hoja.texto("Piezas", x + ancho - 6, y + 11.5, { tam: 8.5, negritas: true, color: [1, 1, 1], alinear: "derecha" });
  y += 16;

  for (const f of sesion.facturas) {
    const t = totalesFactura(f);
    const noLlegaron = f.partidas.filter((p) => p.contada === 0).length;
    const conDif = f.partidas.filter((p) => p.contada !== p.esperada && p.contada > 0).length;

    hoja.texto(cortar(f.folio || "sin folio", 98, 9), x + 6, y + 13, { tam: 9, negritas: true });
    hoja.texto(cortar(f.proveedor, 230, 9), x + 110, y + 13, { tam: 9 });
    hoja.texto(String(t.completas), x + 350, y + 13, { tam: 9, negritas: true, color: TINTA.verdeTexto, alinear: "derecha" });
    hoja.texto(String(conDif), x + 420, y + 13, { tam: 9, negritas: true, color: TINTA.azulTexto, alinear: "derecha" });
    hoja.texto(String(noLlegaron), x + 480, y + 13, { tam: 9, negritas: true, color: TINTA.rojoTexto, alinear: "derecha" });
    hoja.texto(`${t.piezasContadas} / ${t.piezasEsperadas}`, x + ancho - 6, y + 13, { tam: 9, alinear: "derecha" });
    hoja.linea(x, y + 20, x + ancho);
    y += 20;
  }

  const r = resumen();
  y += 10;
  hoja.texto(
    `Total: ${sesion.facturas.length} factura(s) · ${r.piezasContadas} de ${r.piezasEsperadas} piezas recibidas` +
    (r.sobrantes ? ` · ${r.sobrantes} pieza(s) no facturadas` : ""),
    x, y + 12, { tam: 10, negritas: true });

  // Firmas
  const fy = y + 70;
  [["Revisó", x + 250], ["Entregó (transportista)", x + 410]].forEach(([texto, px]) => {
    hoja.linea(px, fy, px + 140, TINTA.gris);
    hoja.texto(texto, px + 70, fy + 12, { tam: 8, color: TINTA.gris, alinear: "centro" });
  });

  // Pie de página en todas las hojas
  const cuantas = sesion.facturas.length;
  hojas.forEach((h, i) => {
    h.texto(`El Boom Tractopartes · Revisión de ${cuantas} factura(s)`, x, HOJA.alto - MARGEN + 4,
      { tam: 7.5, color: TINTA.gris });
    h.texto(`Hoja ${i + 1} de ${hojas.length}`, x + ancho, HOJA.alto - MARGEN + 4,
      { tam: 7.5, color: TINTA.gris, alinear: "derecha" });
  });

  return armarPdf(hojas);
}

/* =========================================================
   EXCEL Y TEXTO
   ========================================================= */

/**
 * Encabezados del reporte en Excel: proveedor y factura al inicio, nota al final.
 * La cantidad de la factura se llama "Cant. factura" para no confundirla
 * con la columna "Factura", que trae el folio.
 */
const ENCABEZADOS_EXCEL = [
  "Proveedor", "Factura", "Código", "Descripción",
  "Cant. factura", "Recibido", "Dif.", "Estado", "Nota",
];

/** Renglones del Excel: todas las facturas seguidas, y al final lo no facturado. */
function renglonesExcel() {
  const filas = sesion.facturas.flatMap((f) =>
    renglonesFactura(f).map((r) => [f.proveedor, f.folio || "sin folio", ...r.celdas, r.nota]));

  for (const r of renglonesSobrantes()) {
    filas.push(["—", "No facturado", ...r.celdas, r.nota]);
  }
  return filas;
}

/**
 * Genera el Excel del reporte.
 * @returns {Blob}
 */
function crearExcelReporte() {
  return crearXlsx({
    hoja: "Revisión",
    encabezados: ENCABEZADOS_EXCEL,
    anchos: [26, 16, 18, 46, 10, 10, 8, 16, 40],
    filas: renglonesExcel(),
  });
}

/** El reporte en texto, para pegarlo en un correo o en una hoja. */
function textoReporte() {
  return [ENCABEZADOS_EXCEL, ...renglonesExcel()]
    .map((f) => f.map((v) => String(v).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

/** Nombre de los archivos del reporte, sin extensión. */
function nombreReporte() {
  const f = sesion.facturas;
  const base = f.length === 1
    ? `${f[0].rfc}_${f[0].folio || "factura"}`
    : `${f.length}facturas_${new Date().toISOString().slice(0, 10)}`;
  return ("revision_" + base).replace(/\s+/g, "");
}
