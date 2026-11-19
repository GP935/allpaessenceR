# Allpaessence
## Cómo cargar reseñas

Editar `data/resenas.json` (lista vacía `[]` = la web muestra el estado vacío y oculta las cifras). Una reseña por objeto:

```json
{ "autor": "Nombre", "texto": "Opinión del cliente", "estrellas": 5, "fecha": "2026-11-19",
  "producto": "Nombre propio de la fragancia", "verificado": true,
  "foto": "assets/section-class-review-home/1.webp", "productos": ["ae-001"] }
```

- Obligatorios: `autor`, `texto`, `estrellas` (1-5), `fecha` (ISO). El resto es opcional.
- `foto`: cuadrada, 600×600 recomendado. `productos`: ids base para la valoración de cada tarjeta.
- `verificado: true` solo si la compra se puede comprobar.
- Solo reseñas reales de clientes de Allpa. Nunca nombrar la marca original en `producto`.
- La media, el total y la franja de valoración se calculan solos; al cargar reseñas desaparecen las cifras de muestra.
