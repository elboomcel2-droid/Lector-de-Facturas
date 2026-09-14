# Lector de facturas XML | El Boom Tractopartes

Extrae datos de las partidas de facturas CFDI (XML): por defecto código,
descripción y precio unitario. Puedes agregar o quitar columnas (cantidad,
unidad, clave SAT, importe, descuento, pedimento o cualquier otra del XML)
y acomodarlas arrastrándolas desde su nombre.

Se puede usar de dos formas:

- **Rápido:** abre `index.html` con doble clic (no se instala).
- **Como app instalada:** súbela a un servidor con https (ej. GitHub Pages).
  Chrome o Edge muestran el botón "Instalar app"; en iPhone: Compartir >
  Agregar a pantalla de inicio. Instalada funciona también sin internet.

## Estructura

```
lector-facturas-xml/
├── index.html          Estructura de la página (sin estilos ni lógica)
├── manifest.webmanifest  Nombre, colores e íconos de la app instalada
├── sw.js               Service worker: instalación y uso sin internet
├── img/                Logo e íconos (192, 512 y maskable)
├── docs/               Documentación en Word: técnica, manual de usuario y mejoras
├── css/
│   └── estilos.css     Colores, tipografía y diseño (variables en :root)
└── js/
    ├── utilidades.js   Funciones pequeñas: $, esc, num, fmt
    ├── campos.js       Catálogo de columnas, agregar/quitar y su orden
    ├── cfdi.js         Lectura del XML y memoria por proveedor
    ├── xlsx.js         Generador de .xlsx sin librerías (ZIP + XML)
    ├── plantilla.js    Plantilla "Partidas de compra" (Artículo, Cantidad, Costo)
    ├── exportar.js     Armado del resultado, copiar para Excel y CSV
    ├── app.js          Estado, pintado de pantalla y eventos
    ├── ordenar.js      Acomodar columnas arrastrando (mouse, táctil y teclado)
    └── pwa.js          Registro del service worker y botón "Instalar app"
```

Los scripts se cargan en ese orden en `index.html` y el orden importa:
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
- **Tipos de CFDI aceptados:** `TIPOS_RECHAZADOS` en `js/cfdi.js` (se rechazan
  complementos de pago, traslados y nómina).
- **Orden de las columnas:** lo decide el usuario arrastrando (`js/ordenar.js`);
  se guarda con `ordenarCampos()` y `moverCampo()` de `js/campos.js`.
- **Columnas que salen al abrir por primera vez:** `CAMPOS_INICIALES` en `js/campos.js`.

## Qué se guarda en el navegador (localStorage)

- `lectorxml:campos`: las columnas activas.
- `lectorxml:RFC`: la columna del XML elegida para cada dato, por proveedor.

Cada computadora guarda lo suyo.

## Al actualizar la app

El service worker siempre busca primero la versión más nueva en el servidor.
Si agregas un archivo nuevo, súmalo a `ARCHIVOS` en `sw.js` y cambia `VERSION`
(la actual es `lector-xml-v4`; la siguiente, `lector-xml-v5`) para que la copia sin internet también se actualice.
