/**
 * @file recibo-app.js
 * @description Pantalla y eventos de la revisión de mercancía.
 *
 * Flujo: se cargan una o varias facturas (XML) y se va escaneando (pistola)
 * o tecleando cada código. En cada lectura se abre una ventana que pregunta
 * cuántas piezas llegaron. Al final se saca el reporte en PDF (separado por
 * factura) o en Excel.
 *
 * Depende de: utilidades.js, cfdi.js, recibo-conteo.js, recibo-escaner.js,
 *             recibo-reporte.js.
 */

/** Filtro de estado: todas | pendientes | completas | diferencias. */
let filtro = "todas";

/** Factura que se está viendo: "todas" o el UUID de una. */
let facturaVista = "todas";

/** Texto del buscador. */
let busqueda = "";

/** Última partida contada, para resaltarla un momento. @type {{fi:number,pi:number}|null} */
let ultima = null;

/** Código pendiente de identificar en la ventana de código no reconocido. */
let codigoPendiente = "";

/** Artículo del que se está preguntando la cantidad. @type {{fi:number,pi:number}|null} */
let enCantidad = null;

/** Artículo del que se está escribiendo la nota. @type {{fi,pi}|{codigo}|null} */
let enNota = null;

/** Facturas leídas que esperan que se confirmen sus columnas. @type {Factura[]} */
let porConfirmar = [];

/** Factura cuyas columnas se están revisando. @type {Factura|null} */
let enColumnas = null;

/** Columnas elegidas en la pantalla de columnas. */
let mapaColumnas = {};

/** Si se está corrigiendo una factura ya cargada, su número; si no, -1. */
let corrigiendo = -1;

/* =========================================================
   CARGAR FACTURAS
   ========================================================= */

/**
 * Lee uno o varios XML. El primero abre la revisión y los demás se agregan.
 * @param {File[]} archivos
 */
async function cargarFacturas(archivos) {
  const avisos = [];

  for (const archivo of archivos) {
    if (/\.pdf$/i.test(archivo.name)) { avisos.push(`${archivo.name}: es PDF. Usa el XML de la factura.`); continue; }
    if (!/\.xml$/i.test(archivo.name)) { avisos.push(`${archivo.name}: no es un archivo XML.`); continue; }

    try {
      const factura = leerCFDI(await archivo.text(), archivo.name);
      if (sesion?.facturas.some((f) => f.uuid === factura.uuid)) {
        avisos.push(`${archivo.name}: esa factura ya está en la revisión.`);
        continue;
      }
      porConfirmar.push(factura);
    } catch (e) {
      avisos.push(`${archivo.name}: ${e.message}.`);
    }
  }

  const donde = sesion ? "avisosConteo" : "avisos";
  $(donde).innerHTML = avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join("");

  siguienteColumnas();
}

/**
 * Muestra la pantalla de columnas de la siguiente factura por confirmar.
 * Cuando ya no hay ninguna, regresa al conteo (o a la pantalla de carga).
 */
function siguienteColumnas() {
  enColumnas = porConfirmar.shift() || null;
  corrigiendo = -1;

  if (!enColumnas) {
    $("secColumnas").hidden = true;
    if (sesion) abrirConteo();
    else { $("secCargar").hidden = false; renderPendientes(); }
    return;
  }

  mapaColumnas = columnasPropuestas(enColumnas);
  abrirColumnas();
}

/**
 * Abre la pantalla de columnas de una factura ya cargada, para corregirla
 * sin perder lo que se lleva contado.
 * @param {number} fi - Número de factura dentro de la revisión.
 */
function corregirColumnas(fi) {
  const f = sesion.facturas[fi];
  if (!f.filas) {
    alert("Esta revisión se empezó con una versión anterior de la app y no guardó las columnas del XML. Vuelve a cargar la factura para poder cambiarlas.");
    return;
  }
  corrigiendo = fi;
  enColumnas = { ...f, columnas: f.columnas, filas: f.filas };
  mapaColumnas = { ...f.mapa };
  abrirColumnas();
}

