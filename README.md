# GetStronger

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
[**Visit GetStronger**](https://www.getstronger.pro)

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
- **Infrastructure**: AWS (S3, EC2, Route 53), Terraform
- **CI/CD**: GitHub Actions

---

## Getting Started

### Prerequisites

- [**mise**](https://mise.jdx.dev/getting-started.html)
- **Docker**

mise installs the project's pinned Go, Node.js, Terraform, and development tool versions from `mise.toml`.

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

## End-to-end tests

The browser suite covers authentication, primary navigation, exercise management, quick workouts, and public profiles. It uses the local seeded John and Jane Doe accounts and resets the database before every suite run.

Install the Playwright browser once:

```bash
mise run install:e2e
```

With the local PostgreSQL container running and migrations applied, run the suite:

```bash
mise run test:e2e
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

Playwright starts isolated HTTP instances of the backend and web app on ports `18080` and `15173`, so it does not depend on or conflict with the normal local TLS services. Failed tests retain their screenshot and trace under `web/test-results/`; the HTML report is written to `web/playwright-report/`.
