/**
 * @file recibo-app.js
 * @description Pantalla y eventos de la revisión de mercancía.
 *
 * Flujo: se carga el XML de la factura, se cuenta la mercancía escaneando
 * (pistola o cámara) o con los botones + y −, y al final se saca el reporte
 * de diferencias.
 *
 * Depende de: utilidades.js, cfdi.js, xlsx.js, recibo-conteo.js, recibo-escaner.js.
 */

/** Filtro activo de la lista: todas | pendientes | completas | diferencias. */
let filtro = "todas";

/** Texto del buscador. */
let busqueda = "";

/** Índice de la última partida contada (para resaltarla un momento). */
let ultimoIndice = -1;

/** Código pendiente de identificar en la ventana. */
let codigoPendiente = "";

/* =========================================================
   CARGAR LA FACTURA
   ========================================================= */

/**
 * Lee el XML y abre la revisión.
 * @param {File} archivo
 */
async function cargarFactura(archivo) {
  if (!archivo) return;
  $("avisos").innerHTML = "";

  if (/\.pdf$/i.test(archivo.name)) return avisar(`${archivo.name}: es PDF. Usa el XML de la factura.`);
  if (!/\.xml$/i.test(archivo.name)) return avisar(`${archivo.name}: no es un archivo XML.`);

  try {
    const factura = leerCFDI(await archivo.text(), archivo.name);
    recepcion = crearRecepcion(factura);
    guardarConteo();
    abrirConteo();
  } catch (e) {
    avisar(`${archivo.name}: ${e.message}.`);
  }
}

/** Muestra un aviso en rojo. */
function avisar(texto) {
  $("avisos").innerHTML = `<div class="aviso">${esc(texto)}</div>`;
}

/** Cambia a la pantalla de conteo. */
function abrirConteo() {
  $("secCargar").hidden = true;
  $("secContar").hidden = false;
  $("campoCodigo").focus();
  render();
}

/** Regresa a la pantalla de carga (el conteo queda guardado). */
function cerrarConteo() {
  apagarCamara($("video"));
  $("cajaCamara").hidden = true;
  recepcion = null;
  $("secContar").hidden = true;
  $("secCargar").hidden = false;
  renderPendientes();
}

/* =========================================================
   ESCANEAR
   ========================================================= */

/**
 * Procesa un código leído por la pistola, la cámara o tecleado.
 * @param {string} codigo
 */
function alEscanear(codigo) {
  const r = escanear(codigo);

  if (r.estado === "vacio") return;

  if (r.estado === "desconocido") {
    avisoError();
    abrirVentana(codigo);
    return;
  }

  avisoOk();
  ultimoIndice = r.indice;
  const p = r.partida;
  const sobra = p.contada > p.esperada;
  mostrarUltimo(
    `${p.codigo}: ${p.contada} de ${p.esperada}` +
    (sobra ? ` — sobran ${p.contada - p.esperada}` : p.contada === p.esperada ? " — completo" : "") +
    (r.motivo === "equivalencia" ? " (por equivalencia guardada)" : r.motivo === "parecido" ? " (código parecido)" : ""),
    sobra ? "malo" : "ok"
  );
  if (sobra) avisoError();
  render();
}

/**
 * Muestra el resultado del último escaneo.
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
   VENTANA: CÓDIGO NO RECONOCIDO
   ========================================================= */

/**
 * Abre la ventana para decir a qué artículo corresponde un código.
 * @param {string} codigo
 */
function abrirVentana(codigo) {
  codigoPendiente = codigo;
  $("codigoLeido").textContent = codigo;
  $("buscarVentana").value = "";
  $("ventana").hidden = false;
  document.body.classList.add("con-ventana");
  renderOpciones("");
  $("buscarVentana").focus();
}

/** Cierra la ventana y regresa el cursor al recuadro de escaneo. */
function cerrarVentana() {
  $("ventana").hidden = true;
  document.body.classList.remove("con-ventana");
  codigoPendiente = "";
  $("campoCodigo").focus();
}

/**
 * Pinta los artículos entre los que se puede elegir.
 * @param {string} texto - Filtro de búsqueda.
 */
function renderOpciones(texto) {
  const t = texto.trim().toLowerCase();
  const lista = recepcion.partidas
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !t || `${p.codigo} ${p.descripcion}`.toLowerCase().includes(t));

  $("opcionesVentana").innerHTML = lista.length
    ? lista.map(({ p, i }) => `
        <button data-elegir="${i}">
          <span class="cod">${esc(p.codigo)}</span>
          <span class="det">${esc(p.descripcion)} · faltan ${Math.max(0, p.esperada - p.contada)} de ${p.esperada}</span>
        </button>`).join("")
    : `<p class="nota">Ningún artículo coincide con la búsqueda.</p>`;
}

/* =========================================================
   PINTAR PANTALLA
   ========================================================= */