/** Pinta y muestra la pantalla de columnas. */
function abrirColumnas() {
  $("secCargar").hidden = true;
  $("secContar").hidden = true;
  $("secColumnas").hidden = false;

  const pendientes = porConfirmar.length;
  $("tituloColumnas").textContent = `Columnas de ${enColumnas.proveedor}`;
  $("notaColumnas").textContent =
    `Factura ${enColumnas.folio || "sin folio"}. Revisa que cada dato venga de la columna correcta; ` +
    `se recuerda para las próximas facturas de este proveedor.` +
    (pendientes ? ` Faltan ${pendientes} factura(s) por revisar.` : "");
  $("btnOmitirFactura").textContent = corrigiendo >= 0 ? "Cancelar" : "Omitir esta factura";

  renderColumnas();
}

/** Pinta los selectores y la vista previa de la factura. */
function renderColumnas() {
  const cols = enColumnas.columnas;

  $("selectoresRecibo").innerHTML = CAMPOS_RECIBO.map((c) => `
    <label class="selector" style="--c:${c.color}">
      <span class="chip">${c.label}</span>
      <select data-columna="${c.key}" aria-label="Columna del XML para ${c.label}">
        <option value="">Elige una columna…</option>
        ${cols.map((col) =>
          `<option value="${esc(col)}" ${col === mapaColumnas[c.key] ? "selected" : ""}>${esc(col)}</option>`
        ).join("")}
      </select>
    </label>`).join("");

  // Vista previa: todas las columnas del XML, con las elegidas resaltadas
  const campoDe = (col) => CAMPOS_RECIBO.find((c) => mapaColumnas[c.key] === col);
  const filas = enColumnas.filas.slice(0, 12);

  const encabezado = `<thead><tr><th class="idx">#</th>${cols.map((col) => {
    const c = campoDe(col);
    return `<th>${c ? `<span class="chip" style="--c:${c.color}">${c.label}</span>` : ""}${esc(col)}</th>`;
  }).join("")}</tr></thead>`;

  const cuerpo = `<tbody>${filas.map((fila, i) => `<tr><td class="idx">${i + 1}</td>${cols.map((col) => {
    const c = campoDe(col);
    return `<td${c ? ` style="background:${c.color}22"` : ""}>${esc(fila[col])}</td>`;
  }).join("")}</tr>`).join("")}</tbody>`;

  $("tablaVista").innerHTML = encabezado + cuerpo;
}

/** Cambia a la pantalla de conteo. */
function abrirConteo() {
  $("secCargar").hidden = true;
  $("secColumnas").hidden = true;
  $("secContar").hidden = false;
  enfocarEscaneo();
  render();
}

/** Regresa a la pantalla de carga (el conteo queda guardado). */
function cerrarConteo() {
  sesion = null;
  facturaVista = "todas";
  $("secContar").hidden = true;
  $("secCargar").hidden = false;
  $("avisosConteo").innerHTML = "";
  renderPendientes();
}

/**
 * Pone el cursor en el recuadro de escaneo **sin mover la página**.
 * Sin `preventScroll` el navegador salta hasta el recuadro cada vez,
 * que era justo la molestia al tocar cualquier botón de la lista.
 */
function enfocarEscaneo() {
  $("campoCodigo").focus({ preventScroll: true });
}

/* =========================================================
   ESCANEAR
   ========================================================= */

/**
 * Procesa un código leído por la pistola o tecleado.
 * @param {string} codigo
 */
function alEscanear(codigo) {
  const r = escanear(codigo);
  if (r.estado === "vacio") return;

  if (r.estado === "desconocido") {
    avisoError();
    abrirVentanaCodigo(codigo);
    return;
  }

  // El mismo artículo viene en más de una factura de la revisión
  if (r.estado === "varias") {
    sonar("aviso");
    abrirVentanaFactura(codigo, r.coincidencias);
    return;
  }

  avisoOk();
  const { fi, pi } = r.coincidencias[0];
  abrirVentanaCantidad(fi, pi, r.motivo);
}

/**
 * Muestra el resultado de la última lectura.
 * @param {string} texto
 * @param {"ok"|"malo"} clase
 */
