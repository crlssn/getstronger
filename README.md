# One More Rep

**Track your training. Beat your last.**

**One More Rep** is an open-source gym workout application designed to help users track strength training routines, monitor progress, and connect with others in the fitness community.

---

## Key Features

- **Workout Tracking**: Log exercises, sets, and reps with ease.
- **Personal Bests**: Automatically track and display personal records for each exercise.
- **Social Features**: Follow friends, share progress, and stay motivated.
- **Progress Analytics**: Visualise strength gains over time.
- **Mobile-First Design**: Optimised for mobile devices to ensure seamless usability in the gym.

---

## Live Demo

Experience the app firsthand:
[**Visit One More Rep**](https://www.getstronger.pro)

Use the demo account to explore all features:

- **Email**: `demo@demo.com`
- **Password**: `demodemo`

---

## Screenshots

<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/f6ee3471-a98f-4db6-864e-4bff35327805"/></td>
    <td><img src="https://github.com/user-attachments/assets/2722f99c-611b-45d4-aeaf-008138e75531"/></td>
    <td><img src="https://github.com/user-attachments/assets/798fdbec-d2ca-4538-a65f-fd393cb9b000"/></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/cba930ad-955c-44b5-a0e1-dc7c7222ce95"/></td>
    <td><img src="https://github.com/user-attachments/assets/c51dc22a-aa9f-4bc9-8ee0-095c825f3f03"/></td>
    <td><img src="https://github.com/user-attachments/assets/1ee2fd43-12dd-4b11-b58c-6d7c7f5bbd89"/></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/e0352822-b965-41ca-a1f2-a05d32c8402c"/></td>
    <td><img src="https://github.com/user-attachments/assets/ad944620-df23-4c19-8e3a-ec2c50f5edd1"/></td>
    <td><img src="https://github.com/user-attachments/assets/08b1d2b1-3e52-43f3-959e-d7955e4065b6"/></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/f200ac6f-5e6f-4d30-8ee0-bcfc085a03d3"/></td>
    <td><img src="https://github.com/user-attachments/assets/0c93392e-071f-4360-9b9f-22de6e79bdc9"/></td>
    <td><img src="https://github.com/user-attachments/assets/61c8574f-be29-4a60-99c1-573f3bfd6b83"/></td>
  </tr>
</table>

---

## Tech Stack

- **Web**: TypeScript (Vue.js, Tailwind CSS)
- **Backend**: Golang
- **Database**: PostgreSQL
- **APIs**: gRPC-compatible, Protocol Buffers
- **Infrastructure**: Scaleway (Instances, Serverless SQL Database, Object Storage, Edge Services)
- **CI/CD**: GitHub Actions

---

## Getting Started

### Prerequisites

- [**mise**](https://mise.jdx.dev/getting-started.html)
- **Docker**

mise installs the project's pinned Go, Node.js, and development tool versions from `mise.toml`.

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/crlssn/getstronger.git
   cd getstronger
   ```

2. Trust the project configuration, then install tools and dependencies:
   ```bash
   mise trust
   mise run install
   ```

3. Initialise `.env` files for the web and backend: files you may need to update to suite your environment.
   ```bash
   mise run env
   ```

4. Initialise the database:
   ```bash
   mise run db:init
   ```

5. Run database migrations:
   ```bash
   mise run db:migrate
   ```

6. (Optional) Seed the database:
   ```bash
   mise run db:seed
   ```

7. (Optional) Generate self-signed certificates for the backend:
   ```bash
   mise run gen:certs
   ```
   **⚠ You must trust the self-signed certificate in your browser after you've started the backend.**

8. Start the email app if you want to sign up locally and your `EMAIL_PROVIDER` env is set to `local`:
   ```bash
   mise run app:email
   ```

9. Start the backend app:
   ```bash
   mise run app:backend
   ```

10. Start the web app:
   ```bash
   mise run app:web
   ```

11. Access the web app at [http://localhost:5173](http://localhost:5173). You can now login with email `john@doe.com` and password `123` if you seeded the database.

## Production infrastructure on Scaleway

Production infrastructure is provisioned manually in the [Scaleway console](https://console.scaleway.com/) (ClickOps). The suggested layout is:

- a Scaleway Instance for the Go API;
- a Serverless SQL Database for PostgreSQL;
- an Object Storage bucket with the Bucket Website feature for the Vue application;
- Edge Services in front of the bucket for HTTPS and a custom domain; and
- Scaleway Domains and DNS for the `api` and `www` records.

Choose one region for the regional resources (for example, Paris) and one nearby Availability Zone for the Instance. Resource names below are examples and can be changed.

### 1. Create the project and database identities

1. Create or select a Scaleway Project dedicated to the production environment.
2. Open **IAM & API keys**, create an IAM application named `getstronger-runtime`, and create a policy for it scoped to the production Project.
3. Add the `ServerlessSQLDatabaseDataReadWrite` permission set from the **Databases** product. This lets the API modify table data without granting it schema-management access.
4. Create an API key for the runtime application. Save both the application ID and secret key in a password manager; the secret key is only displayed once.
5. Create a second IAM application named `getstronger-migrations` with a policy scoped to the production Project.
6. Add the `ServerlessSQLDatabaseReadWrite` permission set. This lets the GitHub Actions migration job modify both data and table structure without granting access to create databases or edit database settings.
7. Create an API key for the migration application and save its application ID and secret key separately.

See Scaleway's guides to [IAM applications](https://www.scaleway.com/en/docs/iam/how-to/manage-applications/) and [Serverless SQL permissions](https://www.scaleway.com/en/docs/serverless-sql-databases/how-to/manage-permissions/) for the current console screens.

### 2. Create Serverless PostgreSQL

1. Open **Databases > Serverless SQL** and click **Create database**.
2. Select the region and a PostgreSQL version supported by this application, configure the minimum and maximum vCPU limits, and name the database `getstronger`.
   - A minimum of `0` vCPU costs less while idle but introduces cold starts.
   - A minimum of `1` vCPU avoids cold starts and is the safer production default.
   - Set a conservative maximum initially to cap unexpected spend; it can be raised later.
3. Create the database. On its **Overview** tab, click **Connect application**, select `getstronger-runtime`, and use its API key.
4. Save the connection parameters shown by Scaleway. The host, port, and database name are shared by both identities. Map the credentials as follows:

   | Backend variable | Scaleway value |
   | --- | --- |
   | `DB_HOST` | Database hostname |
   | `DB_PORT` | `5432` |
   | `DB_NAME` | Database name (`getstronger`) |
   | `DB_USER` | `getstronger-runtime` IAM application ID |
   | `DB_PASSWORD` | `getstronger-runtime` IAM secret key |
   | `DB_MIGRATION_USER` | `getstronger-migrations` IAM application ID |
   | `DB_MIGRATION_PASSWORD` | `getstronger-migrations` IAM secret key |

Serverless SQL requires TLS. To verify the credentials and apply the schema from a trusted machine, run:

```bash
export DB_HOST='<database-hostname>'
export DB_PORT='5432'
export DB_NAME='getstronger'
export DB_MIGRATION_USER='<migration-iam-application-id>'
export DB_MIGRATION_PASSWORD='<migration-iam-secret-key>'

psql "postgresql://${DB_MIGRATION_USER}:${DB_MIGRATION_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
migrate -path database/migrations/ \
  -database "postgresql://${DB_MIGRATION_USER}:${DB_MIGRATION_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require" \
  -verbose up
```

The connection format and mandatory `sslmode=require` setting are documented in [Connect to a Serverless SQL Database](https://www.scaleway.com/en/docs/serverless-sql-databases/how-to/connect-to-a-database/).

### 3. Create the API Instance

1. Open **Compute > CPU & GPU Instances** and create an Ubuntu LTS Instance in the chosen Availability Zone. Start with the smallest development or general-purpose size that comfortably runs the Go API; resize after observing real usage.
2. Attach a flexible public IPv4 address and your administrator SSH key.
3. Create a dedicated security group with these inbound rules:
   - TCP `22` from administrator IP ranges only;
   - TCP `80` from anywhere, for HTTP-to-HTTPS redirects and certificate issuance; and
   - TCP `443` from anywhere, for the public API.
4. Keep outbound traffic allowed and leave database port `5432` closed inbound on the Instance. The API connects outbound to the Serverless SQL hostname.
5. Install the API as a system service and put a TLS-terminating reverse proxy such as Caddy or nginx in front of it. Keep the application bound to a non-public port such as `8080`, configure a health check against `/healthz`, and provide the backend with certificate and key paths so it emits secure authentication cookies.
6. Store the backend `.env` beside the deployed binary with permissions limited to the service account. The application requires this file at startup.

At minimum, configure:

```dotenv
ENV=production
DB_HOST=<database-hostname>
DB_PORT=5432
DB_NAME=getstronger
DB_USER=<runtime-iam-application-id>
DB_PASSWORD=<runtime-iam-secret-key>
CORS_ALLOWED_ORIGIN=https://www.example.com
SERVER_PORT=8080
SERVER_CERT_PATH=<path-to-backend-certificate>
SERVER_KEY_PATH=<path-to-backend-private-key>
COOKIE_DOMAIN=.example.com
JWT_ACCESS_TOKEN_KEY=<long-random-secret>
JWT_REFRESH_TOKEN_KEY=<different-long-random-secret>
EMAIL_PROVIDER=noop
```

Replace `example.com` with the production domain. The backend currently supports `ses`, `local`, and `noop` email providers; it does not yet support Scaleway Transactional Email. `noop` disables delivery, including verification and password-reset messages, so keep a separately configured SES account if those flows must work. Never commit the production `.env` or IAM secret key.

### 4. Host the web application

1. Open **Object Storage**, create a bucket in the same region, and enable the **Bucket Website** feature.
2. Set both the index document and error document to `index.html`; the error document provides fallback routing for the Vue single-page application.
3. Build the web application with its production API URL, then upload the contents of `web/dist/` through the console:

   ```bash
   cd web
   VITE_API_URL=https://api.example.com npm run build
   ```

4. When using Edge Services with the Bucket Website feature, the objects can remain private. If the bucket website is exposed directly instead, make the website objects publicly readable; bucket visibility controls object listing, not whether each object is public.
5. Open **Network > Edge Services**, create a pipeline with the Object Storage bucket as its backend, and configure `www.example.com` as its custom domain. Generate a managed Let's Encrypt certificate in the wizard. Caching and WAF are optional and can be enabled there.

Refer to Scaleway's guides for [creating the bucket](https://www.scaleway.com/en/docs/object-storage/how-to/create-a-bucket/), [static website hosting](https://www.scaleway.com/en/docs/account/reference-content/use-case-informational-website/), and [Edge Services](https://www.scaleway.com/en/docs/edge-services/quickstart/).

### 5. Configure DNS and validate

1. In **Domains and DNS**, add or open the production DNS zone.
2. Create an `A` record for `api.example.com` pointing to the Instance's flexible IPv4 address.
3. Let the Edge Services custom-domain wizard create the `www.example.com` CNAME automatically when the domain is managed by Scaleway. For an external DNS provider, copy the pipeline endpoint into a CNAME record and use **Verify CNAME** in the wizard.
4. Wait for DNS and certificates to become active, then verify:

   ```bash
   curl --fail https://api.example.com/healthz
   ```

5. Open `https://www.example.com`, sign in with a seeded test account, and confirm that authentication and an API-backed page work. If email delivery is configured, also test registration and password reset. Review Serverless SQL metrics, Instance health, and the Scaleway cost estimate after the first deployment.

The DNS console flow is described in [Configure DNS zones](https://www.scaleway.com/en/docs/domains-and-dns/how-to/configure-dns-zones/).

### 6. Connect the deployment workflow

The GitHub Actions deployment workflow uploads the API over SSH and uses Scaleway Object Storage's S3-compatible endpoint for the web build. Create a separate IAM application named `getstronger-deploy`, give it `ObjectStorageBucketsRead`, `ObjectStorageObjectsRead`, `ObjectStorageObjectsWrite`, and `ObjectStorageObjectsDelete` on the production Project, and set that Project as the API key's preferred Object Storage Project.

Configure these GitHub repository variables:

```text
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_MIGRATION_USER
CORS_ALLOWED_ORIGIN, SERVER_PORT, SERVER_CERT_PATH, SERVER_KEY_PATH
COOKIE_DOMAIN, EMAIL_PROVIDER, VITE_API_URL
SCW_INSTANCE_HOST, SCW_INSTANCE_USER, SCW_INSTANCE_APP_DIR
SCW_REGION, SCW_BUCKET_NAME
```

Configure these GitHub repository secrets:

```text
DB_PASSWORD, DB_MIGRATION_PASSWORD
JWT_ACCESS_TOKEN_KEY, JWT_REFRESH_TOKEN_KEY
SCW_INSTANCE_SSH_KEY, SCW_ACCESS_KEY_ID, SCW_SECRET_KEY
```

Set `DB_USER` and `DB_PASSWORD` to the runtime IAM application's ID and secret key. Set `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` to the migration IAM application's ID and secret key. The workflow uses the migration identity only in the database job and writes only the runtime identity to the API's `.env` file.

The Object Storage API key's access key goes in `SCW_ACCESS_KEY_ID` and its secret key goes in `SCW_SECRET_KEY`. See [Using IAM API keys with Object Storage](https://www.scaleway.com/en/docs/iam/api-cli/using-api-key-object-storage/) for the preferred-Project behavior.

## End-to-end tests

The browser suite covers release-critical authentication, navigation, training, workout, exercise, progress, and social flows. It uses the local seeded John and Jane Doe accounts and resets the database before every local suite run. The complete suite runs in mobile Chromium, with responsive coverage in desktop Chromium and smoke coverage in Firefox and WebKit.

Install the Playwright browser once:

```bash
mise run install:e2e
```

With the local PostgreSQL container running and migrations applied, run the suite:

```bash
mise run test:e2e
```

To run the non-mutating smoke scenarios against a deployed environment, provide its URL and credentials. Live mode never seeds the database and automatically excludes mutation scenarios:

```bash
E2E_BASE_URL=https://example.com E2E_USER_EMAIL=user@example.com E2E_USER_PASSWORD=secret mise run test:e2e:live
```

For interactive debugging, use either the visible browser or Playwright UI:

```bash
mise run test:e2e:headed
mise run test:e2e:ui
```

Open the most recent HTML report from the repository root with:

```bash
mise run test:e2e:report
```

Playwright starts isolated HTTP instances of the backend and web app on ports `18080` and `15173`, so it does not depend on or conflict with the normal local TLS services. The fixtures fail on browser console/page errors, failed requests, backend 5xx responses, and WCAG A/AA violations where accessibility assertions are applied. Failed tests retain their screenshot and trace under `web/test-results/`; the HTML report is written to `web/playwright-report/`.
