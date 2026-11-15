# Briefing de reestructuración — Allpa Essence

Creado 2026-11-15 por front. Carpeta de trabajo: `web/landings/allpaessence reestructuracion/` (copia de `allpaessence/`, sin `.git`). El original no se toca.
Referencia estudiada: elexirium.com (recorrido y verificado en vivo el 2026-11-15). Briefing de marca vigente: `web/negocios/allpaessence.txt` (v1-v4). Este documento **no lo reemplaza**: lo complementa.

---

## 0. Regla de oro de la reestructuración

**DECISIÓN DE PAUL (2026-11-15), reemplaza la versión anterior de esta sección:**
1. **La urgencia SE COPIA** (cuenta atrás, escasez de stock, actividad "viendo ahora", etiquetas de oferta por tiempo limitado). Paul la necesita para accionar ventas. Esto **anula** para esta reestructuración la línea del brief v1-v4 "cero temporizadores de urgencia inventados".
2. **La prueba social se construye con PLACEHOLDERS bien hechos**, no con contenido. Paul tiene las reseñas guardadas y las colocará él; front deja los slots, la estructura y el estado vacío/de carga listos para recibirlas. Front no inventa ni redacta reseñas, nombres ni cifras.

El resto de la regla se mantiene: copiar la **mecánica comercial** de Elexirium (claridad de oferta, fricción baja, confianza en cada paso). El filtro de marca del principio rector sigue vigente para estética y copy: *¿esto comunica calidad real y precio justo, o imita lujo aspiracional / clon barato de mercado?*

### Riesgo legal registrado (decisión informada, no bloqueante para front)
La escasez y la actividad "en vivo" que **no corresponden a datos reales** pueden considerarse publicidad engañosa (Ley 29571 Código de Protección y Defensa del Consumidor / INDECOPI). Mitigación propuesta por front, a decidir por Paul (§8): que la cuenta atrás apunte a una **fecha real** (el live o el fin de una promo real), y que stock y actividad salgan de **datos reales** (inventario real por diseño, contador de vistas real) en lugar de números aleatorios. El HTML de front es **neutral**: deja los slots `data-*` y quien los llena (js/backend) decide el origen del dato.

### Verificado en vivo en elexirium.com (base de las exclusiones)
- "N personas viendo" y "Quedan N unidades" son **aleatorios**: dos cargas seguidas de la misma ficha dieron 10/3 y 3/5. Es urgencia inventada.
- Cuenta atrás ("Termina en 11h 07m 31s") sobre una promo permanente (3x2 / "solo hoy"). No se pudo leer su código; se trata como urgencia perpetua.
- Cifras de confianza que no cuadran entre sí (4,8 con +2.000 opiniones, "+25.000 personas", "+2.500 pedidos").
- Nombre de la marca original en título y URL de producto, precio tachado contra el original, fragancias "de famosos".
- Fecha de entrega calculada en la ficha: **real y bien hecha** (se copia).

---

## 1. Qué SE COPIA (adaptado a Allpa)

