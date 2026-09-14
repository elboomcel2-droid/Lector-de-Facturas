/**
 * @file app.js
 * @description Controla la pantalla: guarda el estado (facturas cargadas),
 * dibuja los 3 pasos (facturas, columnas, resultado) y responde a los clics.
 *
 * Flujo general:
 *   cargarArchivos() → leerCFDI() → render() → renderFacturas()
 *                                            → renderColumnas()
 *                                            → renderResultado()
 * Cada vez que algo cambia se llama a render(), que vuelve a dibujar todo.
 *
 * Depende de: todos los archivos anteriores.
 */

/* =========================================================
   ESTADO
   ========================================================= */

/** Facturas cargadas en la sesión. @type {Factura[]} */
let facturas = [];

/** Id de la factura seleccionada en el paso 2 (columnas). @type {string|null} */
let activaId = null;

/**
 * Factura seleccionada actualmente.
 * @returns {Factura|undefined}
 */
const facturaActiva = () => facturas.find((f) => f.id === activaId);

/* =========================================================
   CARGA DE ARCHIVOS
   ========================================================= */

/**
 * Lee uno o varios archivos elegidos o arrastrados por el usuario.
 * Ignora PDFs y otros formatos con un aviso, y evita facturas repetidas (por UUID).
 * @param {File[]} lista
 * @returns {Promise<void>}
 */
async function cargarArchivos(lista) {
  const avisos = [];

  for (const archivo of lista) {
    if (/\.pdf$/i.test(archivo.name)) { avisos.push(`${archivo.name}: es PDF. Sube el XML de esa factura.`); continue; }
    if (!/\.xml$/i.test(archivo.name)) { avisos.push(`${archivo.name}: no es un archivo XML.`); continue; }

    try {
      const factura = leerCFDI(await archivo.text(), archivo.name);
      if (facturas.some((x) => x.uuid === factura.uuid)) {
        avisos.push(`${archivo.name}: esa factura ya estaba cargada.`);
        continue;
      }
      facturas.push(factura);
      activaId = factura.id; // la última cargada queda seleccionada
    } catch (e) {
      avisos.push(`${archivo.name}: ${e.message}.`);
    }
  }

  $("avisos").innerHTML = avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join("");
  render();
}

/* =========================================================
   DIBUJAR PANTALLA
   ========================================================= */

/**
 * Redibuja toda la pantalla según el estado actual.
 * Si no hay facturas, solo se ve la zona de carga.
 */
function render() {
  const hay = facturas.length > 0;

  // La zona de carga se hace compacta cuando ya hay facturas
  $("zona").classList.toggle("compacta", hay);
  $("zonaTitulo").textContent = hay ? "Agregar más facturas" : "Arrastra aquí los XML de las facturas";
  $("zonaSub").textContent = hay
    ? "Arrastra los XML o haz clic."
    : "o haz clic para elegirlos. Puedes cargar varias facturas a la vez.";

  ["secFacturas", "secColumnas", "secResultado"].forEach((id) => ($(id).hidden = !hay));
  if (!hay) return;

  if (!facturaActiva()) activaId = facturas[0].id;
  renderFacturas();
  renderColumnas();
  renderResultado();
}

/** Paso 1: tarjetas de las facturas cargadas (proveedor, RFC, folio, partidas). */
function renderFacturas() {
  $("listaFacturas").innerHTML = facturas.map((f) => `
    <div class="factura ${f.id === activaId ? "activa" : ""}">
      <button class="factura-sel" data-id="${f.id}" aria-pressed="${f.id === activaId}">
        <strong>${esc(f.proveedor)}</strong>
        <span>${esc(f.rfc)}</span>
        <span>Folio ${esc(f.folio || "sin folio")}, ${esc(f.fecha)}</span>
        <span class="cuenta">${f.filas.length} partidas${f.tipo === "E" ? ` <span class="insignia">Nota de crédito</span>` : ""}</span>
      </button>
      <button class="quitar" data-quitar="${f.id}" aria-label="Quitar factura de ${esc(f.proveedor)}">×</button>
    </div>`).join("");
}

/**
 * Paso 2: una tarjeta por columna activa (con su selector de atributo del XML),
 * la tarjeta "Agregar columna", la casilla de descuento y la vista previa
 * de la factura con las columnas elegidas resaltadas.
 */
