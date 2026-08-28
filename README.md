# GetStronger

**Lift it. Log it. Beat it.**

**GetStronger** is an open-source gym workout application designed to help users track strength training routines, monitor progress, and connect with others in the fitness community.

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
[**Visit GetStronger**](https://www.getstronger.studio)

Sign up with your email address to explore all features.

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

- **Web**: TypeScript (React, Tailwind CSS)
- **Mobile**: Capacitor (native iOS and Android wrappers around the web app)
- **Backend**: Golang
- **Database**: PostgreSQL
- **APIs**: gRPC-compatible, Protocol Buffers
- **Infrastructure**: Scaleway (Serverless Containers, Serverless SQL Database, Object Storage, Edge Services)
- **CI/CD**: GitHub Actions

---

## Getting Started

### Prerequisites

- [**mise**](https://mise.jdx.dev/getting-started.html)
- **Docker**

mise installs the project's pinned Go, Node.js, Bun, and development tool versions from `mise.toml`. Bun installs the JavaScript dependencies; the scripts themselves still run on Node.

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

11. Access the web app at [http://localhost:5173](http://localhost:5173). If you seeded the database, use either local persona (both use password `password123`):

    | Persona | Email | What it contains |
    | --- | --- | --- |
    | Newly signed up — Sam Taylor | `new@getstronger.test` | An empty, recently created account for onboarding and first-use flows |
    | Active for a year — Alex Morgan | `active@getstronger.test` | A year of weekly workouts plus followers, following, routines, and feed activity |

## Native mobile apps

The iOS and Android apps are [Capacitor](https://capacitorjs.com) projects in `mobile/` that wrap the built web bundle from `web/dist`, so the React codebase in `web/` stays the single source of truth. The checked-in `mobile/ios` and `mobile/android` directories are ordinary Xcode and Android Studio projects; iOS dependencies are managed with Swift Package Manager, so CocoaPods is not required.

### Prerequisites

- **iOS**: Xcode with the iOS simulator platform installed (`xcodebuild -downloadPlatform iOS`)
- **Android**: Android Studio (or the Android SDK plus a JDK) with an emulator or connected device

### Workflow

Build and launch the app in a simulator or emulator:

```bash
mise run app:ios
```

```bash
mise run app:android
```

Both tasks first run `mise run mobile:sync`, which rebuilds the web bundle and copies it into the native projects. Run the sync on its own after changing anything in `web/` while working in Xcode or Android Studio:

```bash
mise run mobile:sync
```

The WebView loads the bundled assets, so it has no dev-server proxy: syncs build against the production API by default, and `VITE_API_URL` overrides it, e.g. `VITE_API_URL=http://10.0.2.2:8080 mise run mobile:sync` for a local backend reachable from the Android emulator.

Native builds route unary API calls through Capacitor's native HTTP layer, so they bypass CORS and keep the refresh-token cookie in the platform's cookie jar. Server-streaming calls (the unread-notification stream) still run through the WebView's `fetch`, which means the backend's `CORS_ALLOWED_ORIGIN` must include the native origins `capacitor://localhost` (iOS) and `http://localhost` (Android). Without them the app still works; unread counts then update through polling alone.

### Deep links

Verification and password-reset emails link to the web domain. The native projects are configured so those links open the app once domain verification is in place: the iOS project declares an Associated Domain (`applinks:www.getstronger.studio`) and the Android manifest carries an `autoVerify` intent filter for the same host. Both platforms fall back to the browser until the two files under `web/public/.well-known/` are filled with the release identities from the store setup:

- `apple-app-site-association` needs the Apple Team ID in `appIDs` — and must be served as `application/json`, which is worth checking on the bucket/CDN.
- `assetlinks.json` needs the SHA-256 fingerprint of the Android release signing certificate.

The custom `getstronger://` scheme opens the app directly on both platforms without any verification, e.g. `getstronger://verify-email?token=…`, which is useful for testing the routing.

### Releasing

App icons and splash screens are generated from the brand logo — `npm run assets` in `mobile/` re-renders the sources in `mobile/assets/` from `web/src/assets/logo-mono.svg` and regenerates every platform variant.

The `release-mobile` workflow (manual trigger) builds the web bundle against the `production` GitHub Environment, archives both apps with the run number as build number, and uploads to TestFlight and Play internal testing. Shipping a native build is therefore a deliberate act against production, independent of the web and API deploys. Before its first run, the following one-time setup is needed:

1. **Accounts**: an Apple Developer Program membership and a Google Play developer account; register the bundle id `com.getstronger.app` in both (or change it in `mobile/capacitor.config.ts` first — it is provisional until the first store submission).
2. **iOS secrets**: `APPLE_TEAM_ID`, plus an App Store Connect API key (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` — the `.p8` contents). The workflow uses Xcode cloud signing (`-allowProvisioningUpdates`), so no certificates or profiles need exporting.
3. **Android secrets**: an upload keystore (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` if the key's password differs from the store's) and a Play service account (`PLAY_SERVICE_ACCOUNT_JSON`); the very first `.aab` must be uploaded through the Play Console by hand before the API can publish to a track.
4. **Deep-link identities**: fill the placeholders in `web/public/.well-known/` — the Apple Team ID in `apple-app-site-association` and the SHA-256 fingerprint of the upload key in `assetlinks.json` (`keytool -list -v -keystore …`) — and redeploy the web app.
5. **Store listings**: screenshots (the `mise run screenshots` contact sheet is a good source), the privacy policy URL (`https://www.getstronger.studio/privacy`), and the privacy declarations described below.
6. **A review account**: every screen sits behind a sign-in, so App Review and Play both need working credentials for the production API. Create a real account and hand it over in the review notes; do not point them at a seed persona, which only exists locally.

#### Privacy declarations

Apple's nutrition labels and Google's Data safety form are filled in from the same facts, and the three places that state them must agree: the policy page (`web/src/ui/PrivacyPolicy.tsx`), the iOS privacy manifest (`mobile/ios/App/App/PrivacyInfo.xcprivacy`), and the store consoles. As shipped the app collects email address, name, username, user id, fitness data, product interaction and crash data; all of it is linked to the account, none of it is used for tracking or advertising, and PostHog is the only third party that receives usage events. `ITSAppUsesNonExemptEncryption` is declared `false` in `Info.plist`, so TestFlight uploads skip the manual compliance question.

Account deletion is a store requirement rather than a nicety: both stores refuse an app that lets people create an account without letting them delete it from inside the app. It lives under Me → Delete account, and erases the account and everything it owns.

The `privacy@getstronger.studio` address the policy points at has to receive mail before the first submission — the policy is the only route people have for a data request.

## Hosting infrastructure on Scaleway

Infrastructure is provisioned manually in the [Scaleway console](https://console.scaleway.com/) (ClickOps). Each deployed environment — production, and the beta environment every merge to `main` lands on — is one copy of this layout:

- a Serverless Container for the Go API, fed from a Container Registry namespace;
- a Serverless SQL Database for PostgreSQL;
- an Object Storage bucket with the Bucket Website feature for the React application;
- Edge Services in front of the bucket for HTTPS and a custom domain; and
- Scaleway Domains and DNS for the `api` and `www` records.

Steps 1 to 7 below walk through production; step 8 covers what beta duplicates and what it must not share. Choose one region for the regional resources (for example, Paris). Resource names below are examples and can be changed.

### 1. Create the project and database identities

1. Create or select a Scaleway Project dedicated to the production environment.
2. Open **IAM & API keys**, create an IAM application named `getstronger-runtime`, and create a policy for it scoped to the production Project.
3. Add the `ServerlessSQLDatabaseDataReadWrite` permission set from the **Databases** product. This lets the API modify table data without granting it schema-management access.
4. Create an API key for the runtime application. Save both the application ID and secret key in a password manager; the secret key is only displayed once.
5. Create a second IAM application named `getstronger-migrations` with a policy scoped to the production Project.
6. Add the `ServerlessSQLDatabaseReadWrite` permission set. This lets the GitHub Actions migration job modify both data and table structure without granting access to create databases or edit database settings.
7. Create an API key for the migration application and save its application ID and secret key separately.
8. Create a third IAM application named `getstronger-email` with a policy scoped to the production Project.
9. Add the `TransactionalEmailEmailApiCreate` permission set so the application can send transactional emails without receiving broader Transactional Email permissions.
10. Create an API key for the email application and save its secret key.

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

### 3. Create the API container

1. Open **Containers > Container Registry** and create a namespace named `getstronger` in the chosen region. The deployment workflow pushes the API image to `rg.fr-par.scw.cloud/getstronger/server`, tagged with the deployed commit and nothing else — no moving tag, so both environments share the namespace without being able to roll out to each other. A container's **Image** therefore names a commit that can be checked out, which is what makes it an answer to what is running.
2. Open **Serverless > Containers**, create a namespace, and create a container from any image the workflow has pushed, listening on port `8080` (the port the Dockerfile exposes and `SERVER_PORT` must match). Each deploy repoints the container at its own commit's image, so the one chosen here only has to get it started.
3. Resources of `250 mVCPU` and `256 MB` are comfortable for the Go API. For autoscaling, use request concurrency with a minimum of `1` instance to avoid cold starts on a user-facing API. Keep the maximum low: pubsub events are dispatched in-process, so live notifications do not propagate between instances.
4. Configure the container's environment variables and secrets as listed below. Use the **Secrets** section for credentials; both surface to the process identically, but secrets are stored encrypted and hidden in the console.
5. Deploy the container and verify `https://<container-endpoint>/healthz` responds before wiring up the custom domain.

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
COOKIE_DOMAIN=.example.com
JWT_ACCESS_TOKEN_KEY=<long-random-secret>
JWT_REFRESH_TOKEN_KEY=<different-long-random-secret>
EMAIL_PROVIDER=scaleway
EMAIL_FROM_ADDRESS=noreply@getstronger.studio
SCW_PROJECT_ID=<production-project-id>
SCW_TEM_REGION=fr-par
SCW_TEM_SECRET_KEY=<email-iam-secret-key>
```

Replace `example.com` with the production domain. The backend supports Scaleway Transactional Email in production, a local SMTP capture service for development, and `noop` when delivery must be disabled. TLS termination is handled by Scaleway's ingress, so no reverse proxy or certificate management is needed in the container. Never commit production configuration or IAM secret keys.

### 4. Configure Transactional Email

1. Open **Transactional Email** in the Scaleway console and register the domain used by `EMAIL_FROM_ADDRESS` in the production Project.
2. Add the SPF, DKIM, and recommended MX records shown by Scaleway to the domain's DNS zone.
3. Run the domain check and wait until the sending domain is validated.
4. Set `SCW_PROJECT_ID` to the production Project ID, `SCW_TEM_REGION` to `fr-par`, and `SCW_TEM_SECRET_KEY` to the `getstronger-email` IAM application's secret key.

Transactional Email currently sends from the `fr-par` API endpoint. The setup and request format are documented in [Sending an email using the Transactional Email API](https://www.scaleway.com/en/docs/transactional-email/api-cli/send-emails-with-api/).

### 5. Host the web application

1. Open **Object Storage**, create a bucket in the same region, and enable the **Bucket Website** feature.
2. Set both the index document and error document to `index.html`; the error document provides fallback routing for the React single-page application.
3. Build the web application with its production API URL, then upload the contents of `web/dist/` through the console:

   ```bash
   cd web
   VITE_API_URL=https://api.example.com npm run build
   ```

4. When using Edge Services with the Bucket Website feature, the objects can remain private. If the bucket website is exposed directly instead, make the website objects publicly readable; bucket visibility controls object listing, not whether each object is public.
5. Open **Network > Edge Services**, create a pipeline with the Object Storage bucket as its backend, and configure `www.example.com` as its custom domain. Generate a managed Let's Encrypt certificate in the wizard. Caching and WAF are optional and can be enabled there.

Refer to Scaleway's guides for [creating the bucket](https://www.scaleway.com/en/docs/object-storage/how-to/create-a-bucket/), [static website hosting](https://www.scaleway.com/en/docs/account/reference-content/use-case-informational-website/), and [Edge Services](https://www.scaleway.com/en/docs/edge-services/quickstart/).

### 6. Configure DNS and validate

1. In **Domains and DNS**, add or open the production DNS zone.
2. Create a `CNAME` record for `api.example.com` pointing to the Serverless Container's endpoint (`…functions.fnc.fr-par.scw.cloud.`), then add `api.example.com` as a custom domain on the container's **Endpoints** tab. Scaleway validates the CNAME and issues a managed Let's Encrypt certificate.
3. Let the Edge Services custom-domain wizard create the `www.example.com` CNAME automatically when the domain is managed by Scaleway. For an external DNS provider, copy the pipeline endpoint into a CNAME record and use **Verify CNAME** in the wizard.
4. Wait for DNS and certificates to become active, then verify:

   ```bash
   curl --fail https://api.example.com/healthz
   ```

5. Open `https://www.example.com`, sign in with a seeded test account, and confirm that authentication and an API-backed page work. If email delivery is configured, also test registration and password reset. Review Serverless SQL metrics, the container's metrics and logs, and the Scaleway cost estimate after the first deployment.

The DNS console flow is described in [Configure DNS zones](https://www.scaleway.com/en/docs/domains-and-dns/how-to/configure-dns-zones/).

### 7. Connect the deployment workflow

The GitHub Actions deployment workflow builds the API's `linux/amd64` Docker image on its runner, pushes it to the Container Registry, and triggers a new deployment of the Serverless Container, which pulls the image tag belonging to the environment being deployed. The web build is uploaded through Scaleway Object Storage's S3-compatible endpoint. The AWS CLI is only the S3 protocol client recommended by Scaleway; the workflow's explicit `scw.cloud` endpoint ensures that it does not access or create AWS resources. Create a separate IAM application named `getstronger-deploy`; give it `ObjectStorageBucketsRead`, `ObjectStorageObjectsRead`, `ObjectStorageObjectsWrite`, and `ObjectStorageObjectsDelete` (with the deployed Project as the API key's preferred Object Storage Project) plus `ContainerRegistryFullAccess` and `ContainersFullAccess` on that Project.

#### Environments and triggers

The workflow deploys to one of two GitHub Environments, `beta` and `production`, which hold everything that differs between the two targets. The trigger decides which:

| Trigger | Environment |
| --- | --- |
| Push to `main` | `beta` |
| Pull request labelled `deploy:beta` | `beta` |
| Published GitHub release | `production` |
| **Run workflow** (manual) | `beta` or `production`, chosen by an input |

A merge is therefore never a production deploy: `main` lands on beta, and production is promoted by publishing a release. Concurrency is scoped per environment so the two never queue behind each other.

Only a push deploys selectively, by the paths that changed since the last successful push deploy. A release and a labelled pull request deploy all three components, since neither wants an environment running half of one revision and half of another. Beta then keeps what the pull request left there until a later push or a manual run replaces it — run the workflow against `main` with all three components to put it back.

A push that changes `server/testing/factory/` reseeds beta's database, and a labelled pull request always does. Beta is a demo environment: it is meant to show the app's personas rather than whatever the last person testing it left behind. Reseeding is destructive, though, so a push that leaves the seed alone leaves beta's data alone — an unchanged seed writes the same personas back under different random names, at the cost of every account anyone made in the meantime. The seed truncates every table and rewrites it from `server/testing/factory/seed` in one transaction, so a failed seed leaves the previous data in place. Production is never seeded: the job runs only when the resolved environment is `beta`, and the seed refuses any `ENV` it may not wipe. A manual run can skip it with the **Seed** input.

Give the `production` environment a required reviewer under **Settings → Environments → production → Required reviewers**, so the promotion is an approval rather than an accident. Every deploying job names its environment, so a production run pauses before it touches anything.

Leave beta's deployment branch policy at **All branches**: a pull request labelled `deploy:beta` runs from its own branch, and a restrictive policy would reject it.

Configure these per environment, using the same names on both:

```text
Variables: DEPLOY_ENVIRONMENT, DB_HOST, DB_NAME, DB_MIGRATION_USER,
           SCW_CONTAINER_ID, SCW_BUCKET_NAME, VITE_API_URL,
           API_DOMAIN, COOKIE_DOMAIN, CORS_ALLOWED_ORIGIN, EMAIL_FROM_ADDRESS
Secrets:   DB_MIGRATION_PASSWORD
```

`DEPLOY_ENVIRONMENT` is the environment's own name, `beta` or `production`. Every deploying job refuses to start unless it matches the environment it was asked to deploy to: GitHub falls back to repository-scoped variables when an environment defines none, so without that check a half-configured `beta` would quietly deploy to production infrastructure. `API_DOMAIN`, `COOKIE_DOMAIN`, `CORS_ALLOWED_ORIGIN`, and `EMAIL_FROM_ADDRESS` are the container's own configuration rather than workflow inputs; they live here so each environment's values are recorded in one place.

`VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` are set on `production` only, and nowhere else — see step 8.

The `SEED_PASSWORD` secret is set on `beta` only, and it is required: the seeded logins are publicly reachable, so the seed refuses to run with the published local default password.

These stay at repository scope, shared by both environments:

```text
Variables: DB_PORT, SCW_REGION, SCW_PROJECT_ID, SCW_TEM_REGION
Secrets:   SCW_ACCESS_KEY_ID, SCW_SECRET_KEY
```

`DB_MIGRATION_PASSWORD` is the only secret that differs by environment; the API and web jobs authenticate to Scaleway with the shared `SCW_ACCESS_KEY_ID` and `SCW_SECRET_KEY`. A beta database in the production Project is reached by the same migration identity, so both environments hold the same value — set it on each anyway, so beta never depends on a repository-scoped fallback.

Set `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` to the migration IAM application's ID and secret key; the workflow uses the migration identity only in the database and seed jobs. The runtime identity is configured directly on the Serverless Container, not in GitHub. `SCW_CONTAINER_ID` is the Serverless Container's UUID, shown on its **Overview** tab in the console. If beta runs in its own Scaleway Project, put that Project's `SCW_ACCESS_KEY_ID` and `SCW_SECRET_KEY` on the `beta` environment; environment secrets take precedence over repository ones.

The Object Storage API key's access key goes in `SCW_ACCESS_KEY_ID` and its secret key goes in `SCW_SECRET_KEY`. See [Using IAM API keys with Object Storage](https://www.scaleway.com/en/docs/iam/api-cli/using-api-key-object-storage/) for the preferred-Project behavior.

#### Cutting a release

1. Open **Releases → Draft a new release** and create a tag such as `v1.4.0` on the commit to promote, or push the tag first with `git tag v1.4.0 && git push origin v1.4.0`.
2. Generate the release notes and publish. Publishing a pre-release triggers the same workflow, which makes it a usable rehearsal.
3. Approve the pending production deployment in the workflow run. Migrations run first, then the API, then the web app, all from the tagged commit.

To roll back, set the container's **Image** to an earlier commit's tag in the console and redeploy — a deploy pins that field rather than moving a tag, so nothing else has to change. Nothing prunes the registry, so clear out old commit tags there occasionally.

For the initial cutover of either environment, open the **deploy** workflow in GitHub Actions and choose **Run workflow**. It asks which environment to target and can independently migrate the Serverless SQL Database, reseed it, deploy the API, and deploy the web application. This is also the safe way to migrate a newly created database when no migration file changed in the triggering commit.

### 8. Create the beta environment

Beta is a full copy of the production stack, serving `https://beta.getstronger.studio` against `https://beta.api.getstronger.studio`. Repeat steps 2, 3, 5, and 6 with beta names and domains:

| Resource | Production | Beta |
| --- | --- | --- |
| Serverless SQL Database | `getstronger` | `getstronger-beta` |
| Serverless Container | `getstronger` | `getstronger-beta` |
| Object Storage bucket | `getstronger-public-bucket` | `beta.getstronger.studio` |
| Web domain | `www.getstronger.studio` | `beta.getstronger.studio` |
| API domain | `api.getstronger.studio` | `beta.api.getstronger.studio` |

Both environments push to the single `getstronger/server` registry namespace, which is safe because neither publishes a moving tag: every image is tagged with its commit, and a deploy repoints its own container at the commit it just built.

Beta's container takes the same configuration as step 3 with its own values, except `ENV=beta`: a deployed environment in every respect — secure cookies included — that the backend can still tell apart from production.

Keeping beta in the production Scaleway Project reuses the IAM applications from step 1: the migration and runtime permission sets are Project-scoped and already cover a second database. A separate Project isolates beta more strictly, at the cost of its own IAM applications and deploy key.

Two things to settle before beta takes traffic:

- **Analytics.** Beta sends none. `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` live on the `production` environment and at no other scope, so a beta build has no key and `posthog-js` never initialises. Leave both absent on `beta` rather than blank — a whitespace placeholder is still a value, and the app would initialise with it. Should beta ever need analytics, give it a second PostHog project rather than production's key.
- **Email.** Beta can share production's sending domain, since the verified identity is a domain rather than an environment; register a separate one in Transactional Email as in step 4 if beta's mail should be traceable apart from production's.

Bring beta up with **Run workflow** against the `beta` environment with all three components enabled, then verify:

```bash
curl --fail https://beta.api.getstronger.studio/healthz
```

Seed an account on the beta database and smoke-test the deployed stack with the live end-to-end suite described below.

## End-to-end tests

The browser suite covers release-critical authentication, navigation, training, workout, exercise, progress, and social flows. It uses the local seeded Sam Taylor and Alex Morgan personas, with Jane Doe and other seeded profiles providing social activity, and resets the database before every local suite run. The complete suite runs in mobile Chromium, with responsive coverage in desktop Chromium and smoke coverage in Firefox and WebKit.

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
E2E_BASE_URL=https://beta.getstronger.studio E2E_USER_EMAIL=user@example.com E2E_USER_PASSWORD=secret mise run test:e2e:live
```

Point it at beta rather than production: the suite signs in and browses as a real user, and beta is the environment that exists to absorb that.

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

---

## Mobile screenshots

`mise run screenshots` reseeds the database, takes a snapshot of what it seeded, and photographs every page of the app at a phone-sized viewport (390 × 844, retina density) for each seeded persona:

```bash
mise run screenshots
```

The images land in `web/screenshots/`, which Git ignores, one folder per audience:

- `guest/` — the pages a signed-out visitor sees.
- `active/` — Alex Morgan, the established account with a year of training.
- `new/` — Sam Taylor, the freshly signed-up account with no data of its own.

Each page is photographed one screenful at a time — `01-home-1.png`, `01-home-2.png`, and so on — up to four screens, so an endless feed never becomes a single unreadable strip and each image shows the sticky header and bottom navigation where a reader sees them. Set `SCREENSHOT_MAX_FOLDS` to capture more or fewer.

A run rewrites the folder from scratch and finishes by publishing what it saw twice over. `manifest.json` maps every image to its route, the component that renders it, and the measurements taken on the page; `index.html` is a contact sheet of the same set:

```bash
mise run screenshots:open
```

The measurements are leads for a design review rather than assertions, and cover what a screenshot cannot show: horizontal overflow, tap targets under 44 pixels, text under 12 pixels, hard-clipped text, and WCAG A/AA violations from axe.

The pages above show the app at rest. After them, each persona walks the app the way somebody building their training does, and every step is photographed — the form filled in just before submission, and what the app shows once it has been saved:

| Flow     | Captured states                                  |
| -------- | ------------------------------------------------ |
| Exercise | filled, saved                                    |
| Routine  | filled, saved                                    |
| Plan     | routine picker, filled, saved                    |
| Workout  | exercise added, set logged, finish dialog, saved |

Flows run last, because they create an exercise, a routine, a plan, and a workout that every page above would otherwise show. Each removes what it created afterwards, so the next run compares against the same starting point rather than accumulating. The newly signed-up account runs only the exercise flow: the others need exercises or routines it does not have. Add or change a flow in `web/tests/screenshots/flows.ts`.

One caveat for comparisons: the workout screen counts the seconds since the workout began, so its four captures differ by the pixels the clock occupies on every run. Everything else is byte-identical between runs.

Pages that need data the persona does not have — Sam has no workouts, and neither persona has a training plan until one is created — are recorded with a reason instead of being captured, so a missing screenshot is never a silent one. Detail pages find their identifiers by reading the links the app renders, so adding a page, or a state that is only reachable by interacting with a page such as the exercise picker, means adding an entry to `web/tests/screenshots/catalogue.ts`.

After changing a component, re-photograph only the pages it affects. This form matches page names, skips reseeding, and leaves the rest of the set in place:

```bash
mise run screenshots:page routine
```

To find out what a change actually moved, compare a run against the one before it. The set is copied aside first, and every page is re-photographed and compared pixel by pixel:

```bash
mise run screenshots:diff
```

The run reports the pages that moved, records them in the manifest, and writes a highlighted image of each difference to `web/screenshots/changes/`, alongside a `pages.tsv` naming every page it found and how it moved — added, removed, resized, or changed. A one-line change to `.auth-eyebrow`, for example, reports login, signup, forgot password, reset password, and the verification notice — including the pages nobody thought to check. Pass a pattern to compare a subset, as `screenshots:page` does.

The seed is never run again — it randomises names, so reseeding would move nearly every page and bury the change being looked at. Instead the run puts back the snapshot `mise run screenshots` took, so the comparison photographs the data the baseline photographed. Without it the flows' own exercises, routines and workouts carry from one run into the next, and pages nobody touched report a difference — twenty of them, for a change to one. Both runs also render relative times against the moment the snapshot was taken rather than against the wall clock, so a page does not move because "just now" became "three minutes ago". Two runs over an unchanged working tree therefore report nothing, which is what makes a run that reports something worth reading.

Like the end-to-end suite, the run starts its own backend and web server — on ports `18280` and `15273` by default — so it neither depends on nor disturbs the local development services.

### Publishing them to a pull request

GitHub's image uploader is a session-authenticated web endpoint, so neither `gh` nor `mise run pr:create` can attach an image. This uploads the images to Object Storage instead and prints the markdown block that shows them:

```bash
mise run pr:screenshots 1209
mise run pr:screenshots 1209 --append
```

The first prints the block to paste; the second also appends it to the pull request body, replacing an earlier block rather than leaving a reviewer two sets of images.

The number only exists once the pull request is open, so `mise run pr:create` closes the loop from the other end: a branch that touched a component or stylesheet under `web/src/` gets the command printed back with its number filled in.

For every page in that run's `pages.tsv` it publishes three images: the page as it was, from the baseline that run kept in `web/.screenshots-baseline/`; the page as it is now; and the highlighted difference. A page that gained or lost a fold has an image on one side only and no difference to draw — one image becoming two — and the row says so rather than linking an object that was never uploaded; reading the folder of differences alone used to leave that page out of the report meant to show it. The block is a row per page, so a redesign is read as before, after and what moved. Without a baseline to compare against, it publishes the differences alone, and `--path web/screenshots/active` publishes a folder of the set as it is. Objects land under `pr/<number>/<short-sha>/`, so re-photographing a branch adds a set rather than replacing the one a reviewer is reading.

Anything outside `web/screenshots/` is refused, symlinks included; the baseline is the one exception, and only because the task reaches for it itself — it holds the same seeded photographs, one run older. Each object is uploaded world-readable so GitHub's image proxy can fetch it, and that directory is photographed from the seeded database by construction — the guard is what keeps real data out of a public bucket.

The bucket is not the one the web app is deployed to: `deploy.yml` syncs that one with `--delete`, so a `pr/` prefix in it would disappear on the next merge to `main`. Create it once, and give it a lifecycle rule so old images clean themselves up:

```bash
scw object bucket create getstronger.screenshots region=fr-par

aws s3api put-bucket-lifecycle-configuration \
  --endpoint-url https://s3.fr-par.scw.cloud \
  --bucket getstronger.screenshots \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-pull-request-screenshots",
        "Filter": { "Prefix": "pr/" },
        "Status": "Enabled",
        "Expiration": { "Days": 30 }
      }
    ]
  }'

gh variable set SCW_SCREENSHOTS_BUCKET_NAME --body getstronger.screenshots
```

The bucket itself stays private: only the objects the task uploads are readable, and only for thirty days.

`SCW_SCREENSHOTS_BUCKET_NAME` is a repository variable rather than a value written into the task, so nothing publishes to a bucket it was not pointed at. Locally it comes from `.env`, which `.env.example` fills in: the bucket is not a secret and is the same for everyone. The two credentials beside it are — `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, the `getstronger-deploy` API key from step 7, which already carries the Object Storage permission sets the upload needs. Without them the task fails and uploads nothing, so `mise run worktree:env` carries just those two from the main checkout's `.env` into a new worktree's, by name. Nothing else crosses: a cloud `DB_HOST` added to the main file would point a worktree's backend at production.