/** Redibuja todo el conteo. */
function render() {
  if (!recepcion) return;
  const r = resumen();

  $("provConteo").textContent = recepcion.proveedor;
  $("datosConteo").textContent =
    `${recepcion.rfc} · Folio ${recepcion.folio || "sin folio"} · ${recepcion.fecha} · ${recepcion.partidas.length} artículos`;

  $("avance").style.width = r.avance + "%";
  $("marcador").innerHTML = `
    <div><b>${r.piezasContadas}</b><span>Contadas</span></div>
    <div><b>${r.piezasEsperadas}</b><span>De factura</span></div>
    <div class="listo"><b>${r.completas}</b><span>Artículos listos</span></div>
    <div class="falta"><b>${r.faltantes}</b><span>Faltan</span></div>
    <div class="sobra"><b>${r.sobran + r.sobrantes}</b><span>Sobran</span></div>`;

  renderPartidas();
  renderSobrantes();
}

/** Pinta la lista de artículos según el filtro y la búsqueda. */
function renderPartidas() {
  const t = busqueda.trim().toLowerCase();

  const visibles = recepcion.partidas
    .map((p, i) => ({ p, i, estado: estadoPartida(p) }))
    .filter(({ p, estado }) => {
      if (t && !`${p.codigo} ${p.descripcion}`.toLowerCase().includes(t)) return false;
      if (filtro === "pendientes") return p.contada < p.esperada;
      if (filtro === "completas") return p.contada === p.esperada;
      if (filtro === "diferencias") return p.contada !== p.esperada;
      return true;
    });

  $("listaPartidas").innerHTML = visibles.length
    ? visibles.map(({ p, i, estado }) => `
        <div class="partida ${estado}${i === ultimoIndice ? " nueva" : ""}">
          <div class="datos">
            <div class="codigo">${esc(p.codigo)}</div>
            <div class="desc">${esc(p.descripcion)}</div>
          </div>
          <div class="cuenta">${p.contada}<small> / ${p.esperada}</small></div>
          <div class="mas-menos">
            <button data-menos="${i}" aria-label="Quitar una pieza de ${esc(p.codigo)}">−</button>
            <button data-mas="${i}" aria-label="Agregar una pieza de ${esc(p.codigo)}">+</button>
          </div>
        </div>`).join("")
    : `<p class="vacio">No hay artículos que mostrar con este filtro.</p>`;

  ultimoIndice = -1; // el destello solo se ve una vez
}

/** Pinta la mercancía que no viene en la factura. */
function renderSobrantes() {
  const lista = Object.entries(recepcion.sobrantes);
  $("cajaSobrantes").hidden = !lista.length;
  $("listaSobrantes").innerHTML = lista.map(([codigo, n]) => `
    <div class="partida sobra">
      <div class="datos">
        <div class="codigo">${esc(codigo)}</div>
        <div class="desc">No aparece en la factura</div>
      </div>
      <div class="cuenta">${n}</div>
      <div class="mas-menos">
        <button data-sobra-menos="${esc(codigo)}" aria-label="Quitar una pieza de ${esc(codigo)}">−</button>
        <button data-sobra-mas="${esc(codigo)}" aria-label="Agregar una pieza de ${esc(codigo)}">+</button>
      </div>
    </div>`).join("");
}

/** Pinta las revisiones empezadas que se pueden continuar. */
function renderPendientes() {
  const lista = recepcionesGuardadas();
  $("pendientes").hidden = !lista.length;
  $("listaPendientes").innerHTML = lista.map((rec) => {
    const contadas = rec.partidas.reduce((s, p) => s + p.contada, 0);
    const esperadas = rec.partidas.reduce((s, p) => s + p.esperada, 0);
    return `
      <div class="factura">
        <button class="factura-sel" data-continuar="${esc(rec.uuid)}">
          <strong>${esc(rec.proveedor)}</strong>
          <span>Folio ${esc(rec.folio || "sin folio")}, ${esc(rec.fecha)}</span>
          <span class="cuenta">${contadas} de ${esperadas} piezas contadas</span>
        </button>
        <button class="quitar" data-borrar="${esc(rec.uuid)}" aria-label="Borrar revisión de ${esc(rec.proveedor)}">×</button>
      </div>`;
  }).join("");
}

/* =========================================================
   REPORTE
   ========================================================= */

/** Renglones del reporte: artículos con su diferencia, y al final los sobrantes. */
function filasReporte() {
  const filas = recepcion.partidas.map((p) => {
    const dif = p.contada - p.esperada;
    return [
      p.codigo,
      p.descripcion,
      String(p.esperada),
      String(p.contada),
      dif === 0 ? "0" : (dif > 0 ? "+" : "") + dif,
      dif === 0 ? "Correcto" : dif < 0 ? "Faltante" : "Sobrante",
    ];
  });

  for (const [codigo, n] of Object.entries(recepcion.sobrantes)) {
    filas.push([codigo, "No viene en la factura", "0", String(n), "+" + n, "No facturado"]);
  }
  return filas;
}

