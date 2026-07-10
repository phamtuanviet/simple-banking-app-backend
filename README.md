# Simple Banking App - Backend

Backend cho ứng dụng ngân hàng đơn giản, được xây dựng bằng NestJS, TypeORM, và PostgreSQL.

## Mục lục

- [Tính năng](#tính-năng)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Yêu cầu cài đặt](#yêu-cầu-cài-đặt)
- [Hướng dẫn cài đặt](#hướng-dẫn-cài-đặt)
  - [1. Cài đặt thủ công (Local)](#1-cài-đặt-thủ-công-local)
  - [2. Cài đặt bằng Docker](#2-cài-đặt-bằng-docker)
- [Cấu hình môi trường (.env)](#cấu-hình-môi-trường-env)
- [Tài liệu API](#tài-liệu-api)
- [Chạy ứng dụng](#chạy-ứng-dụng)

## Tính năng

- Xác thực người dùng (Đăng ký, Đăng nhập, JWT, Refresh Token).
- Quản lý tài khoản ngân hàng.
- Chuyển tiền giữa các tài khoản.
- Xem lịch sử giao dịch.
- Thông báo real-time qua WebSockets.
- Phân quyền người dùng (User, Admin).

## Công nghệ sử dụng

- **Framework**: [NestJS](https://nestjs.com/)
- **Ngôn ngữ**: TypeScript
- **ORM**: [TypeORM](https://typeorm.io/)
- **Cơ sở dữ liệu**: PostgreSQL
- **Xác thực**: JWT (JSON Web Tokens), Passport.js
- **Real-time**: Socket.IO
- **Validation**: class-validator, class-transformer
- **Email**: Nodemailer
- **Containerization**: Docker

## Yêu cầu cài đặt

- [Node.js](https://nodejs.org/en/) (v18.x trở lên)
- [Yarn](https://yarnpkg.com/) hoặc [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/) (v14 trở lên)
- [Docker](https://www.docker.com/) và [Docker Compose](https://docs.docker.com/compose/) (nếu chạy bằng Docker)

---

## Hướng dẫn cài đặt

### 1. Cài đặt thủ công (Local)

**Bước 1: Clone repository**

```bash
git clone <your-repository-url>
cd simple-banking-app-backend
```

**Bước 2: Cài đặt dependencies**

```bash
npm install
```

**Bước 3: Cấu hình cơ sở dữ liệu**

Đảm bảo bạn đã cài đặt và khởi chạy PostgreSQL. Tạo một database mới, ví dụ `simple_banking`.

**Bước 4: Cấu hình biến môi trường**

Tạo một file `.env` ở thư mục gốc của project. Xem chi tiết các biến cần thiết ở mục Cấu hình môi trường (.env).

**Bước 5: Khởi chạy ứng dụng**

```bash
npm run start:dev
```

Ứng dụng sẽ chạy tại `http://localhost:3000` (hoặc cổng bạn đã cấu hình trong `.env`).

### 2. Cài đặt bằng Docker

Phương pháp này sẽ tự động dựng và chạy cả backend và database PostgreSQL trong các container riêng biệt.

**Bước 1: Clone repository** (Nếu chưa có)

**Bước 2: Cấu hình biến môi trường**

Tạo file `.env` ở thư mục gốc. Các biến môi trường cho database phải trỏ đến tên service của database trong file `docker-compose.yml` (ví dụ `DB_HOST=db`).

**Bước 3: Khởi chạy với Docker Compose**

```bash
docker-compose up --build
```

Lệnh này sẽ build Docker image cho ứng dụng NestJS, kéo image PostgreSQL, và khởi chạy các container. Ứng dụng sẽ có thể truy cập tại `http://localhost:3000`.

Để dừng các container:

```bash
docker-compose down
```

---

## Tài liệu API

Một tài liệu API cơ bản dạng Markdown đã được tạo để cung cấp cái nhìn tổng quan về các endpoint chính.

Xem chi tiết tại: [**API_DOCUMENTATION.md**](./API_DOCUMENTATION.md)

---

## Cấu hình môi trường (.env)

Tạo file `.env` ở thư mục gốc và điền các giá trị cần thiết.

```env
# Application
PORT=3000
FONTEND_URL=http://localhost:3001

# Database (PostgreSQL) - Use 'db' for DB_HOST when running with Docker
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_DATABASE_NAME=simple_banking

# JWT Secrets
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_super_secret_refresh_key

# Mailer (e.g., Mailtrap or Gmail)
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_mailtrap_user
MAIL_PASS=your_mailtrap_password
MAIL_FROM="Simple Banking" <noreply@simplebanking.com>
```

---

## Chạy ứng dụng

```bash
# Development mode (với hot-reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

---

## Seeding dữ liệu (Tùy chọn)

Project đã có sẵn một kịch bản để tạo dữ liệu mẫu, bao gồm 2 user ("Alice", "Bob") và 1 admin ("Admin") để bạn có thể thử nghiệm ngay các tính năng như đăng nhập, xem số dư, và chuyển khoản.

**Lưu ý:** Script này sẽ không tạo lại user nếu email đã tồn tại trong database.

### Yêu cầu

Cần cài đặt `ts-node` nếu bạn chưa có:

```bash
npm install -g ts-node
```

### Chạy script

1.  Thêm dòng sau vào phần `"scripts"` trong file `package.json` của bạn:

    ```json
    "seed": "ts-node -r tsconfig-paths/register src/database/seeds/run-seed.ts"
    ```

2.  Chạy lệnh sau từ terminal:
    ```bash
    npm run seed
    ```

**Thông tin đăng nhập mẫu:**

- **User 1:** Email: `alice@example.com`, Mật khẩu: `Password123!`
- **User 2:** Email: `bob@example.com`, Mật khẩu: `Password123!`
- **Admin:** Email: `admin@example.com`, Mật khẩu: `AdminPassword123!`

```

```