| # | Mecánica de Elexirium | Adaptación Allpa |
|---|---|---|
| 1 | Barra de anuncio superior | Ya existe (`.utility-bar`). Se reestructura, ver §3.1 |
| 2 | Barra de reseñas bajo el header | Franja de valoración **solo con datos reales**. Vacía/oculta hasta tener reseñas, ver §3.2 |
| 3 | Buscador destacado en home | Bloque "Encuentra tu fragancia" por nombre o familia, ver §3.5 |
| 4 | Marquee (banda en movimiento) | Mensajes reales: live, envío, muestra. Nunca ofertas inventadas, ver §3.6 |
| 5 | Franja de 4 iconos de confianza | Reforzar el bloque `.valores` con datos reales, ver §3.9 |
| 6 | "Del laboratorio a tu casa" | Convertir `.journal` en "Del live a tu casa" (3 piezas verticales), ver §3.8 |
| 7 | Pestañas Más vendidos / Hombre / Mujer | Pestañas en `.trending`: Favoritos del live / Para él / Para ella / Unisex, ver §3.4 |
| 8 | Ficha: fecha de entrega concreta | "Pídelo hoy y recíbelo entre X e Y", ver §4.4 |
| 9 | Ficha: barra sticky de compra | Barra fija inferior con nombre, precio, tamaño y botón, ver §4.8 |
| 10 | Ficha: acordeón con datos de perfumería | Notas, concentración, duración, estación, uso, ver §4.6 |
| 11 | Ficha: "Inspírate con estas fragancias" | Relacionados por misma familia, ver §4.10 |
| 12 | Carrito lateral con barra de progreso | Ya hay drawer; se enriquece con hitos reales, ver §5 |
| 13 | Regalo físico como gancho | La muestra de regalo (encaja con el "sample-first") |
| 14 | Reseñas con foto del cliente, en 3 sitios | Estructura lista; **sin contenido falso**, ver §3.7 |
| 15 | Pagos locales anunciados arriba | Equivalente peruano (Yape/Plin/tarjeta vía Mercado Pago). Decisión de Paul/backend |

## 2. Qué NO se copia (y por qué)

- ~~Cuenta atrás, "solo hoy", "X personas viendo", "quedan N unidades"~~: **YA NO se excluyen** (decisión de Paul, ver §0). Se construyen, ver §3.1b, §4.7 y §5.3.
- Precio tachado contra el original, nombre de marca original en título/URL/alt, fragancias de famosos: riesgo INDECOPI y de derechos de imagen.
- Feromonas +18 y cualquier línea ajena a perfumería de nicho.
- Mezcla de estéticas (pastel, negro/rojo, blanco): rompe la regla "inconsistencia visual = alarma de fraude". Se mantiene la paleta 45/25/20/10.
- Cifras de reseñas o clientes infladas o sin respaldo.
- Densidad visual de Elexirium: la lección es la claridad de la oferta, no el número de elementos.

---

## 3. HOME (`index.html`) — qué reestructurar

Estado actual (bloques reales del HTML): utility-bar → header → hero → trending → promesa → split-banner → familia-carousel → journal → skincare-spotlight → valores → social-proof → muestras-promo → footer.

### 3.1 Promotional bar (`.utility-bar`) — VITAL
Hoy: 3 `<p>` rotativos ("EN VIVO HOY - 8:00 PM" / "Envíos a todo el Perú" / "Compra 100% segura"), sin enlace ni control.
- Hacer cada mensaje **accionable**: `<a>` con destino real (live → TikTok, envío → política de envío, compra segura → bloque de pago).
- Añadir controles accesibles: flechas prev/next y pausa (`aria-live="polite"`, respetar `prefers-reduced-motion`).
- Mensaje del live con **fecha/hora real y editable** (un solo lugar de edición), nunca un valor que "siempre es hoy".
- Mensaje de promo con **fecha de fin editable**. Placeholder `data-promo-pendiente`.
- Sin selector de país/moneda (corrección v3).
- Hereda a las 8 páginas: debe ser **idéntica** en todas (hoy está duplicada a mano en cada HTML).

### 3.1b Banner de campaña con cuenta atrás (nuevo, copiado de Elexirium)
- Banda oscura bajo el header: etiqueta de campaña + titular de oferta + `Termina en` con **horas / minutos / segundos** + botón "Comprar ahora".
- Marcado: `<section class="promo-banner" aria-label="Oferta">` con `<time class="promo-banner__countdown" data-countdown-end="[FECHA_FIN_PENDIENTE]">` y tres `<span data-cd="h|m|s">00</span>`. Sin JS muestra `00 00 00` y el botón sigue funcionando.
- Titular, tipo de oferta y fecha de fin: placeholders (`PROMO_TITULAR_PENDIENTE`, `PROMO_FECHA_FIN_PENDIENTE`). Paul define la oferta; front **no inventa** descuentos.
- Cuando la cuenta llega a 0, js oculta el banner (`hidden`). Patrón `.promo-banner[hidden]{display:none}` en css.
- Usa el acento naranja de la paleta (un solo punto de atención por vista); sin introducir rojo ni colores ajenos.