function renderColumnas() {
  const f = facturaActiva();
  $("tituloColumnas").textContent = `Columnas de ${f.proveedor}`;

  // Tarjetas de columnas activas (en su orden). Las calculadas muestran su fórmula en lugar de selector.
  // El "asa" (nombre con puntitos) sirve para arrastrar la tarjeta; ver ordenar.js.
  const tarjetas = campos.map((c) => `
    <div class="selector" data-key="${c.key}" style="--c:${c.color}">
      <div class="selector-cab">
        <button type="button" class="asa" data-asa="${c.key}" title="Arrastra para acomodar"
          aria-label="Mover columna ${esc(c.label)}: arrastra o usa las flechas del teclado">
          <span class="grip" aria-hidden="true"></span>
          <span class="chip">${esc(c.label)}</span>
        </button>
        <button class="quitar-campo" data-quitar-campo="${c.key}" ${campos.length <= 1 ? "disabled" : ""}
          aria-label="Quitar columna ${esc(c.label)}" title="Quitar columna">×</button>
      </div>
      ${c.calculado
        ? `<p class="calculado-nota">${esc(c.formula)}</p>`
        : `<select data-campo="${c.key}" aria-label="Columna del XML para ${esc(c.label)}">
            <option value="">Elige una columna…</option>
            ${f.columnas.map((col) =>
              `<option value="${esc(col)}" ${col === f.mapa[c.key] ? "selected" : ""}>${esc(col)}</option>`
            ).join("")}
          </select>`}
    </div>`).join("");

  // Menú para agregar: columnas del catálogo no activas + opción personalizada
  const opcionesAgregar = camposDisponibles()
    .map((c) => `<option value="${c.key}">${esc(c.label)}</option>`)
    .join("") + `<option value="__otra">Otra columna del XML…</option>`;

  const tarjetaAgregar = `
    <div class="selector agregar">
      <span class="agregar-titulo">Agregar columna</span>
      <div class="agregar-fila">
        <select id="selAgregar" aria-label="Columna a agregar">${opcionesAgregar}</select>
        <button class="btn" id="btnAgregar">Agregar</button>
      </div>
    </div>`;

  $("selectores").innerHTML = tarjetas + tarjetaAgregar;

  // Casilla "restar descuento": solo si hay precio unitario, la factura trae descuento
  // y el precio sale de ValorUnitario (el único caso donde la fórmula aplica)
  const verDesc = f.descTotal > 0 && campos.some((c) => c.key === "precio") && f.mapa.precio === "ValorUnitario";
  $("lblDesc").hidden = !verDesc;
  $("chkDesc").checked = f.restarDesc;
  $("descInfo").textContent = verDesc ? `(esta factura trae $${fmt(f.descTotal)} de descuento)` : "";

  // Vista previa: todas las columnas del XML; las asignadas llevan etiqueta y color
  const campoDe = (col) => campos.find((c) => !c.calculado && f.mapa[c.key] === col);

  const encabezado = `<thead><tr><th class="idx">#</th>${f.columnas.map((col) => {
    const c = campoDe(col);
    return `<th>${c ? `<span class="chip" style="--c:${c.color}">${esc(c.label)}</span>` : ""}${esc(col)}</th>`;
  }).join("")}</tr></thead>`;

  const cuerpo = `<tbody>${f.filas.map((fila, i) => `<tr><td class="idx">${i + 1}</td>${f.columnas.map((col) => {
    const c = campoDe(col);
    return `<td${c ? ` style="background:${c.color}22"` : ""}>${esc(fila[col])}</td>`; // "22" = color con ~13% de opacidad
  }).join("")}</tr>`).join("")}</tbody>`;

  $("tablaVista").innerHTML = encabezado + cuerpo;
}

/**
 * Paso 3: tabla final con las partidas de todas las facturas,
 * aviso de columnas sin asignar y total de partidas.
 */
function renderResultado() {
  const conExtra = $("chkExtra").checked;
  const filas = armarResultado(facturas);

  $("total").innerHTML = `${filas.length} partidas<span>de ${facturas.length} ${facturas.length === 1 ? "factura" : "facturas"}</span>`;

  // Avisar qué columnas faltan por elegir en cada factura (las calculadas no cuentan)
  const faltantes = facturas
    .map((f) => ({ f, faltan: campos.filter((c) => !c.calculado && !f.mapa[c.key]).map((c) => c.label) }))
    .filter((x) => x.faltan.length);
  $("alertaMapa").hidden = !faltantes.length;
  $("alertaMapa").textContent = faltantes.length
    ? "Columnas sin elegir: " + faltantes.map((x) => `${x.f.proveedor} (${x.faltan.join(", ")})`).join("; ") + "."
    : "";

  const alinear = (c) => (c.tipo === "texto" ? "" : "num-col"); // números a la derecha

  const encabezado = `<thead><tr>
    <th class="idx">#</th>
    ${conExtra ? "<th>Proveedor</th><th>Folio</th>" : ""}
    ${campos.map((c) => `<th class="${alinear(c)}">${esc(c.label)}</th>`).join("")}
  </tr></thead>`;

  const cuerpo = `<tbody>${filas.map((r, i) => `<tr>
    <td class="idx">${i + 1}</td>
    ${conExtra ? `<td class="muted">${esc(r.proveedor)}</td><td class="muted">${esc(r.folio)}</td>` : ""}
    ${campos.map((c, j) => {
      const v = r.valores[j];
      // En rojo: columna numérica cuyo valor no es número (probablemente se eligió mal la columna)
      const malo = c.tipo !== "texto" && v.texto !== "" && v.numero == null;
      const clases = [alinear(c), c.key === "codigo" ? "codigo" : "", malo ? "malo" : ""].join(" ").trim();
      return `<td class="${clases}">${esc(valorPantalla(c, v))}</td>`;
    }).join("")}
  </tr>`).join("")}</tbody>`;

  $("tablaResultado").innerHTML = encabezado + cuerpo;
}

