# Ensambla la sección de enemigos nueva en main.js (líneas 957-1135 actuales)
lineas = open('web/js/main.js', encoding='utf-8').read().split('\n')
ini = lineas.index('// ---------------- enemigos ----------------')
fin = lineas.index('async function tick() {')
nuevo = open('tools/seccion-enemigos.js', encoding='utf-8').read()
out = lineas[:ini] + [nuevo] + lineas[fin:]
open('web/js/main.js', 'w', encoding='utf-8').write('\n'.join(out))
print('ensamblado OK')
