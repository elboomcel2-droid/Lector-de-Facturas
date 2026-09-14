/**
 * @file campos.js
 * @description Define qué columnas se pueden extraer de las facturas
 * (el "catálogo") y cuáles están activas. El usuario puede agregar o quitar
 * columnas desde la pantalla; la lista activa se guarda en el navegador.
 *
 * Depende de: nada (solo localStorage del navegador).
 * Lo usan: cfdi.js, exportar.js y app.js.
 */

/**
 * Definición de una columna que se puede extraer.
 * @typedef {Object} Campo
 * @property {string}   key        - Identificador interno único (ej. "codigo").
 * @property {string}   label      - Nombre que ve el usuario y que sale en el encabezado exportado.
 * @property {string[]} def        - Atributos del XML que se buscan por defecto; se usa el primero que exista.
 * @property {"texto"|"numero"|"dinero"|"porcentaje"} tipo - Define alineación, formato y exportación.
 * @property {string}   color      - Color (hex) con que se resalta la columna en pantalla.
 * @property {boolean}  [calculado] - true si NO viene del XML sino que se calcula (ver valorCalculado en cfdi.js).
 * @property {string}   [formula]  - Explicación del cálculo que se muestra en la tarjeta (solo calculados).
 */

/**
 * Columnas disponibles. El ORDEN de este arreglo es el orden en que se
 * acomodan en el resultado cuando el usuario las agrega.
 * Para ofrecer una columna nueva, agrégala aquí.
 * @type {Campo[]}
 */
const CATALOGO = [
  { key: "codigo",      label: "Código",          def: ["NoIdentificacion"],       tipo: "texto",  color: "#FFCE00" },
  { key: "descripcion", label: "Descripción",     def: ["Descripcion"],            tipo: "texto",  color: "#7FA7C4" },
  { key: "claveSat",    label: "Clave SAT",       def: ["ClaveProdServ"],          tipo: "texto",  color: "#B8B060" },
  { key: "cantidad",    label: "Cantidad",        def: ["Cantidad"],               tipo: "numero", color: "#C98BD9" },
  { key: "unidad",      label: "Unidad",          def: ["Unidad", "ClaveUnidad"],  tipo: "texto",  color: "#6CC5B0" },
  { key: "precio",      label: "Precio unitario", def: ["ValorUnitario"],          tipo: "dinero", color: "#8DBB5A" },
  { key: "descuento",   label: "Descuento",       def: ["Descuento"],              tipo: "dinero", color: "#D97A8A" },
  { key: "descuentoPct", label: "Descuento %",    def: [], calculado: true, tipo: "porcentaje", color: "#F08C6C",
    formula: "Se calcula en cada partida: Descuento ÷ Importe × 100. Si la partida no trae descuento, sale 0 %." },
  { key: "importe",     label: "Importe",         def: ["Importe"],                tipo: "dinero", color: "#E39B5A" },
  { key: "pedimento",   label: "Pedimento",       def: ["NumeroPedimento"],        tipo: "texto",  color: "#A0A0C8" },
];

/** Columnas activas la primera vez que se abre la app (o si se borra el navegador). */
const CAMPOS_INICIALES = ["codigo", "descripcion", "precio"];

/** Colores que se van asignando a las columnas personalizadas ("Otra columna del XML…"). */
const COLORES_EXTRA = ["#E0C090", "#90C0E0", "#C0E090", "#E090B0"];

/** Clave de localStorage donde se guarda la lista de columnas activas. */
const CLAVE_CAMPOS = "lectorxml:campos";

/**
 * Columnas activas, en el orden en que salen en el resultado.
 * Es el "estado" de columnas de toda la app.
 * @type {Campo[]}
 */
let campos = cargarCampos();

/**
 * Lee del navegador la lista de columnas activas.
 * Las columnas del catálogo se toman del catálogo actual (por si su definición
 * cambió en una versión nueva); las personalizadas se usan tal cual se guardaron.
 * @returns {Campo[]} Columnas activas, o las iniciales si no hay nada guardado.
 */
function cargarCampos() {
  try {
    const guardados = JSON.parse(localStorage.getItem(CLAVE_CAMPOS));
    if (Array.isArray(guardados) && guardados.length) {
      return guardados.map((c) => CATALOGO.find((x) => x.key === c.key) || c);
    }
  } catch (e) { /* sin almacenamiento disponible: se usan las iniciales */ }
  return CAMPOS_INICIALES.map((k) => CATALOGO.find((c) => c.key === k));
}

