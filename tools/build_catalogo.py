#!/usr/bin/env python3
"""Genera data/productos.json, data/urgencia.json y assets/catalogo/f/*.webp
a partir de galeria/allpaproductos (_resumen.csv + carpetas de imagenes).

Uso:  python tools/build_catalogo.py [ruta_galeria]

- Une las fotos duplicadas de una misma fragancia (mismo conjunto de palabras en el nombre del archivo).
- Cada fragancia recibe un NOMBRE PROPIO de Allpa ("Attractive Man Nº1"); el nombre del archivo
  (la fragancia de referencia) se guarda solo en el campo "ref", que usa el buscador y NO se muestra.
- Precios, flags (bestseller/trending/nuevo) y stock son PLACEHOLDERS determinísticos.
- Los nombres son editables: para fijar uno, ponlo en tools/nombres_fijos.json {"<ref>": "Nombre"}
  y vuelve a ejecutar el script.
"""
import csv, hashlib, json, os, re, sys, unicodedata
from collections import defaultdict
from PIL import Image

GAL = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\paulm\ecosistema_IA\galeria\allpaproductos"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_IMG = os.path.join(ROOT, "assets", "catalogo", "f")
os.makedirs(OUT_IMG, exist_ok=True)
PRIORIDAD = {"catalogo": 0, "batch_3": 1, "batch_2": 2, "raiz": 3}
PRECIO = 65  # 50 ml; tamaños reales de Paul: 30 ml S/ 45, 50 ml S/ 65, 100 ml S/ 95
TAMANOS = [{"ml": 30, "precio": 45}, {"ml": 50, "precio": 65}, {"ml": 100, "precio": 95}]


