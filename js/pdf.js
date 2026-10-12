/**
 * @file pdf.js
 * @description Genera el PDF del reporte de revisión, sin librerías externas,
 * para que la app siga funcionando sin internet.
 *
 * Arma un PDF 1.4 con tipografía Helvetica (la traen todos los lectores),
 * texto en codificación WinAnsi (sirve para los acentos y la ñ) y rectángulos
 * de color para marcar cómo llegó cada artículo.
 *
 * Depende de: nada.
 * Lo usa: recibo-reporte.js.
 */

/** Hoja carta en puntos (1 punto = 1/72 de pulgada). */
const HOJA = { ancho: 612, alto: 792 };

/** Margen de la hoja. */
const MARGEN = 36;

/** Colores del reporte, en tinta (0 a 1). */
const TINTA = {
  negro: [0.08, 0.08, 0.08],
  gris: [0.45, 0.45, 0.45],
  lineaGris: [0.80, 0.80, 0.80],
  amarillo: [1, 0.807, 0],        // amarillo del logo
  verde: [0.84, 0.93, 0.80],      // llegó completo
  azul: [0.82, 0.89, 0.96],       // revisar
  rojo: [0.98, 0.83, 0.81],       // no llegó
  verdeTexto: [0.16, 0.42, 0.13],
  azulTexto: [0.11, 0.33, 0.55],
  rojoTexto: [0.63, 0.14, 0.10],
};

/**
 * Ancho de cada carácter en Helvetica, en milésimas de su tamaño.
 * Sirve para cortar y acomodar el texto sin que se salga de la columna.
 */
const ANCHOS = (() => {
  const w = {};
  const poner = (texto, ancho) => [...texto].forEach((c) => (w[c] = ancho));
  poner(" !I|", 278); w["|"] = 260; w["I"] = 278;
  poner("'", 191); poner("()[]{}", 333); w["["] = 278; w["]"] = 278; w["{"] = 334; w["}"] = 334;
  poner('"', 355); poner("#$0123456789", 556); w["%"] = 889; w["&"] = 667;
  poner("*", 389); poner("+<=>~", 584); poner(",.:;", 278); poner("-", 333); poner("/\\", 278);
  poner("?", 556); w["@"] = 1015; poner("^", 469); poner("_", 556); poner("`", 333);
  poner("ABDEFHKNPRSVXYZ", 667); poner("CGOQ", 778); w["D"] = 722; w["H"] = 722; w["N"] = 722;
  w["E"] = 667; w["F"] = 611; w["L"] = 556; w["M"] = 833; w["T"] = 611; w["W"] = 944;
  w["J"] = 500; w["U"] = 722; w["R"] = 722;
  poner("abcdeghnopqu", 556); poner("cs", 500); poner("fijltr", 278);
  w["i"] = 222; w["j"] = 222; w["l"] = 222; w["r"] = 333; w["k"] = 500; w["m"] = 833;
  poner("vxyz", 500); w["w"] = 722;
  // Acentuadas y ñ: mismo ancho que su letra base
  poner("áàäâã", 556); poner("éèëê", 556); poner("íìïî", 278); poner("óòöô", 556); poner("úùüû", 556);
  poner("ñ", 556); poner("ÁÀÄÂ", 667); poner("ÉÈËÊ", 667); poner("ÍÌÏÎ", 278);
  poner("ÓÒÖÔ", 778); poner("ÚÙÜÛ", 722); poner("Ñ", 722); poner("°º", 400); w["€"] = 556; w["…"] = 1000; w["–"] = 556; w["—"] = 1000; w["·"] = 278;
  return w;
})();

/**
 * Ancho de un texto.
 * @param {string} texto
 * @param {number} tam - Tamaño de letra en puntos.
 * @param {boolean} [negritas=false]
 * @returns {number} Ancho en puntos.
 */
function anchoTexto(texto, tam, negritas = false) {
  let total = 0;
  for (const c of String(texto)) total += ANCHOS[c] ?? 556;
  return (total / 1000) * tam * (negritas ? 1.07 : 1);
}

/**
 * Corta un texto para que quepa en un ancho, agregando "…" si sobra.
 * @param {string} texto
 * @param {number} ancho - Ancho disponible en puntos.
 * @param {number} tam
 * @returns {string}
 */
function cortar(texto, ancho, tam) {
  let t = String(texto ?? "");
  if (anchoTexto(t, tam) <= ancho) return t;
  while (t.length > 1 && anchoTexto(t + "…", tam) > ancho) t = t.slice(0, -1);
  return t + "…";
}

/**
 * Parte un texto en renglones que quepan en un ancho.
 * @param {string} texto
 * @param {number} ancho
 * @param {number} tam
 * @param {number} [maxRenglones=3]
 * @returns {string[]}
 */
function renglones(texto, ancho, tam, maxRenglones = 3) {
  const palabras = String(texto ?? "").split(/\s+/).filter(Boolean);
  const salida = [];
  let actual = "";

  for (const p of palabras) {
    const prueba = actual ? actual + " " + p : p;
    if (anchoTexto(prueba, tam) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) salida.push(actual);
    actual = p;
    if (salida.length === maxRenglones - 1) break;
  }
  if (actual) salida.push(actual);
  if (!salida.length) return [""];

  // Si quedó texto fuera, se corta el último renglón
  const usadas = salida.join(" ").split(/\s+/).length;
  if (usadas < palabras.length) {
    salida[salida.length - 1] = cortar(palabras.slice(usadas - 1).join(" "), ancho, tam);
  }
  return salida;
}