/** Guarda en el navegador la lista actual de columnas activas. */
function guardarCampos() {
  try { localStorage.setItem(CLAVE_CAMPOS, JSON.stringify(campos)); } catch (e) {}
}

/**
 * Columnas del catálogo que todavía NO están activas.
 * Se usan para llenar el menú "Agregar columna".
 * @returns {Campo[]}
 */
const camposDisponibles = () => CATALOGO.filter((c) => !campos.some((a) => a.key === c.key));

/**
 * Activa una columna. Si es del catálogo, se inserta en su posición natural
 * (ej. Cantidad queda entre Descripción y Precio); si es personalizada, al final.
 * Después el usuario puede acomodarla arrastrando (ver ordenar.js).
 * @param {Campo} campo - Columna a agregar.
 */
function agregarCampo(campo) {
  const i = CATALOGO.findIndex((c) => c.key === campo.key);
  let pos = campos.length;
  if (i >= 0) {
    // Primera columna activa que en el catálogo va DESPUÉS de la nueva
    const siguiente = campos.findIndex((c) => CATALOGO.findIndex((x) => x.key === c.key) > i);
    if (siguiente >= 0) pos = siguiente;
  }
  campos.splice(pos, 0, campo);
  guardarCampos();
}

/**
 * Crea una columna personalizada para cualquier atributo del XML.
 * Si el nombre coincide con un atributo del XML (ej. "ClaveUnidad"),
 * se asigna automáticamente.
 * @param {string} nombre - Nombre que escribió el usuario.
 * @returns {Campo} Nueva columna de tipo texto.
 */
function crearCampoPersonalizado(nombre) {
  const extras = campos.filter((c) => c.key.startsWith("extra")).length;
  return {
    key: "extra" + Date.now(),
    label: nombre,
    def: [nombre],
    tipo: "texto",
    color: COLORES_EXTRA[extras % COLORES_EXTRA.length],
  };
}

/**
 * Desactiva una columna. Siempre debe quedar al menos una activa.
 * @param {string} key - Identificador de la columna a quitar.
 */
function quitarCampo(key) {
  if (campos.length <= 1) return;
  campos = campos.filter((c) => c.key !== key);
  guardarCampos();
}

/**
 * Cambia el orden completo de las columnas activas (se usa al soltar
 * una tarjeta que se arrastró). Si la lista no coincide con las columnas
 * activas, no hace nada.
 * @param {string[]} keys - Claves de las columnas en el nuevo orden.
 * @example ordenarCampos(["precio", "codigo", "descripcion"]);
 */
function ordenarCampos(keys) {
  const nuevo = keys.map((k) => campos.find((c) => c.key === k)).filter(Boolean);
  if (nuevo.length !== campos.length) return;
  campos = nuevo;
  guardarCampos();
}

/**
 * Mueve una columna una o más posiciones (se usa con las flechas del teclado).
 * @param {string} key - Clave de la columna.
 * @param {number} delta - -1 = a la izquierda, +1 = a la derecha.
 * @returns {number} Nueva posición de la columna (empieza en 0).
 */
function moverCampo(key, delta) {
  const i = campos.findIndex((c) => c.key === key);
  const j = Math.max(0, Math.min(campos.length - 1, i + delta));
  if (i < 0 || i === j) return i;
  const [campo] = campos.splice(i, 1);
  campos.splice(j, 0, campo);
  guardarCampos();
  return j;
}

/**
 * Decide qué atributo del XML le corresponde a una columna en una factura.
 * Prioridad: 1) lo que el usuario eligió antes para ese proveedor,
 *            2) el primer atributo de `def` que exista en la factura,
 *            3) "" (sin asignar; el usuario debe elegirlo).
 * @param {string[]} columnasXML - Atributos que trae la factura.
 * @param {Campo} campo - Columna a resolver.
 * @param {{mapa?: Object<string,string>}|null} guardado - Configuración guardada del proveedor.
 * @returns {string} Nombre del atributo del XML, o "".
 */
function columnaInicial(columnasXML, campo, guardado) {
  const g = guardado?.mapa?.[campo.key];
  if (g && columnasXML.includes(g)) return g;
  return (campo.def || []).find((d) => columnasXML.includes(d)) || "";
}
