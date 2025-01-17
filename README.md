# GetStronger

![Code Coverage](https://codecov.io/gh/crlssn/getstronger/graph/badge.svg?token=Y0VUDQ3FZW) ![Codacy Badge](https://app.codacy.com/project/badge/Grade/75e3f5a2db734f71871daaf8aadb3e5e)

**GetStronger** is an open-source gym workout application designed to help users track strength training routines, monitor progress, and connect with others in the fitness community.

---

## Key Features

- **Workout Tracking**: Log exercises, sets, and reps with ease.
- **Personal Bests**: Automatically track and display personal records for each exercise.
- **Social Features**: Follow friends, share progress, and stay motivated.
- **Progress Analytics**: Visualize strength gains over time.
- **Mobile-First Design**: Optimized for mobile devices to ensure seamless usability in the gym.

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

- **Web**: Typescript using Vue.js
- **Backend**: Golang
- **Database**: Postgres
- **APIs**: Connect RPC, Protocol Buffers
- **Infrastructure**: AWS (S3, EC2, Route 53), Terraform
- **CI/CD**: GitHub Actions

---

## Getting Started

### Prerequisites

- **Go**: v1.23
- **Node.js**: v22
- **Docker**

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/crlssn/getstronger.git
   cd getstronger
   ```

2. Install dependencies:
   ```bash
   make install
   ```

3. Setup environment variables:
   Copies `.env.example` to `.env` for the web and backend: files you may need to update to suite your environment.
   ```bash
   make env
   ```

4. Initialise the database:
   ```bash
   make db_init
   ```

5. Run migrations:
   ```bash
   make db_migrate
   ```

6. (Optional) Seed the database:
   ```bash
   make db_seed
   ```

7. (Optional) Generate self-signed certificates for the backend:
   ```bash
   make gen_certs
   ```
   ⚠ You must trust the self-signed certificate in your browser after you've started the backend.

8. Start the backend app:
   ```bash
   make app_backend
   ```

9. Start the web app:
   ```bash
   make app_web
   ```

10. Access the web app at [http://localhost:5173](http://localhost:5173). If you seeded the database you can login with email `john@doe.com` and password `123`.