function mostrarUltimo(texto, clase) {
  const el = $("ultimo");
  el.hidden = false;
  el.className = "ultimo " + clase;
  el.textContent = texto;
  $("anuncio").textContent = texto;
}

/* =========================================================
   VENTANAS (manejo común)
   ========================================================= */

/** Abre una ventana emergente y detiene el cursor automático del escaneo. */
function abrirVentana(id) {
  $(id).hidden = false;
  document.body.classList.add("con-ventana");
}

/** Cierra una ventana y regresa el cursor al recuadro de escaneo. */
function cerrarVentana(id) {
  $(id).hidden = true;
  document.body.classList.remove("con-ventana");
  enfocarEscaneo();
}

/** @returns {boolean} Si hay alguna ventana abierta. */
const hayVentana = () => document.body.classList.contains("con-ventana");

/** Etiqueta corta de una factura, para mostrarla junto a un artículo. */
const etiquetaFactura = (f) => `${f.proveedor} · ${f.folio || "sin folio"}`;

/* =========================================================
   VENTANA: CUÁNTAS PIEZAS LLEGARON
   ========================================================= */

/**
 * Pregunta cuántas piezas llegaron de un artículo.
 * El recuadro viene lleno con las que faltan, que es lo más común,
 * y con el texto seleccionado para poder teclear otra cantidad de inmediato.
 * @param {number} fi - Número de factura.
 * @param {number} pi - Número de partida.
 * @param {string} [motivo] - Cómo se reconoció el código.
 */
function abrirVentanaCantidad(fi, pi, motivo) {
  const f = sesion.facturas[fi];
  const p = f.partidas[pi];
  const faltan = Math.max(0, p.esperada - p.contada);
  enCantidad = { fi, pi };

  $("cantCodigo").textContent = p.codigo;
  $("cantDesc").textContent = p.descripcion;
  $("cantFact").textContent = etiquetaFactura(f);
  $("cantFactura").textContent = p.esperada;
  $("cantYa").textContent = p.contada;
  $("cantFaltan").textContent = faltan;
  $("campoCantidad").value = faltan || 1;

  $("tituloCantidad").textContent = motivo === "elegido"
    ? "¿Cuántas piezas llegaron?"
    : motivo === "equivalencia"
    ? "¿Cuántas piezas llegaron? (equivalencia guardada)"
    : motivo === "parecido"
      ? "¿Cuántas piezas llegaron? (código parecido)"
      : "¿Cuántas piezas llegaron?";

  abrirVentana("ventanaCantidad");
  $("campoCantidad").focus();
  $("campoCantidad").select();
}

/** Suma al conteo la cantidad escrita en la ventana. */
function confirmarCantidad() {
  if (!enCantidad) return;
  const cantidad = parseInt($("campoCantidad").value, 10);
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    avisoError();
    $("campoCantidad").focus();
    return;
  }

  const { fi, pi } = enCantidad;
  const p = contar(fi, pi, cantidad);
  ultima = { fi, pi };
  enCantidad = null;
  cerrarVentana("ventanaCantidad");

  const sobra = p.contada > p.esperada;
  const varias = sesion.facturas.length > 1;
  mostrarUltimo(
    `${p.codigo} · ${p.descripcion}` +
    (varias ? ` · ${sesion.facturas[fi].folio || "sin folio"}` : "") +
    ` — +${cantidad}, van ${p.contada} de ${p.esperada}` +
    (sobra ? ` (sobran ${p.contada - p.esperada})` : p.contada === p.esperada ? " (completo)" : ""),
    sobra ? "malo" : "ok"
  );
  if (sobra) avisoError();
  render();
}

/* =========================================================
   VENTANA: ¿DE QUÉ FACTURA?
   ========================================================= */

/**
 * El código aparece en más de una factura de la revisión: pregunta en cuál.
 * @param {string} codigo
 * @param {{fi:number,pi:number}[]} coincidencias
 */