def strip(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def tokens(name):
    s = re.sub(r"\.(jpe?g|png|webp)$", "", strip(name))
    return frozenset(re.sub(r"[^a-z0-9 ]", " ", s).split())


FAM = {
    "Floral": "floral", "Dulce": "dulce", "Cítrico": "citrico", "Aromático": "aromatico", "Afrutado": "afrutado",
    "Especiado": "especiado", "Fresco": "fresco", "Amaderado": "amaderado", "Ámbar": "ambar",
    "Cuero y Tabaco": "cuero-tabaco", "Almizclado": "almizclado",
}
GEN = {"Masculino": "para-el", "Femenino": "para-ella", "Unisex": "unisex"}
GEN_WORD = {"para-el": "Man", "para-ella": "Woman", "unisex": ""}
GEN_TXT = {"para-el": "para él", "para-ella": "para ella", "unisex": "unisex"}

# palabras descriptivas del nombre de referencia -> concepto propio ("" = se ignora)
KEY = {
    "sexy": "Attractive", "vip": "Prestige", "intense": "Deep", "intenso": "Deep", "night": "Midnight", "nuit": "Midnight",
    "noche": "Midnight", "nocturne": "Midnight", "black": "Onyx", "noir": "Onyx", "nero": "Onyx", "negro": "Onyx",
    "gold": "Aurum", "golden": "Aurum", "oro": "Aurum", "silver": "Argent", "blue": "Azure", "bleu": "Azure",
    "azul": "Azure", "red": "Scarlet", "rouge": "Scarlet", "rojo": "Scarlet", "rose": "Petal", "rosa": "Petal",
    "vanilla": "Velvet", "vanille": "Velvet", "candy": "Sugar", "sweet": "Honeyed", "love": "Devotion", "amor": "Devotion",
    "bomb": "Spark", "wild": "Untamed", "sauvage": "Untamed", "hero": "Valor", "heroes": "Valor", "king": "Regal",
    "queen": "Majestic", "boy": "Rebel", "girl": "Muse", "bad": "Rogue", "good": "Radiant", "elixir": "Nectar",
    "absolu": "Pure", "absolute": "Pure", "supreme": "Sovereign", "sport": "Active", "fresh": "Crisp", "fresca": "Crisp",
    "water": "Aqua", "acqua": "Aqua", "ocean": "Marine", "sea": "Marine", "wood": "Cedar", "bois": "Cedar",
    "oud": "Ember", "musk": "Soft Skin", "leather": "Saddle", "cuir": "Saddle", "tobacco": "Smoke", "cherry": "Crimson",
    "million": "Fortune", "phantom": "Specter", "invictus": "Triumph", "legend": "Saga", "eros": "Desire",
    "libre": "Liberty", "fantasy": "Reverie", "cloud": "Nimbus", "flower": "Bloom", "paradise": "Eden",
    "garden": "Orchard", "scandal": "Rumor", "chance": "Fate", "angel": "Seraph", "ange": "Seraph", "demon": "Shadow",
    "mandarin": "Tangerine", "sky": "Zenith", "bourbon": "Cask", "santal": "Sandal", "yum": "Nibble", "bubble": "Fizz",
    "gum": "Fizz", "marshmallow": "Cloudy", "ice": "Frost", "icy": "Frost", "fire": "Blaze", "flame": "Blaze",
    "sun": "Solar", "moon": "Lunar", "star": "Stellar", "dream": "Reverie", "dreams": "Reverie", "secret": "Hidden",
    "diamond": "Facet", "pearl": "Nacre", "crystal": "Prism", "royal": "Imperial", "prince": "Heir", "lady": "Dame",
    "extreme": "Extreme", "ultra": "Apex", "pure": "Pure", "light": "Lumen", "dark": "Umbra", "storm": "Tempest",
    "spice": "Saffron", "spicy": "Saffron", "honey": "Honeyed", "miel": "Honeyed", "coffee": "Roast", "cafe": "Roast",
    "coconut": "Isle", "island": "Isle", "summer": "Solstice", "winter": "Frostline", "velvet": "Velour",
    "silk": "Satin", "lace": "Filigree", "kiss": "Hush", "blossom": "Blossom", "jasmine": "Jasmin",
    "orchid": "Orchid", "lily": "Lily", "peony": "Peony", "mystery": "Enigma", "elegance": "Poise",
}
POOL = {
    "floral": ["Orchid", "Peony", "Jasmin", "Iris", "Lily", "Magnolia", "Camellia", "Freesia", "Tuberose", "Lilac", "Wisteria", "Violet", "Gardenia", "Dahlia"],
    "dulce": ["Velvet", "Honey", "Praline", "Caramel", "Cocoa", "Marzipan", "Toffee", "Meringue", "Nougat", "Creme", "Brulee", "Sugarwood", "Bonbon", "Syrup"],
    "citrico": ["Bergamot", "Zest", "Lemon Grove", "Sunrise", "Neroli", "Yuzu", "Citron", "Verbena", "Limoncello", "Grapefruit", "Petitgrain", "Clementine", "Sol", "Mediterraneo"],
    "aromatico": ["Lavender", "Sage", "Rosemary", "Thyme", "Fougere", "Basil", "Juniper", "Highland", "Herbal", "Alpine", "Eucalyptus", "Mint", "Pine", "Meadow"],
    "afrutado": ["Peach", "Pear", "Plum", "Berry", "Apple", "Mango", "Fig", "Cassis", "Pomelo", "Apricot", "Raspberry", "Lychee", "Melon", "Pineapple"],
    "especiado": ["Saffron", "Cardamom", "Cinnamon", "Pepper", "Clove", "Ginger", "Nutmeg", "Cumin", "Anise", "Spice Route", "Paprika", "Allspice", "Chai", "Masala"],
    "fresco": ["Breeze", "Aqua", "Glacier", "Mist", "Dew", "Tide", "Cascade", "Rain", "Coast", "Lagoon", "Frost", "Marine", "Horizon", "Current"],
    "amaderado": ["Cedar", "Sandal", "Vetiver", "Oak", "Cypress", "Birch", "Teak", "Mahogany", "Driftwood", "Timber", "Patchouli", "Heartwood", "Ebony", "Pinewood"],
    "ambar": ["Amber", "Resin", "Ember", "Labdanum", "Benzoin", "Gilded", "Sunset", "Dune", "Topaz", "Copper", "Bronze", "Embers", "Glow", "Harvest"],
    "cuero-tabaco": ["Saddle", "Tobacco", "Suede", "Cigar", "Hide", "Smoke", "Rider", "Havana", "Tannery", "Barrel", "Whiskey", "Leather", "Ranch", "Ash"],
    "almizclado": ["Musk", "Skin", "Cashmere", "Powder", "Cotton", "Silk", "Linen", "Whisper", "Soft", "Cloud", "Down", "Satin", "Petal Skin", "Haze"],
}
ADJ = ["Noble", "Silent", "Golden", "Wild", "Velvet", "Royal", "Secret", "Eternal", "Lunar", "Solar", "Bright", "Pure", "Deep", "Rare", "Grand", "Modern", "Classic", "Urban", "Savage", "Gentle",
       "Magnetic", "Radiant", "Midnight", "Vivid", "Daring", "Serene", "Elegant", "Bold", "Delicate", "Intense"]


def h(s, n):
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % n


def concept(ref, fam_slug):
    toks = re.sub(r"[^a-z0-9 ]", " ", strip(ref)).split()
    words = []
    for t in toks:
        w = KEY.get(t)
        if w and w not in words:
            words.append(w)
    if words:
        return " ".join(words[:2])
    pool = POOL.get(fam_slug) or POOL["floral"]
    return f"{ADJ[h(ref + 'a', len(ADJ))]} {pool[h(ref + 'n', len(pool))]}"


rows = list(csv.DictReader(open(os.path.join(GAL, "_resumen.csv"), encoding="utf-8")))
groups = defaultdict(list)
for r in rows:
    groups[tokens(os.path.basename(r["salida"]))].append(r)
elegidas = []
for k, g in groups.items():
    g.sort(key=lambda r: PRIORIDAD.get(r["salida"].split("/")[0], 9))
    elegidas.append(g[0])
elegidas.sort(key=lambda r: (GEN.get(r["genero"]), strip(os.path.basename(r["salida"]))))

fijos_path = os.path.join(ROOT, "tools", "nombres_fijos.json")
fijos = json.load(open(fijos_path, encoding="utf-8")) if os.path.exists(fijos_path) else {}

base_count = defaultdict(int)
productos, stock = [], {}
for i, r in enumerate(elegidas, 1):
    pid = f"ae-{i:03d}"
    ref = re.sub(r"\.(jpe?g|png|webp)$", "", os.path.basename(r["salida"]), flags=re.I).strip()
    labs = [x for x in (r["familia_1"], r["familia_2"], r["familia_3"]) if x in FAM]
    fam_slugs = [FAM[f] for f in labs]
    prim = fam_slugs[0]
    gen = GEN[r["genero"]]
    if ref in fijos:
        nombre = fijos[ref]
    else:
        base_full = f"{concept(ref, prim)} {GEN_WORD[gen]}".strip()
        base_count[base_full] += 1
        nombre = f"{base_full} Nº{base_count[base_full]}"
    src = os.path.join(GAL, *r["salida"].split("/"))
    im = Image.open(src).convert("RGB")
    im.thumbnail((720, 720))
    im.save(os.path.join(OUT_IMG, f"{pid}.webp"), "WEBP", quality=80, method=6)
    if len(labs) > 1:
        lista = ", ".join(x.lower() for x in labs[:-1]) + " y " + labs[-1].lower()
    else:
        lista = labs[0].lower()
    productos.append({
        "id": pid,
        "familia": prim, "familiaLabel": labs[0],
        "familias": fam_slugs, "familiasLabel": labs,
        "nombre": nombre,
        "ref": ref,
        "desc": f"Fragancia {lista} {GEN_TXT[gen]}.",
        "alt": f"Frasco Allpa Essence {nombre}, fragancia {labs[0].lower()} {GEN_TXT[gen]}",
        "imagen": f"assets/catalogo/f/{pid}.webp",
        "genero": gen,
        "precio": PRECIO, "precioMuestra": 0,
        "precioDisplay": f"S/ {PRECIO} · 50 ml", "tamanos": TAMANOS, "nombreCarrito": f"{nombre} · 50 ml", "precioMuestraDisplay": "[PRECIO_MUESTRA]",
        "flag": "", "nuevo": False,
        "notas": None, "duracion": None, "intensidad": None,
        "clasificacion": r["confianza"],
    })

for gen in GEN.values():
    ids = sorted((p for p in productos if p["genero"] == gen), key=lambda p: h(p["id"] + "f", 10**6))
    for p in ids[:6]:
        p["flag"] = "bestseller"
    for p in ids[6:12]:
        p["flag"] = "trending"
for p in sorted(productos, key=lambda p: h(p["id"] + "n", 10**6))[:16]:
    p["nuevo"] = True
for p in productos:
    stock[p["id"]] = (2 + h(p["id"] + "q", 9)) if h(p["id"] + "s", 100) < 22 else (12 + h(p["id"] + "q", 40))

json.dump(productos, open(os.path.join(ROOT, "data", "productos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
urg = {
    "_nota": "DATOS DE URGENCIA. Mientras 'placeholder' sea true son CIFRAS DE MUESTRA para visualizar el sitio: se marcan con data-placeholder-cifra y NO deben publicarse. Para pasar a datos reales: pon placeholder en false y escribe el stock real por SKU. 'viewers' es el rango de 'personas viendo'; con datos reales hay que sustituirlo por un contador real (backend) o quitarlo.",
    "placeholder": True, "umbralVisible": 10, "umbralUltimas": 5, "viewers": {"min": 4, "max": 14}, "stock": stock,
}
json.dump(urg, open(os.path.join(ROOT, "data", "urgencia.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(len(productos), "fragancias;", sum(p["genero"] == "para-el" for p in productos), "él /",
      sum(p["genero"] == "para-ella" for p in productos), "ella /", sum(p["genero"] == "unisex" for p in productos), "unisex")
