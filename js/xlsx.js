/**
 * @file xlsx.js
 * @description Genera archivos Excel (.xlsx) sin usar librerías externas,
 * para que la app siga funcionando sin internet.
 *
 * Un .xlsx es un archivo ZIP con varios XML dentro. Aquí se arman esos XML
 * y se comprimen en un ZIP "sin compresión" (método store), que Excel acepta.
 *
 * Solo genera lo que esta app necesita: una hoja con encabezado de color,
 * anchos de columna y todo el contenido como texto. No maneja fórmulas,
 * varias hojas ni imágenes.
 *
 * Depende de: nada.
 * Lo usa: plantilla.js.
 */

/* =========================================================
   ZIP (método store: se guarda sin comprimir)
   ========================================================= */

/** Tabla para calcular CRC-32, que el formato ZIP exige por archivo. */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/**
 * Calcula el CRC-32 de unos bytes.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Crea un ZIP con los archivos indicados.
 * @param {{nombre: string, texto: string}[]} archivos - Ruta dentro del ZIP y su contenido.
 * @returns {Blob} El ZIP listo para descargar.
 */
function crearZip(archivos) {
  const codificador = new TextEncoder();
  const partes = [];   // trozos del archivo final
  const entradas = []; // datos de cada archivo para el índice del ZIP
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  for (const { nombre, texto } of archivos) {
    const datos = codificador.encode(texto);
    const ruta = codificador.encode(nombre);
    const crc = crc32(datos);

    // Encabezado local del archivo
    const encabezado = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,        // firma
      ...u16(20), ...u16(0),         // versión y banderas
      ...u16(0),                     // método 0 = sin compresión
      ...u16(0), ...u16(0),          // hora y fecha (no se usan)
      ...u32(crc), ...u32(datos.length), ...u32(datos.length),
      ...u16(ruta.length), ...u16(0),
    ]);

    partes.push(encabezado, ruta, datos);
    entradas.push({ ruta, crc, tam: datos.length, offset });
    offset += encabezado.length + ruta.length + datos.length;
  }

  // Índice central: repite los datos de cada archivo con su posición
  const inicioIndice = offset;
  for (const e of entradas) {
    const registro = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...u16(20), ...u16(20), ...u16(0),
      ...u16(0), ...u16(0), ...u16(0),
      ...u32(e.crc), ...u32(e.tam), ...u32(e.tam),
      ...u16(e.ruta.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(e.offset),
    ]);
    partes.push(registro, e.ruta);
    offset += registro.length + e.ruta.length;
  }

  // Cierre del ZIP
  partes.push(new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length),
    ...u32(offset - inicioIndice), ...u32(inicioIndice),
    ...u16(0),
  ]));

  return new Blob(partes, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* =========================================================
   XLSX
   ========================================================= */

/** Escapa texto para meterlo en un XML. */
const escXml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // Excel rechaza estos caracteres

/** Número de columna (1) a letra ("A"). */
function letraColumna(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Genera un archivo .xlsx de una sola hoja, con todas las celdas en
 * formato de texto (igual que la plantilla de El Boom).
 *
 * @param {Object} op
 * @param {string} op.hoja - Nombre de la pestaña (máx. 31 caracteres).
 * @param {string[]} op.encabezados - Títulos de la primera fila.
 * @param {string[][]} op.filas - Contenido; cada fila es un arreglo de textos.
 * @param {number[]} [op.anchos] - Ancho de cada columna (unidades de Excel).
 * @param {string} [op.colorEncabezado="3346A3"] - Fondo del encabezado (hex sin #).
 * @param {number} [op.altoEncabezado=30] - Alto de la primera fila.
 * @returns {Blob} Archivo listo para descargar.
 */
function crearXlsx({ hoja, encabezados, filas, anchos = [], colorEncabezado = "3346A3", altoEncabezado = 30 }) {
  // Celda con texto directo (inlineStr): así no se necesita sharedStrings.xml
  const celda = (col, fila, texto, estilo) =>
    texto === "" || texto == null
      ? ""
      : `<c r="${letraColumna(col)}${fila}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escXml(texto)}</t></is></c>`;

  const cols = anchos.length
    ? `<cols>${anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" style="1" customWidth="1"/>`).join("")}` +
      `<col min="${anchos.length + 1}" max="16384" width="9.140625" style="1"/></cols>`
    : "";

  const filaEncabezado =
    `<row r="1" ht="${altoEncabezado}" customHeight="1">` +
    encabezados.map((t, i) => celda(i + 1, 1, t, 2)).join("") +
    `</row>`;

  const filasDatos = filas
    .map((f, i) => `<row r="${i + 2}">` + f.map((t, j) => celda(j + 1, i + 2, t, 1)).join("") + `</row>`)
    .join("");

  const ultima = `${letraColumna(Math.max(encabezados.length, 1))}${filas.length + 1}`;

  const archivos = [
    { nombre: "[Content_Types].xml", texto:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>` },

    { nombre: "_rels/.rels", texto:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>` },

    { nombre: "xl/workbook.xml", texto:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${escXml(hoja).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },

    { nombre: "xl/_rels/workbook.xml.rels", texto:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>` },

    // Estilos: 0 = normal, 1 = texto (formato @), 2 = encabezado (negritas, blanco sobre color)
    { nombre: "xl/styles.xml", texto:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2">` +
        `<font><sz val="11"/><name val="Arial"/></font>` +
        `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>` +
      `</fonts>` +
      `<fills count="3">` +
        `<fill><patternFill patternType="none"/></fill>` +
        `<fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FF${colorEncabezado}"/><bgColor indexed="64"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="1"><border/></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1">` +
          `<alignment vertical="center"/></xf>` +
      `</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>` },

    { nombre: "xl/worksheets/sheet1.xml", texto:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="A1:${ultima}"/>` +
      `<sheetViews><sheetView tabSelected="1" workbookViewId="0">` +
      `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      cols +
      `<sheetData>${filaEncabezado}${filasDatos}</sheetData>` +
      `</worksheet>` },
  ];

  return crearZip(archivos);
}

/**
 * Descarga un Blob con el nombre indicado.
 * @param {Blob} blob
 * @param {string} nombre - Nombre del archivo con extensión.
 */
function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