function abrirVentanaFactura(codigo, coincidencias) {
  const p0 = partidaEn(coincidencias[0].fi, coincidencias[0].pi);
  $("dupCodigo").textContent = p0.codigo;
  $("dupDesc").textContent = p0.descripcion;

  $("opcionesFactura").innerHTML = coincidencias.map(({ fi, pi }) => {
    const f = sesion.facturas[fi];
    const p = f.partidas[pi];
    return `
      <button data-factura="${fi}" data-partida="${pi}">
        <span class="cod">${esc(f.folio || "sin folio")}</span>
        <span class="det">${esc(f.proveedor)} · faltan ${Math.max(0, p.esperada - p.contada)} de ${p.esperada}</span>
      </button>`;
  }).join("");

  abrirVentana("ventanaFactura");
}

/* =========================================================
   VENTANA: CÓDIGO NO RECONOCIDO
   ========================================================= */

/**
 * Abre la ventana para decir a qué artículo corresponde un código.
 * @param {string} codigo
 */
function abrirVentanaCodigo(codigo) {
  codigoPendiente = codigo;
  $("codigoLeido").textContent = codigo;
  $("buscarVentana").value = "";
  renderOpciones("");
  abrirVentana("ventana");
  $("buscarVentana").focus();
}

/**
 * Pinta los artículos de todas las facturas entre los que se puede elegir.
 * @param {string} texto - Filtro de búsqueda.
 */
function renderOpciones(texto) {
  const t = texto.trim().toLowerCase();
  const varias = sesion.facturas.length > 1;

  const lista = partidasPlanas()
    .filter(({ f, p }) => !t || `${p.codigo} ${p.descripcion} ${f.folio}`.toLowerCase().includes(t));

  $("opcionesVentana").innerHTML = lista.length
    ? lista.map(({ fi, pi, f, p }) => `
        <button data-factura="${fi}" data-partida="${pi}">
          <span class="cod">${esc(p.codigo)}</span>
          <span class="det">${esc(p.descripcion)} · faltan ${Math.max(0, p.esperada - p.contada)} de ${p.esperada}${
            varias ? ` · ${esc(f.folio || "sin folio")}` : ""}</span>
        </button>`).join("")
    : `<p class="nota">Ningún artículo coincide con la búsqueda.</p>`;
}

/* =========================================================
   VENTANA: NOTA
   ========================================================= */

/**
 * Abre la ventana de nota de un artículo de una factura.
 * @param {number} fi
 * @param {number} pi
 */
function abrirNotaPartida(fi, pi) {
  const p = partidaEn(fi, pi);
  enNota = { fi, pi };
  $("notaCodigo").textContent = p.codigo;
  $("notaDesc").textContent = p.descripcion;
  $("campoNota").value = p.nota || "";
  abrirVentana("ventanaNota");
  $("campoNota").focus();
}

/**
 * Abre la ventana de nota de un código que no viene en ninguna factura.
 * @param {string} codigo
 */
function abrirNotaSobrante(codigo) {
  enNota = { codigo };
  $("notaCodigo").textContent = codigo;
  $("notaDesc").textContent = "No viene en ninguna factura";
  $("campoNota").value = sesion.sobrantes[codigo]?.nota || "";
  abrirVentana("ventanaNota");
  $("campoNota").focus();
}

/**
 * Guarda (o borra) la nota que se está editando.
 * @param {string} texto
 */
function guardarNota(texto) {
  if (!enNota) return;
  if (enNota.codigo !== undefined) anotarSobrante(enNota.codigo, texto);
  else anotarPartida(enNota.fi, enNota.pi, texto);
  enNota = null;
  cerrarVentana("ventanaNota");
  render();
}

/* =========================================================
   PINTAR PANTALLA
   ========================================================= */

