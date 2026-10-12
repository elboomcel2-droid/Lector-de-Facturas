# Lector de facturas XML | El Boom Tractopartes

Dos pantallas que trabajan con el mismo XML del CFDI:

1. **Lector de facturas** (`index.html`): saca las partidas y las exporta a Excel.
2. **Revisión de mercancía** (`recibo.html`): cuenta con pistola de código de
   barras (o tocando el artículo en la lista) lo que llega del proveedor y lo
   compara contra **una o varias facturas** a la vez. Antes de contar muestra
   la factura y deja elegir de qué columna sale el código, la descripción y la
   cantidad. Saca el reporte en PDF (una sección por factura, con
   colores) o en Excel (con proveedor y folio en cada renglón).

El lector extrae por defecto código, descripción y precio unitario; se pueden
agregar o quitar columnas (cantidad, unidad, clave SAT, importe, descuento,
pedimento o cualquier otra del XML) y acomodarlas arrastrándolas.

Se puede usar de dos formas:

- **Rápido:** abre `index.html` con doble clic (no se instala).
- **Como app instalada:** súbela a un servidor con https (ej. GitHub Pages).
  Chrome o Edge muestran el botón "Instalar app"; en iPhone: Compartir >
  Agregar a pantalla de inicio. Instalada funciona también sin internet.

## Estructura

```
lector-facturas-xml/
├── index.html          Lector de facturas (estructura, sin estilos ni lógica)
├── recibo.html         Revisión de mercancía
├── manifest.webmanifest  Nombre, colores e íconos de la app instalada
├── sw.js               Service worker: instalación y uso sin internet
├── img/                Logo e íconos (192, 512 y maskable)
├── docs/               Documentación en Word: técnica, manual de usuario y mejoras
├── css/
│   ├── estilos.css     Colores, tipografía y diseño (variables en :root)
│   └── recibo.css      Estilos de la revisión de mercancía
└── js/
    ├── utilidades.js   Funciones pequeñas: $, esc, num, fmt
    ├── campos.js       Catálogo de columnas, agregar/quitar y su orden
    ├── cfdi.js         Lectura del XML y memoria por proveedor
    ├── xlsx.js         Generador de .xlsx sin librerías (ZIP + XML)
    ├── pdf.js          Generador de PDF sin librerías (Helvetica + WinAnsi)
    ├── plantilla.js    Plantilla "Partidas de compra" (Artículo, Cantidad, Costo)
    ├── exportar.js     Armado del resultado, copiar para Excel y CSV
    ├── app.js          Estado, pintado de pantalla y eventos
    ├── ordenar.js      Acomodar columnas arrastrando (mouse, táctil y teclado)
    ├── pwa.js          Registro del service worker y botón "Instalar app"
    ├── recibo-conteo.js   Motor del conteo, equivalencias de códigos y guardado
    ├── recibo-escaner.js  Pistola de escaneo, sonido y vibración
    ├── recibo-reporte.js   Reporte de la revisión en PDF y en Excel
    └── recibo-app.js      Pantalla y eventos de la revisión
```

Los scripts se cargan en ese orden en cada página y el orden importa:
cada archivo usa funciones de los anteriores. No se usan módulos (`import`)
para que funcione con doble clic sin servidor.

## Dónde cambiar cosas

- **Colores de la marca:** variables al inicio de `css/estilos.css`.
- **Columnas disponibles para agregar:** arreglo `CATALOGO` en `js/campos.js`.
  El orden del arreglo es el orden en que se acomodan en el resultado.
- **Columnas calculadas** (como "Descuento %"): se marcan con `calculado: true`
  en `CATALOGO` y su fórmula va en `valorCalculado` de `js/cfdi.js`.
- **Plantilla de Excel:** arreglo `PLANTILLA` en `js/plantilla.js`; cada entrada
  es una columna con su título, ancho y una función `valor(factura, fila)`.
- **Columnas de la revisión:** `CAMPOS_RECIBO` en `js/recibo-conteo.js`;
  se guardan por proveedor en `lectorxml:RFC`, igual que el lector.
- **Columnas de cada factura en la revisión:** `CAMPOS_RECIBO` y
  `columnasPropuestas()` en `js/recibo-conteo.js`; se guardan por RFC en
  `lectorxml:RFC`, compartidas con el lector de facturas.
- **Modelo de la revisión:** `sesion` en `js/recibo-conteo.js`: un arreglo de
  facturas, cada una con sus partidas. Una partida se identifica con `fi`
  (factura) y `pi` (partida).
- **Facturas en dólares:** `calcularTcFinal()` y `aPesos()` en `js/cfdi.js`;
  el tipo de cambio se corta a 4 decimales y el último usado se guarda en
  `lectorxml:tc`.
- **Colores del reporte PDF:** `clasificar()` en `js/recibo-reporte.js`
  (verde completo, azul revisar, rojo no llegó).
- **Equivalencias de códigos de barras:** `buscarPartida()` en `js/recibo-conteo.js`.
- **Tipos de CFDI aceptados:** `TIPOS_RECHAZADOS` en `js/cfdi.js` (se rechazan
  complementos de pago, traslados y nómina).
- **Orden de las columnas:** lo decide el usuario arrastrando (`js/ordenar.js`);
  se guarda con `ordenarCampos()` y `moverCampo()` de `js/campos.js`.
- **Columnas que salen al abrir por primera vez:** `CAMPOS_INICIALES` en `js/campos.js`.

## Qué se guarda en el navegador (localStorage)

- `lectorxml:campos`: las columnas activas.
- `lectorxml:RFC`: la columna del XML elegida para cada dato, por proveedor.
- `recibo:conteo:ID`: avance de una revisión (con todas sus facturas).
- `recibo:alias:RFC`: equivalencias entre códigos de barras y códigos de la factura.

Cada computadora guarda lo suyo.

## Al actualizar la app

El service worker siempre busca primero la versión más nueva en el servidor.
Si agregas un archivo nuevo, súmalo a `ARCHIVOS` en `sw.js` y cambia `VERSION`
(la actual es `lector-xml-v10`; la siguiente, `lector-xml-v11`) para que la copia sin internet también se actualice.
