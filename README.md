# Focus Grid

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

El archivo `docker-compose.dev.yml` inicia Focus Grid, PostgreSQL y Mailpit:

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Aplicación: <http://localhost:5173>
- API: <http://localhost:3000/api>
- Interfaz de Mailpit: <http://localhost:8025>
- SMTP de Mailpit: `localhost:1025` desde el host y `host.docker.internal:1025` desde Compose.
- PostgreSQL: `localhost:5432` desde el host y `host.docker.internal:5432` desde Compose.

El código fuente se monta en `/app` y las dependencias permanecen en volúmenes
Docker. Para aplicar migraciones:

```bash
docker compose -f docker-compose.dev.yml exec focus-grid npm run db:migrate
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
docker build --target production -t focus-grid:latest .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://user:password@host:5432/focus_grid' \
  focus-grid:latest
```

## Despliegue

El Compose de producción levanta únicamente `focus-grid`. PostgreSQL y SMTP son
servicios externos y deben estar accesibles desde el servidor. Traefik debe
estar ejecutándose y conectado a una red Docker externa llamada `proxy`.

### Primer despliegue

1. Preparar el servidor:

   - Instalar Git, Docker Engine 24 o posterior y Docker Compose v2.
   - Apuntar el DNS de `focus-grid.aseresoft.com` al servidor.
   - Configurar Traefik con el entrypoint `websecure` y el resolver de
     certificados `letsencrypt`.
   - Crear la base de datos y el usuario en el PostgreSQL externo, permitir
     conexiones desde el servidor de la aplicación y conservar su URL de
     conexión.
   - Disponer de las credenciales del servidor SMTP.

2. Clonar el repositorio:

```bash
git clone https://github.com/jjrosalesuci/task-tracker.git focus-grid
cd focus-grid
```

3. Crear `.env` con permisos restringidos:

```bash
install -m 600 /dev/null .env
nano .env
```

Definir como mínimo:

```dotenv
DATABASE_URL=postgresql://USUARIO:CONTRASENA@HOST:5432/focus_grid
APP_ORIGIN=https://focus-grid.aseresoft.com
SESSION_TTL_DAYS=30
PASSWORD_RESET_TTL_MINUTES=30
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario-smtp
SMTP_PASS=contrasena-smtp
MAIL_FROM=Focus Grid <no-reply@focus-grid.aseresoft.com>
```

`DATABASE_URL` siempre debe apuntar al PostgreSQL externo. Si el usuario o la
contraseña contienen caracteres reservados de una URL, deben codificarse.
No versionar `.env`.

4. Crear una sola vez la red externa usada por Traefik y comprobar que Traefik
   también esté conectado a ella:

```bash
docker network create proxy
docker network inspect proxy
```

Si la red ya existe, no es necesario volver a crearla.

5. Validar la configuración y construir la imagen:

```bash
docker compose config --quiet
docker compose build --pull focus-grid
```

6. Aplicar las migraciones al PostgreSQL externo:

```bash
docker compose run --rm focus-grid npm run db:migrate
```

7. Iniciar la aplicación:

```bash
docker compose up -d --no-deps focus-grid
```

8. Verificar el contenedor, los registros y el endpoint público:

```bash
docker compose ps
docker compose logs --tail=200 focus-grid
curl --fail --silent --show-error https://focus-grid.aseresoft.com/health/ready
```

El servicio se llama `focus-grid`, usa `restart: unless-stopped`, no publica el
puerto directamente y se conecta a la red externa `proxy`. Traefik enruta
`https://focus-grid.aseresoft.com` al puerto interno `3000`, mediante el
entrypoint `websecure` y el resolver de certificados `letsencrypt`. Traefik debe
estar previamente configurado con esos nombres. El Compose de producción no
incluye PostgreSQL: `DATABASE_URL` siempre debe apuntar al servidor externo.

## Operación

### Actualizar una instalación

Antes de actualizar, realizar una copia de seguridad del PostgreSQL externo.
Después, desde el directorio del repositorio:

```bash
git pull --ff-only
docker compose config --quiet
docker compose build --pull focus-grid
docker compose run --rm focus-grid npm run db:migrate
docker compose up -d --no-deps focus-grid
docker compose ps
docker compose logs --tail=200 focus-grid
curl --fail --silent --show-error https://focus-grid.aseresoft.com/health/ready
```

Las migraciones deben ejecutarse una sola vez por despliegue, después de
construir la imagen nueva y antes de recrear la aplicación.

### Comandos habituales

```bash
# Estado y healthchecks
docker compose ps

# Registros recientes
docker compose logs --tail=200 focus-grid

# Reiniciar únicamente la aplicación
docker compose restart focus-grid

# Actualizar y recrear el servicio
docker compose build --pull focus-grid
docker compose up -d --no-deps focus-grid

# Detener el despliegue sin borrar datos
docker compose down
```

El healthcheck de producción verifica que la aplicación acepte conexiones en el
puerto interno `3000`. PostgreSQL y SMTP deben supervisarse por separado en sus
respectivos servidores.