/* =========================================================
   EVENTOS
   Se usa "delegación de eventos": un solo listener en el contenedor
   atiende los botones que se crean dinámicamente dentro de él.
   ========================================================= */

// --- Elegir archivos con clic o con teclado (Enter / Espacio) ---
$("entrada").addEventListener("change", (e) => {
  cargarArchivos([...e.target.files]);
  e.target.value = ""; // permite volver a elegir el mismo archivo
});
$("zona").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("entrada").click(); }
});

// --- Arrastrar y soltar en cualquier parte de la página ---
["dragenter", "dragover"].forEach((ev) =>
  document.addEventListener(ev, (e) => { e.preventDefault(); $("zona").classList.add("encima"); })
);
["dragleave", "drop"].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault(); // evita que el navegador abra el archivo
    if (ev === "drop" || !e.relatedTarget) $("zona").classList.remove("encima");
  })
);
document.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) cargarArchivos([...e.dataTransfer.files]);
});

// --- Paso 1: seleccionar o quitar una factura ---
$("listaFacturas").addEventListener("click", (e) => {
  const quitar = e.target.closest("[data-quitar]");
  if (quitar) {
    facturas = facturas.filter((f) => f.id !== quitar.dataset.quitar);
    render();
    return;
  }
  const sel = e.target.closest("[data-id]");
  if (sel) { activaId = sel.dataset.id; render(); }
});

// --- Paso 2: cambiar el atributo del XML de una columna ---
// Se aplica a todas las facturas cargadas del mismo proveedor y se guarda.
$("selectores").addEventListener("change", (e) => {
  const campo = e.target.dataset.campo;
  if (!campo) return; // cambios en el menú "Agregar columna" no aplican aquí
  const f = facturaActiva();
  const valor = e.target.value;

  facturas
    .filter((x) => x.rfc === f.rfc)
    .forEach((x) => { if (!valor || x.columnas.includes(valor)) x.mapa[campo] = valor; });

  guardarMapa(f);
  render();
});

// --- Paso 2: agregar o quitar columnas ---
$("selectores").addEventListener("click", (e) => {
  const quitar = e.target.closest("[data-quitar-campo]");
  if (quitar) {
    quitarCampo(quitar.dataset.quitarCampo);
    render();
    return;
  }

  if (e.target.id === "btnAgregar") {
    const elegido = $("selAgregar").value;
    let campo;
    if (elegido === "__otra") {
      const nombre = (prompt("Escribe el nombre de la columna del XML o el nombre que quieras darle:") || "").trim();
      if (!nombre) return;
      campo = crearCampoPersonalizado(nombre);
    } else {
      campo = CATALOGO.find((c) => c.key === elegido);
    }
    if (!campo) return;

    agregarCampo(campo);
    // Asignar la columna del XML en cada factura cargada
    facturas.forEach((f) => (f.mapa[campo.key] = columnaInicial(f.columnas, campo, cargarMapa(f.rfc))));
    render();
  }
});

// --- Paso 2: restar descuento (aplica a todas las facturas del mismo proveedor) ---
$("chkDesc").addEventListener("change", (e) => {
  const f = facturaActiva();
  facturas
    .filter((x) => x.rfc === f.rfc)
    .forEach((x) => (x.restarDesc = e.target.checked && x.descTotal > 0));
  guardarMapa(f);
  render();
});

// --- Paso 3: acciones del resultado ---
$("chkExtra").addEventListener("change", renderResultado);

$("btnCopiar").addEventListener("click", async () => {
  await copiarParaExcel(armarResultado(facturas), $("chkExtra").checked);
  const b = $("btnCopiar");
  b.textContent = "Copiado";
  setTimeout(() => (b.textContent = "Copiar para Excel"), 1600);
});

/** Nombre base para los archivos que se descargan. */
function nombreDescarga() {
  return facturas.length === 1
    ? `partidas_${facturas[0].rfc}_${facturas[0].folio || "factura"}`.replace(/\s+/g, "")
    : `partidas_${new Date().toISOString().slice(0, 10)}`;
}

// Excel con el formato de la plantilla "Partidas de compra" (ver plantilla.js)
$("btnExcel").addEventListener("click", () => descargarPlantilla(facturas, nombreDescarga()));

$("btnCsv").addEventListener("click", () => {
  // Una factura: partidas_RFC_FOLIO.csv  |  Varias: partidas_AAAA-MM-DD.csv
  descargarCSV(armarResultado(facturas), $("chkExtra").checked, nombreDescarga());
});

$("btnLimpiar").addEventListener("click", () => {
  facturas = [];
  activaId = null;
  $("avisos").innerHTML = "";
  render();
});
