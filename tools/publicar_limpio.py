"""Genera dist/ = copia publicable de la landing SIN comentarios en HTML, JS y CSS.
Uso (desde la carpeta de la landing):  python tools/publicar_limpio.py
Los archivos fuente NO se tocan: conservan sus comentarios (contratos entre agentes).
Se publica el contenido de dist/, nunca la carpeta raiz.
Requiere Node (usa npx esbuild@0.24.0 para quitar comentarios de JS/CSS)."""
import io, os, re, shutil, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(RAIZ, 'dist')
EXCLUIR_DIRS = {'server', 'tools', 'node_modules', '.git', 'dist'}
EXCLUIR_EXT = ('.md', '.txt', '.mjs', '.py', '.log', '.map')


def esbuild(ruta):
    r = subprocess.run(['npx', '--yes', 'esbuild@0.24.0', ruta, '--legal-comments=none', '--log-level=error'],
                       capture_output=True, text=True, encoding='utf-8', shell=(os.name == 'nt'))
    if r.returncode != 0:
        sys.exit('esbuild fallo en %s:\n%s' % (ruta, r.stderr))
    out = r.stdout
    out = re.sub(r'^[ \t]*//.*\n', '', out, flags=re.M)
    return out.replace('/* @__PURE__ */ ', '')


def quitar_html(s):
    s = re.sub(r'[ \t]*<!--.*?-->[ \t]*\n?', '', s, flags=re.S)
    return re.sub(r'\n{3,}', '\n\n', s)


if os.path.isdir(DIST):
    shutil.rmtree(DIST)
n = {'html': 0, 'js': 0, 'css': 0, 'otros': 0}
for raiz, dirs, archivos in os.walk(RAIZ):
    dirs[:] = [d for d in dirs if d not in EXCLUIR_DIRS]
    for nombre in archivos:
        if (nombre.lower().endswith(EXCLUIR_EXT) and nombre != 'robots.txt') or nombre.startswith('_test'):
            continue
        origen = os.path.join(raiz, nombre)
        destino = os.path.join(DIST, os.path.relpath(origen, RAIZ))
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        ext = nombre.lower().rsplit('.', 1)[-1]
        if ext == 'html':
            io.open(destino, 'w', encoding='utf-8').write(quitar_html(io.open(origen, encoding='utf-8').read()))
            n['html'] += 1
        elif ext in ('js', 'css'):
            io.open(destino, 'w', encoding='utf-8', newline='\n').write(esbuild(origen))
            n[ext] += 1
        else:
            shutil.copy2(origen, destino)
            n['otros'] += 1
print('dist/ listo:', n)