/** Redibuja todo el conteo. */
function render() {
  if (!sesion) return;
  const r = resumen();
  const n = sesion.facturas.length;

  $("provConteo").textContent = n === 1
    ? sesion.facturas[0].proveedor
    : `Revisión de ${n} facturas`;
  $("datosConteo").textContent = n === 1
    ? `${sesion.facturas[0].rfc} · Folio ${sesion.facturas[0].folio || "sin folio"} · ${sesion.facturas[0].fecha}`
    : [...new Set(sesion.facturas.map((f) => f.proveedor))].join(" · ");

  $("avance").style.width = r.avance + "%";
  $("marcador").innerHTML = `
    <div><b>${r.piezasContadas}</b><span>Contadas</span></div>
    <div><b>${r.piezasEsperadas}</b><span>De factura</span></div>
    <div class="listo"><b>${r.completas}</b><span>Artículos listos</span></div>
    <div class="falta"><b>${r.faltantes}</b><span>Faltan</span></div>
    <div class="sobra"><b>${r.sobran + r.sobrantes}</b><span>Sobran</span></div>`;

  renderFacturas();
  renderPartidas();
  renderSobrantes();
}

/** Pinta las pestañas de facturas cargadas (sirven para filtrar). */
function renderFacturas() {
  const n = sesion.facturas.length;
  const chips = sesion.facturas.map((f) => {
    const t = totalesFactura(f);
    return `
      <div class="chip-factura ${facturaVista === f.uuid ? "activo" : ""}">
        <button data-ver="${esc(f.uuid)}">
          <b>${esc(f.folio || "sin folio")}</b>
          <span>${esc(f.proveedor)}</span>
          <span class="cifras">${t.piezasContadas} de ${t.piezasEsperadas} piezas</span>
        </button>
        <button class="quitar" data-quitar-factura="${esc(f.uuid)}"
          aria-label="Quitar la factura ${esc(f.folio)} de la revisión">×</button>
        <button class="columnas-btn" data-columnas="${esc(f.uuid)}"
          title="Cambiar las columnas de esta factura" aria-label="Columnas de la factura ${esc(f.folio)}">⋮⋮</button>
      </div>`;
  }).join("");

  const todas = n > 1
    ? `<div class="chip-factura todas ${facturaVista === "todas" ? "activo" : ""}">
         <button data-ver="todas"><b>Todas</b><span>${n} facturas</span></button>
       </div>`
    : "";

  $("listaFacturasConteo").innerHTML = todas + chips;
}

/** Pinta la lista de artículos según la factura vista, el filtro y la búsqueda. */
function renderPartidas() {
  const t = busqueda.trim().toLowerCase();
  const varias = sesion.facturas.length > 1;

  const visibles = partidasPlanas().filter(({ f, p }) => {
    if (facturaVista !== "todas" && f.uuid !== facturaVista) return false;
    if (t && !`${p.codigo} ${p.descripcion}`.toLowerCase().includes(t)) return false;
    if (filtro === "pendientes") return p.contada < p.esperada;
    if (filtro === "completas") return p.contada === p.esperada;
    if (filtro === "diferencias") return p.contada !== p.esperada;
    return true;
  });

  $("listaPartidas").innerHTML = visibles.length
    ? visibles.map(({ fi, pi, f, p }) => `
        <div class="partida ${estadoPartida(p)}${ultima && ultima.fi === fi && ultima.pi === pi ? " nueva" : ""}">
          <button class="datos" data-elegir-art="${fi}:${pi}"
            aria-label="Contar ${esc(p.codigo)}: ${esc(p.descripcion)}" title="Tócalo para anotar cuántas piezas llegaron">
            <span class="codigo">${esc(p.codigo)}</span>
            <span class="desc">${esc(p.descripcion)}</span>
            ${varias ? `<span class="etiqueta-factura">${esc(etiquetaFactura(f))}</span>` : ""}
            ${p.nota ? `<span class="nota-art">Nota: ${esc(p.nota)}</span>` : ""}
          </button>
          <div class="cuenta">${p.contada}<small> / ${p.esperada}</small></div>
          <div class="mas-menos">
            <button data-menos="${fi}:${pi}" aria-label="Quitar una pieza de ${esc(p.codigo)}">−</button>
            <button data-mas="${fi}:${pi}" aria-label="Agregar una pieza de ${esc(p.codigo)}">+</button>
            <button class="nota-btn${p.nota ? " con-nota" : ""}" data-nota="${fi}:${pi}"
              aria-label="Nota de ${esc(p.codigo)}" title="Nota">✎</button>
          </div>
        </div>`).join("")
    : `<p class="vacio">No hay artículos que mostrar con este filtro.</p>`;

  ultima = null; // el destello solo se ve una vez
}

