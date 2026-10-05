#!/usr/bin/env python3
"""Simula una batalla completa contra una API: quien organiza crea la sala, N jugadores entran, empieza y cada uno consulta el
estado como lo haría el sitio (con `since` y los intervalos de docs/contrato-api-batallas.md) y responde en cada ronda.
Imprime pedidos por segundo, latencias (p50/p95/p99), errores y 429. Sirve también de prueba de punta a punta.

Uso:  python3 scripts/carga-batallas.py --base http://localhost:8000 --players 50 --rounds 4 --seconds 8
Solo biblioteca estándar. Contra producción, solo con permiso: crea una sala de verdad.
"""
import argparse
import json
import random
import statistics
import threading
import time
import urllib.error
import urllib.request
import uuid

INTERVALOS = {"lobby": 3.0, "countdown": 1.5, "playing": 2.0, "reveal": 3.0, "finished": 3.0, "otro": 3.0}
lock = threading.Lock()
latencias = {"state": [], "answer": [], "other": []}
errores = {}
t_inicio = time.time()


def pedir(base, metodo, ruta, device, cuerpo=None, host_token="", tipo="other", sesion=""):
    cabeceras = {"X-Device-Id": device, "Content-Type": "application/json"}
    if sesion:
        cabeceras["Authorization"] = f"Bearer {sesion}"
    if host_token:
        cabeceras["X-Host-Token"] = host_token
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(base + ruta, data=datos, headers=cabeceras, method=metodo)
    t0 = time.perf_counter()
    estado, texto = 0, ""
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            estado, texto = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        estado, texto = e.code, e.read().decode()
    except Exception as e:  # red caída, tiempo agotado...
        estado, texto = 0, str(e)
    dt = time.perf_counter() - t0
    with lock:
        latencias[tipo].append(dt)
        if estado >= 400 or estado == 0:
            errores[estado] = errores.get(estado, 0) + 1
    try:
        return estado, json.loads(texto)
    except ValueError:
        return estado, {}


def jugador(base, code, nombre, canciones, host_token=""):
    device = str(uuid.uuid4())
    es_host = bool(host_token)
    if not es_host:
        pedir(base, "POST", f"/api/battles/{code}/join/", device, {"display_name": nombre})
    clave, fase, respondidas = "", "otro", set()
    while True:
        ruta = f"/api/battles/{code}/" + (f"?since={clave}" if clave else "")
        estado, datos = pedir(base, "GET", ruta, device, host_token=host_token, tipo="state")
        if estado == 200 and datos.get("changed"):
            clave, fase = datos["key"], datos["phase"]["name"]
            r = datos.get("round")
            if not es_host and fase == "playing" and r and r["index"] not in respondidas and not r.get("answered"):
                respondidas.add(r["index"])
                time.sleep(random.uniform(0.5, 3.0))  # lo que tarda una persona en buscar la canción
                pedir(base, "POST", f"/api/battles/{code}/answer/", device, {"song_id": random.choice(canciones)}, tipo="answer")
            if datos["status"] == "finished":
                return
        time.sleep(INTERVALOS.get(fase, 3.0) * random.uniform(0.9, 1.1))


def percentil(valores, p):
    if not valores:
        return float("nan")
    orden = sorted(valores)
    return orden[min(len(orden) - 1, int(len(orden) * p))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--players", type=int, default=50)
    ap.add_argument("--rounds", type=int, default=4)
    ap.add_argument("--seconds", type=int, default=8)
    ap.add_argument("--token", default="", help="token de sesión de una cuenta autorizada a crear batallas (hace falta si el servidor no tiene BATTLE_CREATOR_EMAILS=*)")
    ap.add_argument("--songs", default="", help="ids de canciones del catálogo para responder, separados por coma (si no, se piden a /api/songs/)")
    a = ap.parse_args()
    base = a.base.rstrip("/")

    host_device = str(uuid.uuid4())
    if a.songs:
        canciones = [int(x) for x in a.songs.split(",")]
    else:
        _, d = pedir(base, "GET", "/api/songs/", host_device)
        canciones = [s["id"] for s in d.get("songs", [])][:200] or [1]
    estado, sala = pedir(base, "POST", "/api/battles/", host_device, {"round_count": a.rounds, "round_seconds": a.seconds, "title": "Prueba de carga"}, sesion=a.token)
    assert estado == 201, f"no se pudo crear la sala: {estado} {sala}"
    code, host_token = sala["code"], sala["host_token"]
    print(f"Sala {code}: {a.players} jugadores, {a.rounds} rondas de {a.seconds} s")

    hilos = [threading.Thread(target=jugador, args=(base, code, f"Jugador{i:03d}", canciones), daemon=True) for i in range(a.players)]
    for h in hilos:
        h.start()
        time.sleep(0.02)
    organizador = threading.Thread(target=jugador, args=(base, code, "host", canciones, host_token), daemon=True)
    organizador.start()
    time.sleep(2)
    estado, resp = pedir(base, "POST", f"/api/battles/{code}/start/", host_device, {}, host_token=host_token)
    print("Empezar:", estado, resp)
    if estado != 200:
        raise SystemExit("No se pudo empezar (¿hay canciones con deezer_id en la base?)")
    t0 = time.time()
    for h in hilos + [organizador]:
        h.join(timeout=a.rounds * (a.seconds + 8) + 60)
    total = time.time() - t0

    todos = [x for v in latencias.values() for x in v]
    print(f"\nDuración de la batalla: {total:.0f} s · pedidos: {len(todos)} · {len(todos) / total:.1f} pedidos/s")
    for nombre, v in latencias.items():
        if v:
            print(f"  {nombre:7s} n={len(v):5d}  p50={statistics.median(v) * 1000:6.0f} ms  p95={percentil(v, .95) * 1000:6.0f} ms  p99={percentil(v, .99) * 1000:6.0f} ms  max={max(v) * 1000:6.0f} ms")
    print("Errores por código (0 = sin conexión):", errores or "ninguno")
    estado, final = pedir(base, "GET", f"/api/battles/{code}/", host_device, host_token=host_token)
    print("Estado final:", final.get("status"), "· jugadores en el ranking:", len(final.get("ranking", [])))


if __name__ == "__main__":
    main()
