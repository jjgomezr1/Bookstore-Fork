# BookStore Co.

Aplicación de referencia para el caso longitudinal del curso
**Cloud Computing**.

Este repositorio contiene una versión funcional de la plataforma operacional
de BookStore Co. y será utilizado durante diferentes actividades y laboratorios
del curso. El backend está organizado como **microservicios**: un BFF que
expone HTTP al navegador y cuatro servicios internos que se comunican por gRPC.

## Arquitectura

```text
navegador ──HTTP──▶ BFF ──gRPC──▶ auth      (clientes, sesión)
                     │     ├────▶ catalog   (libros y stock)
                     │     ├────▶ orders ──gRPC──▶ catalog (reserva de stock)
                     │     └────▶ events    (clickstream)
                     └─ único servicio expuesto a internet
```

| Componente | Puerto | Base de datos |
|------------|--------|---------------|
| `bff`      | 5001 (HTTP) | no |
| `auth`     | 50052 (gRPC) | esquema `auth` (`customers`) |
| `catalog`  | 50051 (gRPC) | esquema `catalog` (`books`) |
| `orders`   | 50054 (gRPC) | esquema `orders` (`orders`, `order_items`) |
| `events`   | 50053 (gRPC) | no (escribe el clickstream a archivo) |

Todos los servicios comparten una instancia de PostgreSQL, pero cada uno tiene
su propio **esquema** y su propio **rol** con permisos solo sobre ese esquema
(no hay llaves foráneas ni JOIN entre esquemas). La compra de un libro es una
*saga*: Orders pide a Catalog reservar el stock y, si no logra guardar la
orden, se lo devuelve. Todas las llamadas gRPC tienen plazo (*deadline*) y los
clientes balancean con `round_robin` entre las réplicas.

## Estructura del repositorio

```text
.
├── frontend/          SPA (React + Vite) y configuración de Nginx
├── bff/               Express: HTTP hacia el navegador, gRPC hacia los servicios
├── services/
│   ├── auth/
│   ├── catalog/
│   ├── orders/
│   └── events/
├── packages/common/   Código compartido (config, logs, JWT, BD, errores, gRPC)
├── proto/             Contratos gRPC (.proto)
├── database/          Esquema, datos iniciales y artefactos de PostgreSQL
├── k8s/               Manifiestos de Kubernetes (EKS)
├── compose.yaml       Entorno local completo
└── README.md
```

Es un monorepo con *npm workspaces*: un solo `package-lock.json` en la raíz y
un paquete por componente. Los Dockerfiles de los servicios se construyen
desde la raíz del repositorio, porque copian `packages/common/` y `proto/`.

## Configuración

El repositorio incluye plantillas de configuración. Cada plantilla se copia
como `.env` en su carpeta y cada archivo lo lee una herramienta distinta:

| Plantilla                          | Archivo a crear         | Lo lee           | Cuándo                                            |
|------------------------------------|-------------------------|------------------|---------------------------------------------------|
| `.env.example`                     | `.env`                  | Docker Compose   | `docker compose ...` (todos los servicios)        |
| `frontend/.env.example`            | `frontend/.env`         | Vite             | `npm run dev` o `npm run build` sin Docker        |
| `bff/.env.example`, `services/*/.env.example` | `.env` en cada carpeta | dotenv (Node.js) | Ejecutar un servicio sin Docker       |
| `.env.aws.example`                 | —                       | Referencia       | Documenta las variables del entorno de AWS (se aplican con los ConfigMap y Secret de `k8s/`) |
| `database/rds/bootstrap.env.example` | `database/rds/bootstrap.env` | `bootstrap.sh` | Inicialización manual de Amazon RDS            |

Las plantillas de `frontend/`, `bff/` y `services/` **no se usan** con Docker
Compose ni dentro de las imágenes: con Docker, toda la configuración proviene
del `.env` de la raíz.

Para el entorno local con Docker:

```bash
cp .env.example .env
```

Los archivos `.env` contienen configuración específica del entorno y
**no deben incorporarse al repositorio**.

Las variables de base de datos usan los mismos nombres en todos los entornos
y en `database/rds/bootstrap.env.example`: `DB_HOST`, `DB_PORT`, `DB_NAME` y un
usuario y contraseña por servicio (`AUTH_DB_USER`/`AUTH_DB_PASSWORD`,
`CATALOG_DB_*`, `ORDERS_DB_*`). Solo para la inicialización se usan
`DB_ADMIN_USER`, `DB_ADMIN_PASSWORD`, `INGEST_DB_USER` e `INGEST_DB_PASSWORD`.

## Ejecución local

```bash
docker compose up --build
```

La aplicación queda disponible en `http://localhost:8080` (o en el puerto
definido en `FRONTEND_HOST_PORT`). El BFF también se publica en
`http://localhost:5001` (`BFF_HOST_PORT`); los servicios gRPC solo son
accesibles dentro de la red de Docker.

La opción `--build` reconstruye las imágenes. Es necesaria cuando cambia el
código o alguna variable `VITE_*`, porque estas quedan incorporadas en el
frontend al momento de compilarlo.

### Servicios por separado

```bash
docker compose up bff              # BFF con los servicios y PostgreSQL inicializado (API en :5001)
docker compose build catalog       # construye solo la imagen de un servicio
docker compose build frontend      # construye solo la imagen del frontend
```

El contenedor del frontend requiere que el BFF exista, porque Nginx resuelve
el servicio `bff` al iniciar. Para trabajar solo en el frontend se recomienda
el desarrollo sin Docker.

### Verificar la base de datos

```bash
docker compose exec postgres psql -U bookstore_admin -d bookstore \
  -c "SELECT count(*) FROM catalog.books" -c "SELECT count(*) FROM auth.customers"
```

Con los datos iniciales debe devolver 12 libros y 8 clientes. El script
`database/rds/verify.sql` (se ejecuta al final del `bootstrap`) comprueba además
que cada servicio solo puede leer su propio esquema.

### Desarrollo sin Docker

Requiere Node.js 24. La base de datos puede ser la del entorno de Docker:

```bash
docker compose up -d postgres bootstrap
```

Instalar las dependencias una sola vez, desde la raíz:

```bash
npm install
```

Cada servicio se arranca con su propio `.env` (copiado de su `.env.example`).
`DB_USER` y `DB_PASSWORD` de cada servicio deben coincidir con los usuarios por
servicio del `.env` de la raíz:

```bash
cd services/catalog
cp .env.example .env
npm start
```

Se arrancan igual `services/auth`, `services/orders`, `services/events` y,
por último, `bff` (`http://localhost:5001`).

Frontend con recarga automática (`http://localhost:3000`, con proxy de `/api`
hacia el BFF):

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Build del frontend para Amazon S3

```bash
cd frontend
npm run build
```

El contenido de `frontend/dist/` es lo que se publica en el bucket. Las
variables `VITE_*` se toman de `frontend/.env` y quedan incorporadas en el
código compilado, por lo que no deben contener secretos.

## Publicar imágenes

Las imágenes de los servicios se publican como **multiplataforma**
(`linux/amd64` y `linux/arm64`), de modo que funcionan en servidores x86 y ARM
(Graviton) sin importar el equipo donde se construyeron. El nombre de cada
imagen se forma con dos variables del `.env`:

```text
${IMAGE_REGISTRY}/bookstore-bff:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-auth:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-catalog:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-orders:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-events:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-frontend:${IMAGE_TAG}   (solo para el entorno local)
```

| Registro   | `IMAGE_REGISTRY`                                 |
|------------|--------------------------------------------------|
| Local      | `local` (valor por defecto; no se publica)       |
| Docker Hub | `docker.io/<usuario>`                            |
| Amazon ECR | `<cuenta>.dkr.ecr.<region>.amazonaws.com`        |

`IMAGE_TAG` debe cambiar en cada versión publicada y coincidir con la etiqueta
que usan los manifiestos de `k8s/`. No se utiliza la etiqueta `latest`.

### 1. Crear el builder multiplataforma (una sola vez)

```bash
docker buildx create --name bookstore-builder --driver docker-container --use
```

### 2. Iniciar sesión en el registro

Docker Hub:

```bash
docker login
```

Amazon ECR (los repositorios deben existir antes de publicar):

```bash
for s in bff auth catalog orders events; do
  aws ecr create-repository --repository-name bookstore-$s
done
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <cuenta>.dkr.ecr.<region>.amazonaws.com
```

### 3. Configurar y publicar

Ajustar `IMAGE_REGISTRY` e `IMAGE_TAG` en el `.env` y ejecutar:

```bash
docker buildx bake -f compose.yaml --set "*.platform=linux/amd64,linux/arm64" --push bff auth catalog orders events
```

`docker buildx bake` reutiliza las definiciones de `compose.yaml` (contexto,
argumentos de construcción y nombre de la imagen). En equipos con procesador
Apple Silicon la variante `linux/amd64` se construye por emulación y tarda más.

### 4. Verificar

```bash
docker buildx imagetools inspect <IMAGE_REGISTRY>/bookstore-bff:<IMAGE_TAG>
```

La salida debe listar las plataformas `linux/amd64` y `linux/arm64`.

## Despliegue en AWS

Docker Compose se usa únicamente para el entorno local. En AWS los servicios
corren en **Amazon EKS** (manifiestos en `k8s/`), la base de datos en **Amazon
RDS**, la SPA en **Amazon S3** y el tráfico entra por **Cloudflare** y un
**Application Load Balancer**. Los nombres de las variables son los mismos
(`.env.aws.example`), pero se definen con ConfigMap y Secret.

La guía paso a paso del despliegue está en [`k8s/README.md`](k8s/README.md).

Para la inicialización manual de PostgreSQL en Amazon RDS se dispone de:

```text
database/rds/bootstrap.env.example
database/rds/bootstrap.sh
```

Las instrucciones de configuración y ejecución correspondientes se encuentran
en las guías de laboratorio.

## Requisitos

Para ejecutar el proyecto se requiere:

- Docker;
- Docker Compose.

El proyecto utiliza Node.js 24 en los componentes que requieren Node.js.

## Ambiente instruccional

La aplicación utiliza un mecanismo de autenticación simplificado para fines
académicos.

Un usuario disponible en los datos iniciales es:

```text
synthetic.customer.0008@bookstore.test
```

No requiere contraseña.

## Uso durante el curso

El código fuente, la configuración, el esquema de base de datos, los datos
disponibles y el comportamiento observable de la aplicación forman parte de
los recursos que pueden ser analizados durante el proyecto.

Las instrucciones específicas para cada actividad, laboratorio o fase del
proyecto se proporcionan en los documentos correspondientes del curso.
