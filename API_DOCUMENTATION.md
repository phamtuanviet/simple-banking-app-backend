# Simple Banking API Documentation

Tài liệu này mô tả các endpoint chính cho hệ thống Simple Banking Backend.

- **Base URL**: `http://localhost:3000`
- **Authentication**: Hầu hết các endpoint yêu cầu `Bearer Token` trong header `Authorization`. Token này được lấy từ endpoint `POST /auth/login`.
- **Quyền**: Các endpoint sẽ được đánh dấu với quyền truy cập cần thiết: `PUBLIC`, `USER`, `ADMIN`.

---

## 1. Module Xác thực (`/auth`)

Quản lý việc đăng ký, đăng nhập, và các luồng xác thực người dùng.

### `POST /auth/register`

- **Mô tả**: Đăng ký một tài khoản người dùng mới.
- **Quyền**: `PUBLIC`
- **Body**:
  ```json
  {
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "password": "Password123!"
  }
  ```
- **Phản hồi thành công (201)**:
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.",
    "data": { "userId": "..." }
  }
  ```

### `POST /auth/login`

- **Mô tả**: Đăng nhập và nhận về access token và refresh token.
- **Body**:
  ```json
  {
    "email": "john.doe@example.com",
    "password": "Password123!"
  }
  ```
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Đăng nhập thành công",
    "data": {
      "user": {
        "id": "...",
        "email": "...",
        "fullName": "...",
        "role": "USER"
      },
      "accessToken": "ey...",
      "refreshToken": "..."
    }
  }
  ```

### `POST /auth/refresh`

- **Mô tả**: Sử dụng refresh token (gửi trong body) để lấy access token mới.
- **Body**:
  ```json
  {
    "refreshToken": "..."
  }
  ```

### `POST /auth/logout`

- **Mô tả**: Đăng xuất và vô hiệu hóa refresh token hiện tại.
- **Body**:
  ```json
  {
    "refreshToken": "..."
  }
  ```

### Các endpoint khác

- `GET /auth/verify-email?token=<token>`: Xác thực email sau khi đăng ký.
- `POST /auth/resend-verification`: Gửi lại email xác thực.
- `POST /auth/forgot-password`: Yêu cầu link đặt lại mật khẩu.
- `POST /auth/reset-password`: Đặt lại mật khẩu bằng token.

---

## 2. Module User (`/users`)

Quản lý thông tin người dùng. Yêu cầu xác thực.

### `GET /users/me`

- **Mô tả**: Lấy thông tin chi tiết của người dùng đang đăng nhập.
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Thao tác thành công",
    "data": {
      "id": "...",
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "role": "USER",
      "status": "ACTIVE"
    }
  }
  ```

### `GET /users/search?q=<email_or_name>`

- **Mô tả**: Tìm kiếm người dùng khác để thực hiện chuyển khoản.

---

## 3. Module Account (`/accounts`)

Quản lý tài khoản ngân hàng của người dùng. Yêu cầu xác thực.

### `GET /accounts/my-account`

- **Mô tả**: Lấy thông tin tài khoản (số dư, số tài khoản) của người dùng đang đăng nhập.
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Thao tác thành công",
    "data": {
      "id": "...",
      "accountNumber": "1234567890",
      "balance": "5000000.00",
      "currency": "VND"
    }
  }
  ```

---

## 4. Module Transaction (`/transactions`)

Quản lý các giao dịch chuyển tiền. Yêu cầu xác thực.

### `POST /transactions/transfer`

- **Mô tả**: Thực hiện một giao dịch chuyển tiền đến người dùng khác.
- **Body**:
  ```json
  {
    "recipientAccountNumber": "0987654321",
    "amount": 50000,
    "message": "Chuyen tien an trua"
  }
  ```

### `GET /transactions/history`

- **Mô tả**: Lấy lịch sử giao dịch (nhận tiền và chuyển tiền) của người dùng. Hỗ trợ phân trang qua query params `?page=1&limit=10`.
