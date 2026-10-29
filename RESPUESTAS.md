# Respuestas · Laboratorio 4
Alumno: 20222232
Presupuesto: 11  min  Métrica DORA: change failure rate

## Parte 1 · Diagnóstico
### Defecto 1
- Job y etapa: `smoke`, etapa deploy (tiene `needs: build-push`, al mismo nivel que `deploy`). Debería estar en post-deploy.
- Problema que causa en el pipeline: smoke arranca en paralelo con `deploy` en lugar de esperarlo. Consulta la Function URL que ya exista y, si la función viene de un run anterior, prueba la versión anterior mientras se actualiza. Un smoke en verde no demuestra que el commit del run esté desplegado. `e2e` y `load` dependen de smoke y heredan el problema. `smoke.sh` ya soporta `EXPECTED_COMMIT`, pero `ci.yml` no lo pasa, así que nada verifica qué commit se probó.
- Link al commit: https://github.com/york55/INF384-lab4-dev/commit/f18c9c43b01638b492a0f6579fa934b30d9bc4e4
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): mover de etapa (`needs: deploy`) y ajustar configuración (`EXPECTED_COMMIT: ${{ github.sha }}`)
- Evidencia (dato observado, con link al run o fragmento de la salida local): 
### Defecto 2
- Job y etapa: `sca`, pre-build.
- Problema que causa en el pipeline: escanea el árbol completo con `--include-dev-deps`, es decir playwright, c8 y esbuild, que no viajan en la imagen porque el Dockerfile ejecuta `npm prune --omit=dev`. Un HIGH o CRITICAL en una herramienta de prueba detendría `build-push` y el despliegue aunque el artefacto no lo contenga, y diluye la señal del gate.
- Link al commit: https://github.com/york55/INF384-lab4-dev/commit/d0afa02e73390c9fe8af8721ebb8946d1483d327
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests):  ajustar configuración (quitar `--include-dev-deps`)
- Evidencia (dato observado, con link al run o fragmento de la salida local):
### Defecto 3
- Job y etapa: workflow completo (ci.yml sin concurrency a nivel de workflow). Afecta a las etapas deploy y post-deploy
- Problema que causa en el pipeline: cada PR se despliega en la misma Lambda y solo deploy serializa su paso. El deploy de un run reemplaza la función mientras smoke, e2e y load de otro run siguen probando, así que un run valida el código de otro y contamina el p95 de load.
- Link al commit: https://github.com/york55/INF384-lab4-dev/commit/3f2fe3ccea961b5949b8430a6d34d15d39c0a65e
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración (concurrency a nivel de workflow, con grupo distinto al de deploy y sin cancelar en curso).
- Evidencia (dato observado, con link al run o fragmento de la salida local):
### Defecto 4
- Job y etapa: `e2e`, post-deploy.
- Problema que causa en el pipeline: instala chromium con dependencias del sistema en cada run, pero 9 de 10 tests son llamadas HTTP con `page.request` (pruebas de API que no necesitan navegador). El único test con navegador solo abre una URL que devuelve JSON. Desperdicia el tiempo de instalación del navegador y usa un job costoso para verificar rutas y formatos de respuesta.
- Link al commit: https://github.com/york55/INF384-lab4-dev/commit/fc46bf65997a1e0147feb693fc19d5be23a1ce42
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración (quitar el paso de instalación), modificar tests (`page` pasa a `request`) y eliminar (el test del navegador)
- Evidencia (dato observado, con link al run o fragmento de la salida local):
### Defecto 5
- Job y etapa: `load`, post-deploy.
- Problema que causa en el pipeline: tiene `needs: smoke`, así que corre en paralelo con `e2e`. Si e2e falla, load igual gasta unos 12 minutos (1 + 10 + 1) de carga sobre una versión ya rechazada. Además ambos golpean la misma Lambda a la vez, y el tráfico de e2e contamina el p95 que load compara con el SLO.
- Link al commit: https://github.com/york55/INF384-lab4-dev/commit/a535caa51394572197ec6d46fbc3ca070d8dc053
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): mover de etapa (`needs: [smoke, e2e]`)
- Evidencia (dato observado, con link al run o fragmento de la salida local):

## Parte 2 · Implementación
- Link al run en verde en main: https://github.com/york55/INF384-lab4-dev/actions/runs/40963238639/job/123762027122
- Link al pull request: https://github.com/york55/INF384-lab4-dev/pull/3
- Defecto de la aplicación introducido (archivo y descripción): src/db.js. En la transacción transferir se comentó acreditar.run(monto, destino). La transferencia debita al origen pero no acredita al destino: el dinero desaparece y la API igual responde 200.
- Job que debería detenerlo: integration. Usa SQLite real y verifica que los saldos se guardan. unit no lo detecta porque usa un store falso en memoria que no ejecuta el SQL.
- Link al run fallido: https://github.com/york55/INF384-lab4-dev/actions/runs/40964276068

## Parte 3 · Decisión bajo restricción
Link al run medido:

| Job | Duración (min:seg) |
|---|---|
| unit | |
| integration | |
| sast | |
| sca | |
| build-push | |
| deploy | |
| smoke | |
| e2e | |
| load | |
| **Total** | |

Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | |
| p95 | |
| Máximo | |
| Tasa de error | |
| Requests por segundo | |

Conclusión sobre el comportamiento bajo carga:

SLO propuesto (percentil, valor, ventana) y justificación:

SLA propuesto y diferencia con el SLO:

Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|

Total resultante: [ ] min
Link al run en main con los cambios:

Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada):

Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón:

## Declaración de uso de IA
Herramientas usadas y para qué:
