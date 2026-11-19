# Despliegue en AWS (EKS)

Guía para desplegar los microservicios según el diagrama de arquitectura:
Netlify (SPA) → ALB → BFF → servicios gRPC en EKS → RDS, con los logs de
clickstream enviados a S3 por un sidecar Vector.

```text
Usuarios ─HTTPS─▶ Netlify ─ /*     ─▶ la SPA (frontend/dist)
                          └ /api/*  ─proxy─▶ ALB ─▶ bff ─gRPC─▶ auth · catalog · orders · events
                                                                  │
                                                  RDS (un esquema por servicio)
bff y events ─ sidecar Vector ─▶ S3 (clickstream)
```

## Archivos de esta carpeta

| Archivo | Qué crea |
|---|---|
| `00-namespace.yaml` | Namespace `bookstore` |
| `vector-config.yaml` | Configuración del sidecar Vector (compartida) |
| `catalog.yaml`, `auth.yaml`, `orders.yaml`, `events.yaml` | ConfigMap + Deployment + Service **headless** (gRPC) |
| `bff.yaml` | ConfigMap + Deployment + Service ClusterIP (HTTP :5001) |
| `ingress.yaml` | IngressClass/Params del ALB + Ingress `/api` → `bff` |

Los Secrets no están en esta carpeta: se crean con `kubectl` (paso 5).

## Requisitos

- Cuenta de AWS (Learner Lab) con `aws` CLI configurada, `kubectl` y Docker con `buildx`.
- Los 3 recursos de AWS del diagrama creados: **ECR** (5 repositorios), **RDS** PostgreSQL y **EKS**.
- Un bucket de S3 para el clickstream y una cuenta de Netlify para la SPA.

## 1. Imágenes en ECR

