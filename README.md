# Dealgine

Monorepo Node.js/TypeScript con cliente y servidor. Los comandos se ejecutan
desde la raíz:

- `npm run build`: compila cliente y servidor.
- `npm start`: inicia la aplicación compilada.
- `npm run dev`: inicia el entorno de desarrollo.
- `npm run db:migrate`: aplica las migraciones de la base de datos.

La aplicación escucha en el puerto `3000`.

## Requisitos

- Docker Engine 24 o posterior.
- Docker Compose v2.
- Node.js 22 y npm para ejecutar comandos fuera de contenedores.

## Variables de entorno

Copiar el archivo de ejemplo antes de iniciar el entorno local:

```bash
cp .env.example .env
```

`.env.example` solo contiene valores no sensibles de desarrollo. No se debe
versionar `.env` ni almacenar credenciales reales en imágenes o archivos
Compose. En producción, `DATABASE_URL` debe proceder del gestor de secretos o
del proveedor de PostgreSQL.

Variables principales:

| Variable | Uso | Valor local predeterminado |
| --- | --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL completa | PostgreSQL del Compose local |
| `APP_ORIGIN` | Origen público permitido y base de enlaces | `http://localhost:5173` |
| `APP_PORT` | Puerto del cliente Vite en desarrollo | `5173` |
| `API_PORT` | Puerto de la API en desarrollo | `3000` |
| `POSTGRES_*` | Configuración del PostgreSQL local | valores de desarrollo |
| `MAILPIT_*_PORT` | Puertos SMTP y web de Mailpit | `1025` y `8025` |

## Desarrollo local

El archivo `docker-compose.dev.yml` inicia Dealgine, PostgreSQL y Mailpit:

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Aplicación: <http://localhost:5173>
- API: <http://localhost:3000/api>
- Interfaz de Mailpit: <http://localhost:8025>
- SMTP de Mailpit: `localhost:1025` desde el host y `mailpit:1025` desde Compose.
- PostgreSQL: `localhost:5432` desde el host y `postgres:5432` desde Compose.

El código fuente se monta en `/app` y las dependencias permanecen en un volumen
Docker. Para aplicar migraciones:

```bash
docker compose -f docker-compose.dev.yml exec task-tracker npm run db:migrate
```

Para detener el entorno conservando datos:

```bash
docker compose -f docker-compose.dev.yml down
```

Para eliminar también los volúmenes locales:

```bash
docker compose -f docker-compose.dev.yml down --volumes
```

## Imagen de producción

El `Dockerfile` usa etapas separadas para dependencias, compilación y ejecución.
La imagen final contiene únicamente dependencias de producción y se ejecuta con
el usuario no privilegiado `node`.

```bash
docker build --target production -t dealgine:latest .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://usuario:contrasena@host:5432/dealgine' \
  dealgine:latest
```

## Despliegue con PostgreSQL externo

La red externa de Traefik debe existir antes del primer despliegue:

```bash
docker network create proxy
```

Definir en `.env` una `DATABASE_URL` válida, idealmente inyectada durante el
despliegue y no almacenada en el servidor, y ejecutar:

```bash
docker compose up -d --build
docker compose run --rm dealgine npm run db:migrate
docker compose ps
docker compose logs -f dealgine
```

El servicio se llama `dealgine`, usa `restart: unless-stopped`, no publica el
puerto directamente y se conecta a la red externa `proxy`. Traefik enruta
`https://dealgine.aseresoft.com` al puerto interno `3000`, mediante el
entrypoint `websecure` y el resolver de certificados `letsencrypt`. Traefik debe
estar previamente configurado con esos nombres.

## Despliegue con PostgreSQL local opcional

El Compose de producción incluye PostgreSQL bajo el perfil `local-db`. Esta
opción es útil en instalaciones autónomas; para producción administrada se
recomienda una base externa. Configurar en `.env`:

```dotenv
POSTGRES_DB=dealgine
POSTGRES_USER=dealgine
POSTGRES_PASSWORD=cambiar-por-un-valor-seguro
DATABASE_URL=postgresql://dealgine:cambiar-por-un-valor-seguro@postgres:5432/dealgine
```

Después iniciar el perfil y aplicar migraciones:

```bash
docker compose --profile local-db up -d --build
docker compose run --rm dealgine npm run db:migrate
```

El PostgreSQL del perfil solo está disponible en la red interna `backend`; no
publica el puerto `5432`.

## Operación

Comandos habituales:

```bash
# Estado y healthchecks
docker compose ps

# Registros recientes
docker compose logs --tail=200 dealgine

# Reiniciar únicamente la aplicación
docker compose restart dealgine

# Actualizar y recrear el servicio
docker compose build --pull dealgine
docker compose up -d --no-deps dealgine

# Detener el despliegue sin borrar datos
docker compose down
```

Antes de actualizar, realizar una copia de seguridad de PostgreSQL. Tras
desplegar una nueva imagen, ejecutar `npm run db:migrate` una sola vez y
comprobar que el healthcheck de `dealgine` figure como `healthy`. Los
healthchecks verifican que la aplicación acepte conexiones en el puerto `3000`,
que PostgreSQL responda y que Mailpit esté preparado.