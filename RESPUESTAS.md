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
- Link al pull request: https://github.com/york55/INF384-lab4-dev/pull/4
- Defecto de la aplicación introducido (archivo y descripción): src/db.js. En la transacción transferir se comentó acreditar.run(monto, destino). La transferencia debita al origen pero no acredita al destino: el dinero desaparece y la API igual responde 200.
- Job que debería detenerlo: integration. Usa SQLite real y verifica que los saldos se guardan. unit no lo detecta porque usa un store falso en memoria que no ejecuta el SQL.
- Link al run fallido: https://github.com/york55/INF384-lab4-dev/actions/runs/40967735014

## Parte 3 · Decisión bajo restricción
Link al run medido: https://github.com/york55/INF384-lab4-dev/actions/runs/40963238639/job/123762027122

| Job | Duración (min:seg) |
|---|---|
| unit | 0:14 |
| integration | 0:12 |
| sast | 0:19 |
| sca | 0:16 |
| build-push | 0:42 |
| deploy | 0:19 |
| smoke | 0:11 |
| e2e | 0:17 |
| load | 12:15 |
| **Total** | 14:45 |

Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | 47,94 ms |
| p95 | 50,46 ms |
| Máximo | 293,99 ms |
| Tasa de error | 0,00 % (0 de 36 578) |
| Requests por segundo | 50,76 |

Conclusión sobre el comportamiento bajo carga:
Con 30 VUs durante 12 minutos el servicio respondió sin errores (0 de 36 578 requests, checks al 100 %). El p95 fue 50,46 ms, unas diez veces por debajo del umbral de 500 ms que traía el pipeline, así que ese umbral no detectaría una degradación real. El máximo de 294 ms es unas seis veces el p95 y se explica por el arranque de instancias de Lambda durante la rampa. La latencia se mantuvo estable en el tramo constante.

SLO propuesto (percentil, valor, ventana) y justificación:
p95 de http_req_duration menor a 150 ms, medido en ventana de 30 días móviles. Elegí 2 veces el p95 medido (50,46 ms, o sea 100,9 ms), redondeado hacia arriba a múltiplo de 50 ms. Un valor pegado a lo medido haría fallar load por la variación normal entre runs. Además, el test acortado tiene menos muestras y más peso de arranques en frío.

SLA propuesto y diferencia con el SLO:
99,5 % de requests exitosos por mes y p95 menor a 450 ms (3 veces el SLO), con crédito de servicio si se incumple. El SLO es un objetivo interno que el pipeline mide y puede detener un despliegue. El SLA es un compromiso con el cliente, con consecuencias contractuales, y por eso es más flojo que el SLO.

Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|
| Carga constante de 10 a 4 min (rampas sin cambio) | load | 6:05 (12:15 a 6:10) |

Total resultante: 8:47 min (antes 14:45, diferencia neta de 5:58 porque los demás jobs variaron unos segundos entre runs).
Link al run en main con los cambios: https://github.com/york55/INF384-lab4-dev/actions/runs/40967057820

Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada):
Defecto concreto: una fuga de memoria en el manejo de transferir (por ejemplo, acumular cada movimiento en un arreglo a nivel de módulo). Degrada la latencia o agota la memoria de la instancia solo después de muchos requests sostenidos. Con 12 minutos de carga podía hacer superar el SLO. Con el tramo constante en 4 minutos (40 % de las peticiones de ese tramo) puede no manifestarse. El defecto llega a producción y se detecta ahí. Efecto en la change failure rate: sube.

Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón:
sast se queda en todos los runs. Cuesta 0:21, un 4,0 % de los 8:47 del pipeline final (2,4 % de los 14:45 originales). Quitarlo o moverlo solo recuperaría esos segundos, que no hacen falta para el presupuesto. Es la defensa contra patrones inseguros que los tests no cubren, como una inyección SQL con entradas válidas. Mantenerlo no cambia la CFR respecto a hoy. Sacarlo de main la haría subir, porque esos defectos se detectarían después o nunca.

## Declaración de uso de IA
Herramientas usadas y para qué:
# Declaración de uso de IA
Herramientas usadas y para qué:

**Claude, en claude.ai.** Lo usé como asistente durante todo el laboratorio, para lo siguiente:

1. **Lectura del material.** Resumió el enunciado, las preguntas, las diapositivas de la sesión 9 y el repositorio base (`README.md`, `ci.yml`, `Dockerfile`, `package.json`, `src/` y los tests).
2. **Diagnóstico (Parte 1).** Propuso candidatos a defectos del pipeline y explicó el problema que causa cada uno, su etapa y su clasificación. Yo elegí cuáles usar y qué evidencia presentar.
3. **Correcciones.** Propuso los cambios concretos en `ci.yml` y `test/e2e`. Yo los hice en mi fork, desde la web de GitHub, un commit por defecto.
4. **Guía de procedimiento.** Me explicó el uso de ramas, pull requests, merge commit y la cancelación de runs.
5. **Defecto de la aplicación (Parte 2).** Sugirió el cambio en `src/db.js` y el razonamiento de por qué lo detiene `integration` y no `unit`.
6. **Decisión bajo restricción (Parte 3).** Me ayudó con el método para proponer el SLO y el SLA, un plan de recortes para el presupuesto de 11 minutos, y borradores del riesgo aceptado (change failure rate) y de la decisión sobre `sast`.

**Lo que no hizo la IA.** No ejecutó el pipeline ni tuvo acceso a mi fork ni a mis secrets. Todos los runs, commits, duraciones, resultados de k6 y evidencias salen de mis propias ejecuciones. Una propuesta de la IA, un gate en el escaneo de la imagen, falló en mi run porque la imagen base trae 211 hallazgos HIGH o CRITICAL con parche. La revertí y la reemplacé por otra corrección.

**Prompt representativo** (resumen de lo que pedí, no la transcripción literal):

> Estoy rindiendo el Laboratorio 4 de INF384 (PUCP). Te adjunto el enunciado del caso y el PDF de preguntas. Guíame paso a paso para: (1) diagnosticar los cinco defectos del pipeline en ci.yml, package.json y test/, con job y etapa, problema, clasificación de la corrección y la evidencia que debo observar en mis runs; (2) dar los cambios exactos de cada commit, uno por defecto, y cómo llevarlos a main con un merge commit; (3) introducir un defecto de la aplicación en src/ que un job deba detener y justificar cuál; (4) con mi presupuesto de 11 minutos y la métrica DORA change failure rate, decidir los recortes, proponer un SLO y un SLA a partir de mis resultados de k6, y redactar el riesgo aceptado y la decisión sobre sast.