### 3.2 Barra de reseñas bajo el header (nuevo)
- Franja fina: estrellas + nota + nº de reseñas + sello "Verificadas".
- **Slot listo para datos que Paul coloca**: `data-rating`, `data-review-count`. Mientras estén vacíos, la franja queda `hidden`. Placeholder `RESENAS_PENDIENTE`. Front no escribe cifras.

### 3.3 Hero
- Mantener foto real y tagline eje ("Sin etiquetas, solo esencia").
- Añadir bajo el CTA una línea de **3 microbeneficios reales** (patrón "Envío 24/48h · Alta concentración · Larga duración"): solo los que Allpa pueda cumplir. Placeholder `MICROBENEFICIOS_PENDIENTE` hasta confirmar.
- Se conserva SIN hotspots "+" (decisión explícita del brief).

### 3.3 HERO BLANCO "tipo Elexirium" — AE-R4 ✅ (maqueta hecha; faltan los recortes de producto)
Decisión de Paul (2026-11-15): quitar la imagen plana de fondo, fondo **blanco**, y hacerlo "tal cual" Elexirium.
- **Cómo es el de Elexirium (verificado en el DOM):** UNA sola imagen ancha (PNG 3000×965, `.hero-bleed`, envuelta en un enlace) con titular, subtítulo, los dos grupos de 3 frascos, la pieza central y las etiquetas "PARA ÉL / PARA ELLA" **horneados dentro de la imagen**. Eso es mala práctica para SEO y accesibilidad.
- **Cómo lo hacemos nosotros:** mismo diseño pero con **texto HTML vivo** y solo las fotos como imagen: titular "Sin etiquetas, solo esencia" → subtítulo "Lujo que puedes hacer tuyo" → [grupo "Para él" · pieza central "Prueba primero tu esencia" → muestras · grupo "Para ella"] → microbeneficios → botón "Explorar fragancias". Reemplaza el hero oscuro anterior (clase `.hero` → `.hero-split`).
- **Fotos TEMPORALES:** los 6 frascos y la pieza central usan fotos de catálogo CON fondo. Para quedar igual que Elexirium se necesitan **recortes sin fondo** (PNG/WebP transparente): 3 frascos "para él", 3 "para ella" (misma escala, misma luz dura, tapa plata) y 1 pieza central (set de muestras / caja regalo). Ruta prevista: `assets/section-class-hero/`. Cuando existan, front sustituye los `<img>` y css quita los bordes/sombras de tarjeta.
- **Tensión con el posicionamiento unisex:** el brief v4 dice que el género es un filtro opcional del catálogo y nunca un gate. Este hero parte la home en "Para él / Para ella" como Elexirium. Los enlaces van a `catalogo.html?genero=para-el|para-ella` (filtro ya existente); no hay pantalla de selección previa, así que no bloquea nada. Falta decidir si se añade "Unisex".
- **No copiado:** "alta concentración / larga duración" (no confirmado), "Más de 25.000 personas confían" (cifra inventable): hueco `[data-trust-strip]` oculto hasta que Paul dé datos reales. El regalo por compra mínima de Elexirium se sustituyó por la muestra.
### 3.4 Trending / Favoritos
- Pestañas de filtro: Favoritos del live / Para él / Para ella / Unisex (mismo `data-genero` ya existente; hoy todo es `unisex` placeholder).
- Tarjeta de producto con: foto, nombre, familia olfativa, precio (S/.), valoración (oculta si no hay reseñas), botón "Añadir" y acceso "Probar muestra".
- Botón "Ver todo" al catálogo.

### 3.5 Buscador destacado (nuevo)
- Bloque entre hero y trending: "Encuentra tu fragancia" (campo + atajos por familia).
- Busca por **nombre propio o familia**, nunca por marca original (riesgo legal): el placeholder del campo no debe sugerir marcas de lujo.
- Marcado: `<form role="search">`, sin lógica en HTML (js).

### 3.6 Marquee (nuevo, opcional)
- Banda de mensajes cortos reales entre secciones. Separador visual, no sección de oferta. Respeta `prefers-reduced-motion`.

### 3.7 Prueba social (`.social-proof`)
- Estructura: media + carrusel de reseñas con foto, "Verificado", fecha, nombre y producto.
- **Placeholders bien hechos para las reseñas guardadas de Paul.** Cada tarjeta es una plantilla completa y lista para pegar: `<article class="review-card">` con `.review-card__photo` (slot de imagen con `width`/`height` reservados y `alt` descriptivo), `.review-card__stars` (`data-stars`), `.review-card__text`, `.review-card__author`, `.review-card__verified`, `.review-card__product`, `<time>`. 6 tarjetas placeholder en el carrusel (mismo contrato `data-carousel="reseñas"` que el resto). Ningún texto simulado: solo etiquetas tipo `[RESEÑA_TEXTO]`, `[RESEÑA_AUTOR]`.
- Más una **plantilla `<template id="review-card-tpl">`** para que js las genere desde un JSON si Paul prefiere cargar las reseñas desde `data/resenas.json`.
- Un `README` corto en la carpeta (o comentario en el bloque) explica a Paul cómo pegar una reseña: qué campos hay y qué tamaño de foto usar (cuadrada, 600×600).
- Estado vacío elegante mientras no estén cargadas (no relleno).
- Capturas/clips del live y respuestas reales de WhatsApp (señal de "personas reales detrás").
- Repetir un resumen corto en la ficha (ver §4.9).

### 3.8 Journal → "Del live a tu casa"
- 3 piezas verticales (apertura de caja, empaquetado, el live) en lugar del collage de 2 fotos.
- Mantiene la 2ª CTA "Ver Skincare / Próximamente" del brief v4.
- Placeholders de foto/video claros mientras no existan los assets.

### 3.9 Valores / confianza (`.valores`)
- Pasar de 3 a **4 iconos** con dato verificable: Envío (con plazo real), Pago seguro (Mercado Pago), Muestra antes de comprar, Cambios y devoluciones (con plazo real).
- Cada icono enlaza a su política. Hoy las políticas son placeholders → ver §7.

### 3.10 Categorías
- Mosaico por **familia olfativa** (no por género) enlazando al catálogo filtrado. Evitar duplicar la función del carrusel de familias (anti-patrón v2): decidir si el mosaico **reemplaza** al `.familia-carousel` o se descarta. **Decisión pendiente de Paul** (§8).

### 3.11 Skincare, muestras-promo
- Se conservan; ajustar solo coherencia visual y CTA. Skincare sigue como "Próximamente" mientras no haya catálogo real.

### 3.12 Footer
- Reorganizar a 4 columnas con políticas **visibles**: Atención al cliente (FAQ, contacto, envíos, cambios, muestras) / Catálogo / La marca / Newsletter.
- Fila de **medios de pago** reales (iconos de Mercado Pago, tarjetas, Yape/Plin si aplica).
- Aviso legal discreto: las fragancias son composiciones propias, sin relación con marcas comerciales (copy lo redacta/valida SEO/legal).
- Botón flotante de WhatsApp (contrato con js).

---

## 4. FICHA DE PRODUCTO (`producto.html`) — primer bloque a construir

Estado actual: sección `.product-detail` con foto única, familia, h1, descripción, precio, 3 notas y 2 specs en `<dl>`, fieldset de tamaño (Muestra / Tamaño completo), disclaimer de muestra y botón añadir. Notas/duración/intensidad son placeholders.