const ENCABEZADOS_REPORTE = ["Artículo", "Descripción", "Factura", "Contado", "Diferencia", "Estado"];

/** Nombre del archivo del reporte. */
const nombreReporte = () =>
  `revision_${recepcion.rfc}_${recepcion.folio || "factura"}`.replace(/\s+/g, "");

/* =========================================================
   EVENTOS
   ========================================================= */

// --- cargar el XML ---
$("entrada").addEventListener("change", (e) => {
  cargarFactura(e.target.files[0]);
  e.target.value = "";
});
$("zona").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("entrada").click(); }
});
["dragenter", "dragover"].forEach((ev) =>
  document.addEventListener(ev, (e) => { e.preventDefault(); $("zona").classList.add("encima"); }));
["dragleave", "drop"].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop" || !e.relatedTarget) $("zona").classList.remove("encima");
  }));
document.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length && !recepcion) cargarFactura(e.dataTransfer.files[0]);
});

// --- continuar o borrar una revisión empezada ---
$("listaPendientes").addEventListener("click", (e) => {
  const borrar = e.target.closest("[data-borrar]");
  if (borrar) {
    if (confirm("¿Borrar esta revisión y su conteo?")) {
      borrarConteo(borrar.dataset.borrar);
      renderPendientes();
    }
    return;
  }
  const seguir = e.target.closest("[data-continuar]");
  if (seguir) {
    recepcion = cargarConteo(seguir.dataset.continuar);
    if (recepcion) abrirConteo();
  }
});

// --- escaneo con pistola o tecleado ---
conectarPistola($("campoCodigo"), alEscanear);

// --- botones + y − de cada artículo ---
$("listaPartidas").addEventListener("click", (e) => {
  const mas = e.target.closest("[data-mas]");
  const menos = e.target.closest("[data-menos]");
  if (!mas && !menos) return;
  contar(Number((mas || menos).dataset[mas ? "mas" : "menos"]), mas ? 1 : -1);
  render();
});

$("listaSobrantes").addEventListener("click", (e) => {
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

// --- ventana de código no reconocido ---
$("buscarVentana").addEventListener("input", (e) => renderOpciones(e.target.value));

$("opcionesVentana").addEventListener("click", (e) => {
  const b = e.target.closest("[data-elegir]");
  if (!b) return;
  const i = Number(b.dataset.elegir);
  guardarAlias(recepcion.rfc, codigoPendiente, recepcion.partidas[i].codigo);
  const p = contar(i, 1);
  ultimoIndice = i;
  cerrarVentana();
  avisoOk();
  mostrarUltimo(`${p.codigo}: ${p.contada} de ${p.esperada} — equivalencia guardada`, "ok");
  render();
});

$("btnNoEsta").addEventListener("click", () => {
  contarSobrante(codigoPendiente, 1);
  const c = codigoPendiente;
  cerrarVentana();
  mostrarUltimo(`${c}: apartado como mercancía que no viene en la factura`, "malo");
  render();
});

$("btnCancelar").addEventListener("click", cerrarVentana);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("ventana").hidden) cerrarVentana();
});

// --- cámara ---
$("btnCamara").addEventListener("click", async () => {
  try {
    $("cajaCamara").hidden = false;
    await encenderCamara($("video"), alEscanear);
    $("btnCamara").hidden = true;
  } catch (e) {
    $("cajaCamara").hidden = true;
    avisoError();
    mostrarUltimo("No se pudo usar la cámara: " + e.message, "malo");
  }
});

$("btnApagarCamara").addEventListener("click", () => {
  apagarCamara($("video"));
  $("cajaCamara").hidden = true;
  $("btnCamara").hidden = false;
  $("campoCodigo").focus();
});

// --- reporte ---
$("btnReporte").addEventListener("click", () => {
  const blob = crearXlsx({
    hoja: "Revisión",
    encabezados: ENCABEZADOS_REPORTE,
    anchos: [18, 46, 10, 10, 11, 12],
    filas: filasReporte(),
  });
  descargarBlob(blob, nombreReporte() + ".xlsx");
});

$("btnCopiarReporte").addEventListener("click", async () => {
  const texto = [ENCABEZADOS_REPORTE, ...filasReporte()]
    .map((f) => f.map((v) => String(v).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
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
  if (!confirm("¿Poner todos los conteos en cero? La factura se queda cargada.")) return;
  recepcion.partidas.forEach((p) => (p.contada = 0));
  recepcion.sobrantes = {};
  guardarConteo();
  $("ultimo").hidden = true;
  render();
});

/* =========================================================
   ARRANQUE
   ========================================================= */

(async function iniciar() {
  renderPendientes();
  // El botón de cámara solo aparece si el dispositivo puede usarla
  if (hayLectorDeCamara() && (await hayCamara())) $("btnCamara").hidden = false;
})();
