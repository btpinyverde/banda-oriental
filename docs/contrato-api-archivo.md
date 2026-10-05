# API del archivo de música

Buscar y explorar artistas, discos y canciones del catálogo. Todo es **público, de solo lectura** (`GET`), sin sesión, con
`Cache-Control: public, max-age=60` y un límite propio de 60 pedidos por minuto por IP. Los endpoints viejos del juego
(`/api/songs/`, `/api/albums/`) no cambian.

No dice cuál es la canción de hoy ni de días que vienen: `played_on` lista solo días **ya vencidos** (y publicados).
Quedan afuera los títulos hechos solo de símbolos (`-`, `...`) y los artistas o discos sin ninguna canción.

## Cómo busca

El texto (`q`) se parte en palabras y **todas** tienen que aparecer, en cualquier orden, en alguno de los campos (título,
disco o artista para las canciones; nombre y artista para los discos). No distingue tildes ni mayúsculas (`vaiven` encuentra
`Vaivén`; usa `unaccent` de PostgreSQL, y si la extensión faltara busca igual pero distinguiendo tildes). El orden de los
resultados es: el nombre exacto, después los que empiezan con lo escrito, después el resto.

## Errores

`400 {"detail": "..."}` con un mensaje en español para un parámetro inválido (no es número, fuera de rango, `q` vacío o de más
de 100 caracteres, `sort` desconocido). `404 {"detail": "..."}` si la ficha no existe. Una página más allá del final no es
error: devuelve `results: []`.

## Listas paginadas

`page` (desde 1) y `page_size` (1 a 50, por defecto 20). Respuesta: `{"count", "page", "pages", "results": [...]}`.

## Endpoints

### `GET /api/catalog/search/?q=<texto>&limit=5`
Un solo buscador para todo. `limit` (1 a 20, por defecto 5) es por grupo.
```json
{ "q": "luna negra",
  "artists": { "results": [ {artista} ], "total": 0 },
  "albums":  { "results": [ {disco} ],   "total": 0 },
  "songs":   { "results": [ {canción} ], "total": 3 } }
```

### `GET /api/catalog/artists/` · `?q=` `?letter=` (una letra, sin tildes ni mayúsculas) · orden alfabético
Artista: `{ "id", "name", "albums", "songs", "first_year", "last_year" }`.

### `GET /api/catalog/artists/<id>/`
El artista y sus discos, por año: `{ ...artista, "albums": [ {disco} ] }`.

### `GET /api/catalog/albums/` · `?q=` `?year=` `?decade=1990` (1990 a 1999) `?genre=Folk` `?artist=<id>` `?sort=name|year`
Disco: `{ "id", "name", "artist": {"id","name"}, "year", "genre", "release_type", "songs", "cover_art_url" }`.
El género es el nombre exacto (sin distinguir mayúsculas): `Folk` no trae `Folklore`.

### `GET /api/catalog/albums/<id>/`
El disco y sus canciones: `{ ...disco, "songs": [ {"id","title","duration_seconds"} ] }`.

### `GET /api/catalog/songs/` · `?q=` `?artist=<id>` `?album=<id>` `?year=` `?decade=` `?genre=`
Canción: `{ "id", "title", "duration_seconds", "artist": {"id","name"}, "album": {"id","name","year","genre"}, "played_on" }`.
Varias canciones pueden llamarse igual (de distintos artistas o del mismo en discos distintos): el artista y el disco dentro de
cada resultado sirven para distinguirlas. En la lista `played_on` es el último día vencido en que fue la canción del día, o `null`.

### `GET /api/catalog/songs/<id>/`
Igual que arriba, pero `played_on` es la **lista** de todos los días vencidos en que fue la del día (`[]` si nunca).

### `GET /api/catalog/filters/`
Lo que la interfaz puede ofrecer para filtrar, con cuántos discos tiene cada uno:
`{ "decades": [{"decade": 1990, "albums": 12}], "genres": [{"genre": "Folk", "albums": 3}], "years": {"min": 1966, "max": 2004} }`.
Ignora los discos sin año o sin género. Los géneros salen del campo `genre` de cada disco: hoy el catálogo cargado casi no
los tiene, así que la lista de géneros va a estar vacía hasta que se completen.