### 4.1 Galería
- De 1 foto a **galería** (foto principal + miniaturas): frasco, detalle de tapa, contexto de uso, caja. Mínimo 3 slots con `alt` descriptivo. Contrato js: `data-gallery`.

### 4.2 Cabecera de la ficha
- Familia olfativa → h1 → descripción corta ("inspirada en fragancias [tipo]"; **nunca** marca original).
- Fila de valoración (oculta si no hay reseñas).

### 4.3 Tres beneficios con iconos
- Envío, muestra antes de comprar, cambios. Solo los que sean ciertos.

### 4.4 Fecha de entrega (nuevo)
- `<p class="product-detail__delivery" data-delivery>` con el plazo calculado por js desde la fecha actual. HTML da el estado por defecto ("Envíos a todo el Perú") para funcionar sin JS.
- **Plazo real a confirmar** con Paul (Lima vs provincias).

### 4.5 Selector de tamaño
- Mantener Muestra / Tamaño completo. Convertir los radios en **botones tipo "pill"** (mismo patrón que `.lash-size` de AP Beauty). Mantener el `disclaimer` de muestra.
- Añadir selector de cantidad (+/−).

### 4.6 Acordeón de datos de perfumería
Sustituye al `<dl>` suelto. `<details>` nativos (sin JS):
1. Notas olfativas (salida / corazón / fondo)
2. Duración e intensidad
3. Cuándo usarla (estación, ocasión, momento del día)
4. Sobre la elaboración y concentración
5. Envíos y cambios
Los textos siguen siendo placeholders hasta que Paul entregue los datos reales (§8).

### 4.7 Escasez y actividad (copiado de Elexirium, decisión de Paul)
- Fila bajo el precio con dos slots independientes, ambos `hidden` por defecto:
  - `<p class="product-detail__viewers" data-viewers-slot hidden>` → "N personas viendo este producto".
  - `<p class="product-detail__stock" data-stock-slot hidden>` → "Quedan N unidades".
- Etiqueta de oferta junto al precio (`<span class="product-detail__badge" data-offer-badge hidden>`) con la oferta vigente y su fecha de fin.
- **Quién pone el número es js/backend, no el HTML.** Recomendación de front (§0): origen real. Para stock, contrato AB-B10 (`/api/stock`, por diseño y no por talla). Si el dato falla → se oculta el slot, nunca se muestra un número por defecto.
- Los tres slots aceptan texto con `aria-live="polite"` para no spamear a lectores de pantalla.

### 4.8 Barra sticky de compra (nuevo)
- Barra fija inferior: miniatura + nombre + precio + tamaño + botón "Añadir al carrito".
- Aparece cuando el botón principal sale del viewport (`IntersectionObserver`, dominio js). Fuera del `<main>` visible en móvil sin tapar el footer. `aria-hidden` hasta que se muestre.
- Ojo (memoria de entorno): en la pestaña de Chrome de las sesiones web, rAF/IntersectionObserver no disparan; verificar por lógica y dejar el estado visible como default en CSS.

### 4.9 Reseñas de la ficha
- Bloque al final con el mismo componente que el home. Vacío elegante hasta tener reseñas reales. CTA "Escribir una reseña" (destino pendiente).

### 4.10 Relacionados
- "Otras fragancias de la misma familia": 4 tarjetas, mismo componente que `.trending`.

### 4.11 Escritura de datos estructurados
- JSON-LD `Product` + `Offer` por SKU (dominio SEO). No tocar el bloque `DOMINIO SEO`.

---

## 5. CARRITO

El drawer **ya existe** (`#cart-drawer`, contrato compartido con AP Beauty). Se enriquece; no se rehace.