/** Pinta la mercancía que no viene en ninguna factura. */
function renderSobrantes() {
  const lista = Object.entries(sesion.sobrantes);
  $("cajaSobrantes").hidden = !lista.length;
  $("listaSobrantes").innerHTML = lista.map(([codigo, datos]) => `
    <div class="partida sobra">
      <div class="datos">
        <div class="codigo">${esc(codigo)}</div>
        <div class="desc">No aparece en ninguna factura</div>
        ${datos.nota ? `<div class="nota-art">Nota: ${esc(datos.nota)}</div>` : ""}
      </div>
      <div class="cuenta">${datos.piezas}</div>
      <div class="mas-menos">
        <button data-sobra-menos="${esc(codigo)}" aria-label="Quitar una pieza de ${esc(codigo)}">−</button>
        <button data-sobra-mas="${esc(codigo)}" aria-label="Agregar una pieza de ${esc(codigo)}">+</button>
        <button class="nota-btn${datos.nota ? " con-nota" : ""}" data-sobra-nota="${esc(codigo)}"
          aria-label="Nota de ${esc(codigo)}" title="Nota">✎</button>
      </div>
    </div>`).join("");
}

/** Pinta las revisiones empezadas que se pueden continuar. */
function renderPendientes() {
  const lista = sesionesGuardadas();
  $("pendientes").hidden = !lista.length;
  $("listaPendientes").innerHTML = lista.map((s) => {
    const partidas = s.facturas.flatMap((f) => f.partidas);
    const contadas = partidas.reduce((a, p) => a + p.contada, 0);
    const esperadas = partidas.reduce((a, p) => a + p.esperada, 0);
    const proveedores = [...new Set(s.facturas.map((f) => f.proveedor))].join(", ");
    return `
      <div class="factura">
        <button class="factura-sel" data-continuar="${esc(s.id)}">
          <strong>${esc(proveedores)}</strong>
          <span>${s.facturas.length} factura(s): ${esc(s.facturas.map((f) => f.folio || "sin folio").join(", "))}</span>
          <span class="cuenta">${contadas} de ${esperadas} piezas contadas</span>
        </button>
        <button class="quitar" data-borrar="${esc(s.id)}" aria-label="Borrar esta revisión">×</button>
      </div>`;
  }).join("");
}

/* =========================================================
   EVENTOS
   ========================================================= */

// --- cargar XML (pantalla inicial y botón de agregar) ---
const alElegirArchivos = (e) => {
  cargarFacturas([...e.target.files]);
  e.target.value = "";
};
$("entrada").addEventListener("change", alElegirArchivos);
$("entradaMas").addEventListener("change", alElegirArchivos);

$("zona").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("entrada").click(); }
});
$("btnAgregarFactura").addEventListener("click", () => $("entradaMas").click());

["dragenter", "dragover"].forEach((ev) =>
  document.addEventListener(ev, (e) => { e.preventDefault(); $("zona").classList.add("encima"); }));
["dragleave", "drop"].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop" || !e.relatedTarget) $("zona").classList.remove("encima");
  }));
document.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) cargarFacturas([...e.dataTransfer.files]);
});

// --- continuar o borrar una revisión empezada ---
$("listaPendientes").addEventListener("click", (e) => {
  const borrar = e.target.closest("[data-borrar]");
  if (borrar) {
    if (confirm("¿Borrar esta revisión y su conteo?")) {
      borrarSesion(borrar.dataset.borrar);
      renderPendientes();
    }
    return;
  }
  const seguir = e.target.closest("[data-continuar]");
  if (seguir) {
    sesion = cargarSesion(seguir.dataset.continuar);
    if (sesion) abrirConteo();
  }
});

