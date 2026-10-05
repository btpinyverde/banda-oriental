# Prueba de carga de las batallas

Script: `scripts/carga-batallas.py` (solo biblioteca estándar). Simula una sala completa: quien organiza crea y empieza, N jugadores entran,
consultan el estado con `since` según los intervalos del contrato y responden en cada ronda.

```
cd backend
DJANGO_SETTINGS_MODULE=config.settings.dev .venv/bin/gunicorn config.wsgi:application -b 127.0.0.1:8000 [--threads 4]
python3 scripts/carga-batallas.py --base http://localhost:8000 --players 50 --rounds 10 --seconds 8
```

(`wsgi.py` usa los ajustes de producción por defecto: sin `DJANGO_SETTINGS_MODULE=config.settings.dev` pide `DATABASE_URL` y no arranca, lo cual
protege de apuntar sin querer a la base real.) Hacen falta canciones con `deezer_id` en la base local.

## Resultados del 2026-10-05 (50 jugadores, base SQLite local, sin red de por medio)

| Servidor | Rondas | Pedidos/s | Estado p50 / p95 / p99 / máx | Responder p95 | Errores |
|---|---|---|---|---|---|
| 1 proceso, sin hilos (como Render hoy) | 4 | 24,8 | 8 / 17 / 929 / 1342 ms | 16 ms | ninguno |
| 1 proceso, `--threads 4` | 10 | 23,3 | 8 / 18 / 25 / 36 ms | 20 ms | ninguno |

Lo que se ve:

- **Empezar tarda en proporción a las rondas** (unos 0,34 s por canción, por el límite de pedidos a Deezer): 3,4 s con 10 rondas. Sin hilos,
  ese tiempo frena a todos los demás pedidos (de ahí el p99 de ~1 s de la primera fila); con hilos no se nota. **Se recomienda `--threads 4`
  en `render.yaml`** (no se cambió: se despliega al mergear, lo decide Brandon).
- La primera corrida de la prueba encontró dos problemas reales, ya corregidos con pruebas: `answer` y `join` contaban contra el límite global
  de 240/min por IP (una sala de 50 desde la misma wifi recibía 429), y entrar pedía la comprobación humana, que tiene un tope de 30 pases por hora
  por dirección (un bar no habría podido unirse).

## Lo que NO prueba

- **No es Render.** Esto corre en una computadora, con SQLite y sin latencia de red. En Render gratis el servidor tiene mucha menos CPU (0,1) y la
  base es Neon (en la red): cada pedido costará bastante más. Si cada consulta tardara 10 veces más (~80 ms), un solo proceso atendería unos
  12 pedidos/s, o sea unos **25 a 35 jugadores** consultando cada 2 s. Es una estimación, no una medición.
- Medirlo de verdad exige correr el script contra producción (crea una sala real con 50 jugadores falsos en la base de producción): no se hace
  sin la autorización de Brandon.
- Si hiciera falta más margen: responder el "sin cambios" desde memoria sin tocar la base (hoy la consulta hace unas 3 lecturas), o un plan pago.