### 5.1 Drawer (`#cart-drawer`)
- Título: texto de marca (p. ej. "Tu esencia te espera").
- **Barra de progreso con hitos reales** (`<progress>`/`role="progressbar"` + 3 hitos): Envío gratis / Muestra de regalo / Tamaño completo con beneficio. **Umbrales pendientes de Paul** → placeholders `data-umbral-pendiente`.
- Línea de producto con nombre, tamaño, precio y cantidad (ya existe).
- Bloque "Añade una muestra" (upsell honesto sample-first).
- Bloque "Quizás te interese" con 2-3 productos de la misma familia.
- Línea de regalo automático (visible solo si se alcanza el hito).
- Nota de envío con plazo real; iconos de pago.
- Botón principal: "Ir a pagar" (hoy "Ver carrito y pagar").

### 5.2 Página `carrito.html`
- Mantiene resumen + pasarela Mercado Pago (patrón AP-J2). Se alinea el copy y la barra de progreso con el drawer.
- `<p class="stock-msg" role="status" aria-live="polite" hidden>` para avisos de stock (contrato AB-B10).

### 5.3 Ofertas y urgencia en el carrito
- Cabecera del drawer con la oferta vigente (misma fuente que el banner de §3.1b): `<p class="cart-drawer__offer" data-offer-slot hidden>`.
- Línea de ahorro por producto (`data-saving-slot hidden`) y línea de descuentos aplicados en el resumen. Los valores los calcula js desde la oferta activa.
- Si hay cuenta atrás activa, se repite una versión compacta dentro del drawer (`data-countdown-end` compartido con §3.1b).
- El tipo de oferta (3x2, % en segunda unidad, regalo por mínimo) es **decisión de Paul** (§8); el HTML no lo asume.

---

## 6. CATÁLOGO, MUESTRAS, HISTORIA, CONTACTO, CONFIRMACIÓN

- **catalogo.html**: tarjeta de producto unificada (la misma que el home); filtros familia + género (ya existen); añadir orden (más vendido / nuevo) solo cuando existan flags reales; **buscador** del home enlaza aquí.
- **muestras.html**: subir de peso; explicar el flujo sample-first → WhatsApp → tamaño completo; mostrar **qué incluye la muestra** y su precio (S/. 35, dato ya en js).
- **historia.html / contacto.html**: sin cambios estructurales; solo header/footer/utility-bar unificados.
- **confirmacion.html**: sin utility-bar (ya era así). Añadir "qué pasa ahora" (plazo, seguimiento por WhatsApp) y CTA a muestras.
- **Páginas nuevas a decidir**: FAQ (hoy `PAGINA_FAQ_PENDIENTE`), Envíos, Cambios y devoluciones (hoy placeholders), Skincare. Ver §7 y §8.

---

## 7. COMPONENTES COMPARTIDOS (header / utility-bar / drawer / footer)

Problema actual: header, utility-bar, menú móvil, drawer del carrito y footer están **copiados a mano** en cada una de las 8+ páginas (verificado en `index.html` y `producto.html`: bloques idénticos). Cualquier cambio exige editar todas.
- Regla del dominio front: "Sin HTML duplicado — extraer a componente si se repite más de 2 veces".
- Propuesta: extraer a `components/` (`utility-bar.html`, `header.html`, `menu-panel.html`, `cart-drawer.html`, `footer.html`) e inyectarlos. Al ser sitio estático sin build, la inyección es por js (`fetch` + `insertAdjacentHTML`) o por un script de ensamblado en build. **Decisión pendiente** (§8): afecta a SEO (contenido que no está en el HTML servido) y a deploy.
- Mientras no se decida: mantener los bloques idénticos con un diff de verificación entre páginas.

---

## 8. DECISIONES PENDIENTES DE PAUL

1. **Alcance de la primera pasada**: recomendación = ficha de producto (§4) + utility-bar (§3.1) + drawer (§5.1).
2. **Umbrales del carrito**: envío gratis desde S/ ?, muestra de regalo desde S/ ?, regalo de tamaño completo desde S/ ?
3. **Plazo de entrega real** (Lima / provincias) para la fecha calculada.
4. **Microbeneficios reales** del hero ("Envío en 24-48h", "Alta concentración"...).
5. **Datos reales por producto**: notas (salida/corazón/fondo), duración, intensidad, estación, uso y distribución de género.
6. **Mosaico de familias vs carrusel**: ¿se reemplaza el `.familia-carousel` o conviven?
7. **Reseñas guardadas**: ¿en qué formato las tienes (capturas, texto, JSON, app)? Con eso defino si el placeholder es pegado directo en HTML o `data/resenas.json` + `<template>`.
7a. **Reseñas guardadas: están en TEXTO** (respuesta de Paul 2026-11-15). Plan: `<template id="review-card-tpl">` + `data/resenas.json`; Paul pega el texto, front/js lo vuelca. Fotos de cliente solo si las tiene.
7b. **OFERTA DEFINIDA (Paul, 2026-11-15): 3 por S/ 99, antes S/ 150, presentación 50 ml.** Pendiente: fecha/hora de fin y si se repite. Moneda asumida: soles (confirmar). Ojo: los `data-price` actuales del catálogo son 75/90 por frasco; hay que confirmar a qué tamaño corresponden y qué precio unitario tiene el 50 ml.
7c. **Origen de los números de urgencia**: ¿reales (inventario y visitas) o aleatorios? Front deja los slots neutrales; la respuesta define el trabajo de js/backend y el riesgo legal (§0).
8. **Componentes compartidos**: ¿inyección por js, ensamblado en build o duplicado controlado?
9. **Pagos locales** (Yape/Plin) y medios a mostrar en footer.
10. **FAQ / Envíos / Cambios / Skincare**: ¿páginas propias o secciones?
11. **Repo**: esta copia no tiene `.git`. ¿Crear repo propio o fusionar luego al original?

---

## 9. REPARTO POR AGENTE

| Agente | Qué le toca en esta reestructuración |
|---|---|
| **front** | Todo el HTML de §3-§7: markup, slots `data-*`, `<details>`, galería, barra sticky, drawer enriquecido, componentes |
| **css** | Estilos de: utility-bar con controles, barra de reseñas, buscador, marquee, pestañas, galería, pills de tamaño, acordeón, barra sticky, barra de progreso, drawer, footer 4 cols. Patrón `.clase[hidden]{display:none}` en todo slot con `display` propio |
| **js** | Rotación/pausa de la utility-bar, fecha de entrega calculada, tabs de trending, buscador, galería, selector de cantidad, barra sticky (IntersectionObserver), barra de progreso del carrito, inyección de componentes, stock real (si hay backend) |
| **seo** | JSON-LD Product+Offer, `title`/`meta`/OG por página, copy del aviso legal, redacción de FAQ/políticas |
| **backend / devops** | Solo cuando haya checkout real o `/api/stock` (patrón AB-B10); deploy |

Orden de trabajo sugerido: **front → css → js → seo**. Front entrega marcado + handoffs por `inbox/`, sin tocar CSS/JS/`<meta>`/`style=""`.

---

## 10. CONTRATOS Y REGLAS (no romper)

- Ids/clases ya cableadas por `main.js`: `#btn-cart`, `#cart-drawer`, `#cart-backdrop`, `#btn-cart-close`, `#cart-count`, `#cart-items`, `#cart-foot`, `#cart-subtotal`, `#cart-checkout`, `#cart-line-tpl`, `.add-to-cart` con `data-id`/`data-name`/`data-price`/`data-image`, `[data-utility-msg]`, `#product-*` de la ficha (`#product-img`, `#product-titulo`, `#product-precio`, `#nota-*`, `#spec-*`, `#product-size`, `#muestra-disclaimer`, `#btn-add-to-cart`). Si se renombra algo, avisar a js **antes**.
- Precios en **soles enteros** en `data-price` (p. ej. `75`), formato visible "S/. 75".
- Nombres de clase para consentimiento/cookies: `ap-privacy-*`, nunca `cookie-*`/`consent-*` (los filtros cosméticos de adblock los ocultan).
- Clases en kebab-case, HTML5 semántico, un solo `<h1>`, todo `<img>` con `alt`, sin `style=""` ni `<script>` inline.
- Nunca nombrar la fragancia original ni usar "clon/réplica/imitación". Siempre "inspirada en fragancias [tipo]" como **descripción**, no como título.
- Cualquier destino sin confirmar = placeholder `data-cta-pendiente` (mismo patrón actual), nunca `href="#"` muerto.
- Sin commit/push sin OK de Paul. Esta carpeta no es el repo de producción.