// --- pestañas de facturas ---
$("listaFacturasConteo").addEventListener("click", (e) => {
  const columnas = e.target.closest("[data-columnas]");
  if (columnas) {
    return corregirColumnas(sesion.facturas.findIndex((f) => f.uuid === columnas.dataset.columnas));
  }

  const quitar = e.target.closest("[data-quitar-factura]");
  if (quitar) {
    const f = sesion.facturas.find((x) => x.uuid === quitar.dataset.quitarFactura);
    if (!confirm(`¿Quitar la factura ${f.folio || "sin folio"} de ${f.proveedor} y su conteo?`)) return;
    quitarFactura(f.uuid);
    if (facturaVista === f.uuid) facturaVista = "todas";
    if (!sesion.facturas.length) { borrarSesion(sesion.id); return cerrarConteo(); }
    render();
    return;
  }
  const ver = e.target.closest("[data-ver]");
  if (ver) {
    facturaVista = ver.dataset.ver;
    render();
  }
});

// --- pantalla de columnas ---
$("selectoresRecibo").addEventListener("change", (e) => {
  const campo = e.target.dataset.columna;
  if (!campo) return;
  mapaColumnas[campo] = e.target.value;
  renderColumnas();
});

$("btnUsarColumnas").addEventListener("click", () => {
  if (!mapaColumnas.codigo || !mapaColumnas.cantidad) {
    alert("Elige al menos la columna del código y la de la cantidad.");
    return;
  }
  guardarColumnas(enColumnas.rfc, mapaColumnas);

  if (corrigiendo >= 0) {
    // Corrección de una factura ya cargada: se conserva lo contado
    aplicarColumnas(sesion.facturas[corrigiendo], { ...mapaColumnas });
    guardarSesion();
  } else if (!sesion) {
    sesion = crearSesion(enColumnas, { ...mapaColumnas });
    guardarSesion();
  } else {
    agregarFactura(enColumnas, { ...mapaColumnas });
  }
  siguienteColumnas();
});

$("btnOmitirFactura").addEventListener("click", siguienteColumnas);

// --- escaneo con pistola o tecleado ---
conectarPistola($("campoCodigo"), alEscanear);

// --- botones +, − y nota de cada artículo ---
const leerIndices = (valor) => {
  const [fi, pi] = valor.split(":").map(Number);
  return { fi, pi };
};

$("listaPartidas").addEventListener("click", (e) => {
  // Tocar el artículo abre la ventana de cantidad, sin escanear ni teclear
  const elegir = e.target.closest("[data-elegir-art]");
  if (elegir) {
    const { fi, pi } = leerIndices(elegir.dataset.elegirArt);
    avisoOk();
    return abrirVentanaCantidad(fi, pi, "elegido");
  }

  const nota = e.target.closest("[data-nota]");
  if (nota) {
    const { fi, pi } = leerIndices(nota.dataset.nota);
    return abrirNotaPartida(fi, pi);
  }

  const mas = e.target.closest("[data-mas]");
  const menos = e.target.closest("[data-menos]");
  if (!mas && !menos) return;
  const { fi, pi } = leerIndices((mas || menos).dataset[mas ? "mas" : "menos"]);
  contar(fi, pi, mas ? 1 : -1);
  render();
});

$("listaSobrantes").addEventListener("click", (e) => {
  const nota = e.target.closest("[data-sobra-nota]");
  if (nota) return abrirNotaSobrante(nota.dataset.sobraNota);

  const mas = e.target.closest("[data-sobra-mas]");
  const menos = e.target.closest("[data-sobra-menos]");
  if (!mas && !menos) return;
  contarSobrante((mas || menos).dataset[mas ? "sobraMas" : "sobraMenos"], mas ? 1 : -1);
  render();
});

// --- filtros y búsqueda ---
document.querySelectorAll(".chip-filtro").forEach((b) =>
  b.addEventListener("click", () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll(".chip-filtro").forEach((x) => x.classList.toggle("activo", x === b));
    renderPartidas();
  }));

$("buscar").addEventListener("input", (e) => {
  busqueda = e.target.value;
  renderPartidas();
});