/* =========================================================
   ARMADO DEL ARCHIVO PDF
   ========================================================= */

/**
 * Caracteres que WinAnsi guarda en una posición distinta a la de Unicode.
 * Sin esta tabla saldrían como "?" en el PDF.
 */
const WINANSI = {
  "\u2026": "\x85", // …
  "\u2013": "\x96", // –
  "\u2014": "\x97", // —
  "\u2018": "\x91", "\u2019": "\x92", // comillas simples
  "\u201C": "\x93", "\u201D": "\x94", // comillas dobles
  "\u2022": "\x95", // •
  "\u20AC": "\x80", // €
  "\u2122": "\x99", // ™
};

/** Pasa un texto a bytes WinAnsi y escapa los caracteres especiales del PDF. */
function textoPdf(texto) {
  return String(texto ?? "")
    .replace(/[\\()]/g, (c) => "\\" + c)
    .split("")
    .map((c) => WINANSI[c] || (c.charCodeAt(0) > 255 ? "?" : c))
    .join("");
}

/** Convierte una cadena a bytes (un byte por carácter). */
function aBytes(cadena) {
  const b = new Uint8Array(cadena.length);
  for (let i = 0; i < cadena.length; i++) b[i] = cadena.charCodeAt(i) & 0xff;
  return b;
}

/**
 * Hoja en construcción: junta las instrucciones de dibujo.
 * Las coordenadas de esta clase van de arriba hacia abajo (como se lee),
 * y se convierten al sistema del PDF (de abajo hacia arriba) al escribir.
 */
class Hoja {
  constructor() { this.ops = []; }

  /** Rectángulo relleno. */
  caja(x, y, ancho, alto, color) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    this.ops.push(`${x.toFixed(2)} ${(HOJA.alto - y - alto).toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re f`);
  }

  /** Línea horizontal. */
  linea(x1, y, x2, color = TINTA.lineaGris, grosor = 0.6) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} RG ${grosor} w`);
    this.ops.push(`${x1.toFixed(2)} ${(HOJA.alto - y).toFixed(2)} m ${x2.toFixed(2)} ${(HOJA.alto - y).toFixed(2)} l S`);
  }

  /**
   * Escribe texto.
   * @param {string} texto
   * @param {number} x - Borde izquierdo (o derecho si alinear es "derecha").
   * @param {number} y - Línea base del texto.
   * @param {Object} [op]
   * @param {number} [op.tam=9]
   * @param {boolean} [op.negritas=false]
   * @param {number[]} [op.color=TINTA.negro]
   * @param {"izquierda"|"derecha"|"centro"} [op.alinear="izquierda"]
   */
  texto(texto, x, y, { tam = 9, negritas = false, color = TINTA.negro, alinear = "izquierda" } = {}) {
    const t = textoPdf(texto);
    if (!t) return;
    let px = x;
    if (alinear !== "izquierda") {
      const a = anchoTexto(texto, tam, negritas);
      px = alinear === "derecha" ? x - a : x - a / 2;
    }
    this.ops.push("BT");
    this.ops.push(`/${negritas ? "F2" : "F1"} ${tam} Tf`);
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    this.ops.push(`${px.toFixed(2)} ${(HOJA.alto - y).toFixed(2)} Td`);
    this.ops.push(`(${t}) Tj`);
    this.ops.push("ET");
  }

  contenido() { return this.ops.join("\n"); }
}

/**
 * Junta las hojas en un archivo PDF.
 * @param {Hoja[]} hojas
 * @returns {Blob}
 */
function armarPdf(hojas) {
  const objetos = [];
  const nuevo = (contenido) => { objetos.push(contenido); return objetos.length; };

  const idPaginas = 1;
  objetos.push("");                                   // lugar para el objeto Pages
  const idCatalogo = nuevo(`<< /Type /Catalog /Pages ${idPaginas} 0 R >>`);
  const idF1 = nuevo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const idF2 = nuevo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const idsPagina = [];
  for (const hoja of hojas) {
    const flujo = hoja.contenido();
    const idFlujo = nuevo(`<< /Length ${aBytes(flujo).length} >>\nstream\n${flujo}\nendstream`);
    idsPagina.push(nuevo(
      `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${HOJA.ancho} ${HOJA.alto}] ` +
      `/Resources << /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R >> >> /Contents ${idFlujo} 0 R >>`
    ));
  }
  objetos[0] = `<< /Type /Pages /Count ${idsPagina.length} /Kids [${idsPagina.map((i) => i + " 0 R").join(" ")}] >>`;

  // Cuerpo del archivo, guardando dónde empieza cada objeto
  let pdf = "%PDF-1.4\n";
  const posiciones = [];
  objetos.forEach((cuerpo, i) => {
    posiciones.push(aBytes(pdf).length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });

  // Tabla de referencias y cierre
  const inicioTabla = aBytes(pdf).length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  posiciones.forEach((p) => (pdf += String(p).padStart(10, "0") + " 00000 n \n"));
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${inicioTabla}\n%%EOF`;

  return new Blob([aBytes(pdf)], { type: "application/pdf" });
}