---

## 11. ORDEN DE EJECUCIÓN PROPUESTO

1. **AE-R1** — Utility-bar (§3.1) + banner de campaña con cuenta atrás (§3.1b) + decisión de componentes compartidos (§7).
2. **AE-R2** — Ficha de producto (§4): galería, entrega, pills, acordeón, sticky, relacionados.
3. **AE-R3** — Drawer enriquecido (§5.1) con barra de progreso y upsell de muestra.
4. **AE-R4** — Home: buscador, pestañas, barra de reseñas, microbeneficios, "Del live a tu casa", valores a 4 iconos, mosaico de familias (§3).
5. **AE-R5** — Footer 4 columnas + medios de pago + aviso legal (§3.12).
6. **AE-R6** — Catálogo, muestras y confirmación (§6).
7. **AE-R7** — Handoffs a css/js/seo y verificación con clic real.

**Estado (2026-11-15):** AE-R1 ✅ (banner + cuenta atrás) · AE-R2 ✅ (ficha) · AE-R3 ✅ (drawer con oferta 3 por S/ 99: barra de progreso, upsell "Completa tu oferta", filas de ahorro y total, cuenta atrás compacta; también filas en `carrito.html`). Pendiente: AE-R4 a AE-R7.
**Supuestos de AE-R3 a confirmar con Paul:** la oferta aplica a cualquier combinación de 3 fragancias de tamaño completo (no muestras ni skincare); el grupo usa las unidades más caras; solo vive mientras corra la cuenta atrás; el cálculo es de presentación (el cobro real lo valida backend). Hitos de envío gratis y regalo NO incluidos (umbrales pendientes).
Los inbox de css, js, seo y backend tienen su lista de pendientes y los enlaces vivos de Elexirium.

Tareas AE-R* **aún no registradas** en `_sistema/pipeline.md` ni en los inbox. Registrarlas tras la aprobación de Paul.

## Ronda 2 del home (2026-11-15, decisiones de Paul)
- **Franja de valoración ACTIVA con cifras placeholder** (4,8/5 · +1.200 opiniones) para visualizar el conjunto. Marcadas `data-placeholder-cifra`; js las sustituye con reseñas reales. **Prohibido publicar así.**
- **Banner 3 por S/ 99 rediseñado** al formato Elexirium; css lo afina.
- **Eliminados:** bloque "promesa" y banner partido.
- **Nuevos:** banner tipográfico "Nuevos ingresos" + "Recién llegados" (8 con etiqueta NUEVO, botón "Ver todos los nuevos") · "Hablan por nosotros" (nota + nº de reseñas placeholder + tarjetas para las reseñas en texto) · trust grid debajo (Clientes reales / Envío / Pago seguro / Cambios y devoluciones, adaptado) · "Del laboratorio a tu casa" con subtítulo "Esencias concentradas con dedicación" y **reels wrapper** (3 vídeos verticales 9:16; poner `data-reel-src` en cada `<video>`).
- **Orden final del home:** valoración → hero → buscador → marquee → favoritos → nuevos ingresos → hablan por nosotros → trust grid → laboratorio/reels → familias → skincare → por qué Allpa → muestras → aviso legal.