// --- ventana de cantidad ---
$("btnConfirmarCant").addEventListener("click", confirmarCantidad);
$("btnCancelarCant").addEventListener("click", () => {
  enCantidad = null;
  cerrarVentana("ventanaCantidad");
});
$("campoCantidad").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); confirmarCantidad(); }
});
$("btnMasCant").addEventListener("click", () => {
  $("campoCantidad").value = Math.max(0, (parseInt($("campoCantidad").value, 10) || 0) + 1);
  $("campoCantidad").focus();
});
$("btnMenosCant").addEventListener("click", () => {
  $("campoCantidad").value = Math.max(0, (parseInt($("campoCantidad").value, 10) || 0) - 1);
  $("campoCantidad").focus();
});

// --- ventana de "¿de qué factura?" ---
$("opcionesFactura").addEventListener("click", (e) => {
  const b = e.target.closest("[data-factura]");
  if (!b) return;
  cerrarVentana("ventanaFactura");
  abrirVentanaCantidad(Number(b.dataset.factura), Number(b.dataset.partida));
});
$("btnCancelarFactura").addEventListener("click", () => cerrarVentana("ventanaFactura"));

// --- ventana de código no reconocido ---
$("buscarVentana").addEventListener("input", (e) => renderOpciones(e.target.value));

$("opcionesVentana").addEventListener("click", (e) => {
  const b = e.target.closest("[data-factura]");
  if (!b) return;
  const fi = Number(b.dataset.factura);
  const pi = Number(b.dataset.partida);
  guardarAlias(sesion.facturas[fi].rfc, codigoPendiente, partidaEn(fi, pi).codigo);
  codigoPendiente = "";
  cerrarVentana("ventana");
  abrirVentanaCantidad(fi, pi, "equivalencia"); // ahora sí, cuántas piezas llegaron
});

$("btnNoEsta").addEventListener("click", () => {
  const c = codigoPendiente;
  const cantidad = parseInt(prompt(`¿Cuántas piezas llegaron de ${c}?`, "1"), 10);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return;
  contarSobrante(c, cantidad);
  codigoPendiente = "";
  cerrarVentana("ventana");
  mostrarUltimo(`${c}: ${cantidad} pieza(s) apartadas como mercancía que no viene en ninguna factura`, "malo");
  render();
});

$("btnCancelar").addEventListener("click", () => {
  codigoPendiente = "";
  cerrarVentana("ventana");
});

// --- ventana de nota ---
$("btnGuardarNota").addEventListener("click", () => guardarNota($("campoNota").value));
$("btnBorrarNota").addEventListener("click", () => guardarNota(""));
$("btnCancelarNota").addEventListener("click", () => {
  enNota = null;
  cerrarVentana("ventanaNota");
});

// --- cerrar ventanas con Escape ---
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !hayVentana()) return;
  ["ventana", "ventanaCantidad", "ventanaNota", "ventanaFactura"].forEach((id) => ($(id).hidden = true));
  document.body.classList.remove("con-ventana");
  enCantidad = enNota = null;
  codigoPendiente = "";
  enfocarEscaneo();
});

// --- reportes ---
$("btnPdf").addEventListener("click", () => {
  descargarBlob(crearPdfReporte(), nombreReporte() + ".pdf");
});

$("btnReporte").addEventListener("click", () => {
  descargarBlob(crearExcelReporte(), nombreReporte() + ".xlsx");
});

$("btnCopiarReporte").addEventListener("click", async () => {
  const texto = textoReporte();
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const b = $("btnCopiarReporte");
  b.textContent = "Copiado";
  setTimeout(() => (b.textContent = "Copiar reporte"), 1600);
});

// --- cerrar y reiniciar ---
$("btnCerrar").addEventListener("click", cerrarConteo);

$("btnReiniciar").addEventListener("click", () => {
  if (!confirm("¿Poner todos los conteos en cero? Las facturas y las notas se conservan.")) return;
  sesion.facturas.forEach((f) => f.partidas.forEach((p) => (p.contada = 0)));
  sesion.sobrantes = {};
  guardarSesion();
  $("ultimo").hidden = true;
  render();
});

/* =========================================================
   ARRANQUE
   ========================================================= */

renderPendientes();