Los pasos están en el [README principal](../README.md#publicar-imágenes). El
resultado: `bookstore-bff`, `-auth`, `-catalog`, `-orders` y `-events` con la
etiqueta que usan los manifiestos (`1.0.0`; si publicas otra, cámbiala en los
5 Deployments).

## 2. Base de datos (RDS)

Crea la instancia en la **misma VPC que el cluster**, sin acceso público, con
el nombre de base de datos inicial `bookstore` y un *security group* que permita
PostgreSQL (puerto 5432) desde el CIDR de la VPC.

La base no se puede alcanzar desde fuera de la VPC, así que se inicializa
**desde dentro del cluster** (paso 6).

## 3. Bucket de S3 y sitio en Netlify

- **Clickstream:** un bucket privado. Su nombre va en `S3_BUCKET` del sidecar.
- **SPA:** crea el sitio en Netlify conectado a este repositorio, con *Base
  directory* = `frontend` (usa `frontend/netlify.toml`). Anota su dominio
  (`<algo>.netlify.app`): lo necesita el BFF en `CORS_ORIGINS` (paso 4). Aún no
  despliegues: falta el DNS del ALB (paso 8).

## 4. Reemplazar los marcadores

Los manifiestos traen valores `REPLACE_WITH_...` que debes cambiar:

```bash
sed -i "s|REPLACE_WITH_ACCOUNT_ID|<tu-cuenta>|g"             k8s/*.yaml
sed -i "s|REPLACE_WITH_RDS_ENDPOINT|<endpoint-de-rds>|g"     k8s/*.yaml
sed -i "s|REPLACE_WITH_CLICKSTREAM_BUCKET|<bucket>|g"        k8s/*.yaml
sed -i "s|REPLACE_WITH_NETLIFY_DOMAIN|<algo>.netlify.app|g"  k8s/*.yaml
```

## 5. Secrets

Los Secrets no se suben al repositorio: se crean directamente en el cluster.
Cada servicio con base de datos recibe solo la contraseña de **su** rol, y el
secreto `jwt` lo usan Auth (para emitir tokens) y el BFF (para verificarlos):

```bash
kubectl apply -f k8s/00-namespace.yaml

kubectl -n bookstore create secret generic db-auth    --from-literal=DB_USER=auth_app    --from-literal=DB_PASSWORD='<...>'
kubectl -n bookstore create secret generic db-catalog --from-literal=DB_USER=catalog_app --from-literal=DB_PASSWORD='<...>'
kubectl -n bookstore create secret generic db-orders  --from-literal=DB_USER=orders_app  --from-literal=DB_PASSWORD='<...>'
kubectl -n bookstore create secret generic jwt        --from-literal=AUTH_JWT_SECRET='<mínimo 32 caracteres>'
```

## 6. Inicializar la base de datos

Un pod temporal con la imagen de PostgreSQL copia la carpeta `database/` y
ejecuta `bootstrap.sh` contra RDS (crea los esquemas, los roles y el seed):

```bash
aws eks update-kubeconfig --name <cluster> --region us-east-1
kubectl -n bookstore run dbtool --image=postgres:17 --restart=Never -- sleep 3600
kubectl -n bookstore wait --for=condition=Ready pod/dbtool
kubectl cp database bookstore/dbtool:/database
kubectl -n bookstore exec dbtool -- env \
  DB_HOST=<endpoint-de-rds> DB_ADMIN_USER=bookstore_admin DB_ADMIN_PASSWORD='<...>' \
  AUTH_DB_PASSWORD='<...>' CATALOG_DB_PASSWORD='<...>' ORDERS_DB_PASSWORD='<...>' \
  INGEST_DB_PASSWORD='<...>' bash /database/rds/bootstrap.sh
kubectl -n bookstore delete pod dbtool
```

Las contraseñas de los tres roles son las mismas del paso 5. Debe terminar con
`Verification completed successfully`. En Git Bash (Windows) antepón
`MSYS_NO_PATHCONV=1` a los comandos `kubectl cp` y `kubectl exec`, o convierte
las rutas `/database/...` en rutas de Windows.

## 7. Aplicar

```bash
aws eks update-kubeconfig --name <cluster> --region us-east-1
kubectl apply -f k8s/
kubectl -n bookstore get pods
```

Cada Deployment debe quedar con 2 réplicas `Running` (los de `bff` y `events`
muestran `2/2`: la aplicación y el sidecar Vector). Si un pod no arranca,
`kubectl -n bookstore logs <pod> -c <contenedor>` muestra el motivo; lo más
común es una variable mal escrita, porque los servicios validan su
configuración al iniciar.

## 8. Conectar Netlify con el ALB

El ALB tarda un par de minutos en tener DNS:

```bash
kubectl -n bookstore get ingress bookstore       # columna ADDRESS
```

Pon ese valor en `frontend/netlify.toml` (reemplaza `<DNS-DEL-ALB>`), haz
commit y push: Netlify construye y despliega. A partir de ahí Netlify sirve la
SPA y reenvía `/api/*` al ALB, así que el navegador solo habla con un dominio
(sin CORS). Netlify termina el HTTPS (por eso las cookies son `Secure`) y el BFF
confía en 2 proxies delante: Netlify y el ALB (`HTTP_TRUST_PROXY_HOPS=2`).

El tramo Netlify → ALB va por HTTP; es aceptable en el laboratorio. Con un
dominio propio se le pondría un certificado al ALB.

## 9. Verificar

```bash
curl https://<algo>.netlify.app/api/books?limit=2   # lista libros (pasa por todo el camino)
kubectl -n bookstore get pods -o wide             # réplicas repartidas entre zonas
```

Inicia sesión en la SPA con `synthetic.customer.0008@bookstore.test` y haz una
compra. Pasados ~60 s deben aparecer objetos en
`s3://<bucket-clickstream>/clickstream/bff/<pod>/AAAA/MM/DD/`.

## Sidecar Vector: cómo funciona

- El BFF y Events escriben el clickstream en `/usr/src/app/logs/clickstream.log`,
  un volumen `emptyDir` compartido con el sidecar.
- Vector lee ese archivo (montado de solo lectura en `/logs`) y envía los
  eventos a S3 en lotes de 60 s, comprimidos con gzip. La clave incluye el
  servicio y el pod, así dos réplicas nunca escriben el mismo objeto.
- Si el contenedor de Vector se reinicia, retoma desde la última línea enviada
  (guarda su posición en otro `emptyDir`). Si se reemplaza el **pod**, los
  eventos que no se alcanzaron a enviar se pierden: es el límite de usar un
  volumen efímero.

### Credenciales de AWS para Vector

Vector usa la cadena estándar de AWS. Hay dos caminos:

1. **Rol del nodo (preferido).** El pod toma las credenciales del rol de las
   instancias (en Learner Lab, `LabRole`), siempre que pueda alcanzar el
   servicio de metadatos. Si en los logs de Vector aparece un error de
   credenciales, es porque los pods no lo alcanzan (límite de saltos del
   IMDS en 1).
2. **Secret de respaldo.** Copia las credenciales temporales del panel
   *AWS Details* del laboratorio y crea el Secret; los sidecars lo toman solos
   (está declarado como opcional):

   ```bash
   kubectl -n bookstore create secret generic aws-credentials \
     --from-literal=AWS_ACCESS_KEY_ID='<...>' \
     --from-literal=AWS_SECRET_ACCESS_KEY='<...>' \
     --from-literal=AWS_SESSION_TOKEN='<...>'
   kubectl -n bookstore rollout restart deploy/bff deploy/events
   ```

   Las credenciales del laboratorio caducan con la sesión: hay que
   renovarlas cada vez.

El rol (o las credenciales) necesita `s3:PutObject` sobre el bucket de
clickstream.

## Limpieza (importante con créditos limitados)

El control plane de EKS, los NAT Gateway y RDS cobran por hora aunque no haya
tráfico. Al terminar la sesión:

```bash
kubectl delete -f k8s/          # elimina pods y el ALB
```

y borra o detén el cluster y la instancia de RDS.
