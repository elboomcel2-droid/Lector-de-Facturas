/**
 * @file utilidades.js
 * @description Funciones pequeñas de uso general que comparten todos los
 * demás archivos. Se carga PRIMERO porque el resto depende de ellas.
 *
 * Proyecto: Lector de facturas XML | El Boom Tractopartes
 */

/**
 * Atajo para `document.getElementById`.
 * @param {string} id - Id del elemento HTML.
 * @returns {HTMLElement|null} El elemento, o null si no existe.
 * @example $("btnCopiar").click();
 */
const $ = (id) => document.getElementById(id);

/**
 * Escapa texto para insertarlo de forma segura dentro de HTML.
 * Evita que un texto de la factura (por ejemplo una descripción con "<")
 * rompa la página o ejecute código.
 * @param {*} s - Cualquier valor; null/undefined se convierten en "".
 * @returns {string} Texto con &, <, >, " y ' escapados.
 * @example esc('FILTRO <P550367>') // "FILTRO &lt;P550367&gt;"
 */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Convierte un texto con formato de dinero a número.
 * Quita signo de pesos, comas de miles y espacios.
 * @param {*} v - Valor a convertir (ej. "$1,234.50", "30.000000", 12).
 * @returns {number|null} El número, o null si no es un número válido.
 * @example num("$1,234.50") // 1234.5
 * @example num("N/A")       // null
 */
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Da formato mexicano con separador de miles y 2 decimales.
 * Se usa solo para MOSTRAR en pantalla (no para exportar).
 * @param {number} n - Número a formatear.
 * @returns {string} Ej. 1234.5 → "1,234.50".
 */
const fmt = (n) => n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
