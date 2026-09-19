# GLOBECHART - API Endpoints Documentation

## Overview
Complete REST API endpoints for Globechart. All endpoints follow RESTful conventions with proper status codes and error handling.

### Base URL
```
Development: http://localhost:5000/api
Production: https://api.globechart.com/api
```

### Authentication
All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Response Format
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "statusCode": 200
}
```

---

## 1. AUTHENTICATION ENDPOINTS

### 1.1 Register User
**POST** `/auth/register`

```javascript
// Request
{
  "username": "johndoe",
  "email": "john@example.com",
  "phone": "0797893629",
  "country": "Kenya",
  "password": "secure123456",
  "referralCode": "7NLA5627"  // Optional - referrer's code
}

// Response (201 Created)
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 1.2 Login
**POST** `/auth/login`

```javascript
// Request
{
  "username": "johndoe",
  "password": "secure123456",
  "rememberMe": true  // Optional
}

// Response (200 OK)
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": "7d"
  }
}
```

### 1.3 Refresh Token
**POST** `/auth/refresh-token`

```javascript
// Request
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}

// Response (200 OK)
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": "7d"
  }
}
```

### 1.4 Logout
**POST** `/auth/logout`

```javascript
// Request (Protected)
// Headers: Authorization: Bearer <token>

// Response (200 OK)
{
  "success": true,
  "message": "Logout successful"
}
```

### 1.5 Forgot Password
**POST** `/auth/forgot-password`

```javascript
// Request
{
  "email": "john@example.com"
}

// Response (200 OK)
{
  "success": true,
  "message": "Password reset link sent to email"
}
```

### 1.6 Reset Password
**POST** `/auth/reset-password/:token`

```javascript
// Request
{
  "newPassword": "newsecure123456"
}

// Response (200 OK)
{
  "success": true,
  "message": "Password reset successful"
}
```

---

## 2. USER ENDPOINTS

### 2.1 Get User Profile
**GET** `/users/profile`

```javascript
// Request (Protected)
// Headers: Authorization: Bearer <token>

// Response (200 OK)
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "phone": "0797893629",
    "country": "Kenya",
    "status": "active",
    "referralCode": "7NLA5627",
    "mainWallet": {
      "balance": 5500,
      "currency": "KES"
    },
    "earnings": {
      "affiliate": 1500,
      "digitalProducts": 2000,
      "hotelCommission": 500,
      "totalEarnings": 4000
    },
    "directReferrals": 5,
    "totalTeamSize": 12,
    "createdAt": "2026-07-25T10:30:00Z"
  }
}
```

### 2.2 Update Profile
**PUT** `/users/profile`

```javascript
// Request (Protected)
{
  "email": "newemail@example.com",
  "phone": "0797893629",
  "country": "Kenya"
}

// Response (200 OK)
{
  "success": true,
  "message": "Profile updated successfully"
}
```

### 2.3 Change Password
**POST** `/users/change-password`

```javascript
// Request (Protected)
{
  "currentPassword": "oldpass123456",
  "newPassword": "newpass123456"
}

// Response (200 OK)
{
  "success": true,
  "message": "Password changed successfully"
}
```

### 2.4 Get Referral Stats
**GET** `/users/referral-stats`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "referralCode": "7NLA5627",
    "referralLink": "https://globechart.com/register?ref=7NLA5627",
    "directReferrals": 5,
    "level1Count": 5,
    "level2Count": 3,
    "level3Count": 1,
    "totalTeamSize": 9,
    "referralEarnings": 1500,
    "commission": {
      "level1": { count: 5, amount: 1000 },
      "level2": { count: 3, amount: 300 },
      "level3": { count: 1, amount: 200 }
    }
  }
}
```

### 2.5 Activate Direct Downline (Pay for Client)
**POST** `/users/activate-downline`

```javascript
// Request (Protected)
{
  "phone": "0797893629",
  "amount": 200
}

// Response (200 OK)
{
  "success": true,
  "message": "Payment initiated for downline activation",
  "data": {
    "transactionId": "txn_507f1f77bcf86cd799439011",
    "status": "pending",
    "mpesaPromptId": "..."
  }
}
```

---

## 3. DASHBOARD ENDPOINTS

### 3.1 Get Dashboard Summary
**GET** `/dashboard/summary`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "availableBalance": 5500,
    "todaysEarnings": 250,
    "totalWithdrawn": 2000,
    "lifetimeConfirmed": 8000,
    "activeDownlines": 1,
    "withdrawnToday": 0,
    "transactions": 15,
    "accountStatus": "active"
  }
}
```

### 3.2 Get Earnings Breakdown
**GET** `/dashboard/earnings`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "affiliate": { amount: 1500, count: 25 },
    "digitalProducts": { amount: 2000, count: 8 },
    "hotelCommission": { amount: 500, count: 3 },
    "aiTraining": { amount: 1000, count: 15 },
    "chatCommission": { amount: 200, count: 5 },
    "y99Commission": { amount: 800, count: 10 },
    "bonusRewards": { amount: 500, count: 2 },
    "totalEarnings": 6500
  }
}
```

---

## 4. FINANCE ENDPOINTS

### 4.1 Request Withdrawal
**POST** `/finance/withdraw`

```javascript
// Request (Protected)
{
  "amount": 1000,
  "method": "mpesa",
  "mpesaPhone": "0797893629"
}

// Response (201 Created)
{
  "success": true,
  "message": "Withdrawal request submitted",
  "data": {
    "withdrawalId": "wd_507f1f77bcf86cd799439011",
    "amount": 1000,
    "status": "pending",
    "requestedAt": "2026-09-19T10:30:00Z"
  }
}
```

### 4.2 Initiate Recharge (M-Pesa)
**POST** `/finance/recharge`

```javascript
// Request (Protected)
{
  "amount": 500,
  "mpesaPhone": "0797893629"
}

// Response (200 OK)
{
  "success": true,
  "message": "M-Pesa prompt sent",
  "data": {
    "transactionId": "txn_507f1f77bcf86cd799439011",
    "amount": 500,
    "status": "pending",
    "mpesaPromptId": "..."
  }
}
```

### 4.3 Get Withdrawal History
**GET** `/finance/withdrawal-history?status=completed&limit=10&page=1`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "withdrawals": [
      {
        "withdrawalId": "wd_507f1f77bcf86cd799439011",
        "amount": 1000,
        "status": "completed",
        "method": "mpesa",
        "requestedAt": "2026-09-15T10:30:00Z",
        "completedAt": "2026-09-16T14:45:00Z"
      }
    ],
    "totalWithdrawn": 25000
  }
}
```

### 4.4 Get Bonuses
**GET** `/finance/bonuses`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "currentWeek": {
      "week": "2026-W38",
      "balance": 0,
      "weekSales": 5,
      "tiersClaimed": 2,
      "status": "Under 3,000 refs"
    },
    "bonuses": [
      {
        "bonusId": "bn_507f1f77bcf86cd799439011",
        "type": "weekly",
        "amount": 3000,
        "week": "2026-W37",
        "status": "claimed",
        "claimedAt": "2026-09-15T10:30:00Z"
      }
    ]
  }
}
```

---

## 5. PRODUCTS/STORE ENDPOINTS

### 5.1 Get Products
**GET** `/products?category=ebook&page=1&limit=12&sort=-createdAt`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "total": 50,
    "page": 1,
    "products": [
      {
        "productId": "prod_507f1f77bcf86cd799439011",
        "name": "How to make money online",
        "category": "ebook",
        "price": 200,
        "discount": 29,
        "image": "https://...",
        "sold": 17,
        "seller": "admin"
      }
    ]
  }
}
```

### 5.2 Get Product Details
**GET** `/products/:productId`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "productId": "prod_507f1f77bcf86cd799439011",
    "name": "How to make money online",
    "description": "...",
    "category": "ebook",
    "price": 200,
    "originalPrice": 280,
    "discount": 29,
    "image": "https://...",
    "commission": {
      "affiliate": 15,
      "referralLevel1": 10,
      "referralLevel2": 5,
      "referralLevel3": 2
    },
    "sold": 17,
    "seller": { "username": "admin" }
  }
}
```

### 5.3 Purchase Product
**POST** `/products/:productId/purchase`

```javascript
// Request (Protected)
{
  "quantity": 1
}

// Response (201 Created)
{
  "success": true,
  "message": "Purchase successful",
  "data": {
    "purchaseId": "pur_507f1f77bcf86cd799439011",
    "product": "How to make money online",
    "amount": 200,
    "status": "completed",
    "accessToken": "acc_...",
    "downloadUrl": "https://..."
  }
}
```

### 5.4 Get My Library (Purchases)
**GET** `/products/my-library?limit=10&page=1`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "owned": 5,
    "totalSpent": 1500,
    "pending": 2,
    "purchases": [
      {
        "purchaseId": "pur_507f1f77bcf86cd799439011",
        "product": { "name": "How to make money online" },
        "purchasePrice": 200,
        "purchasedAt": "2026-09-15T10:30:00Z",
        "accessToken": "acc_...",
        "downloadUrl": "https://..."
      }
    ]
  }
}
```

---

## 6. NOTIFICATIONS ENDPOINTS

### 6.1 Get Notifications
**GET** `/notifications?limit=20&page=1&isRead=false`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "unreadCount": 5,
    "notifications": [
      {
        "notificationId": "notif_507f1f77bcf86cd799439011",
        "title": "Commission Credited",
        "message": "You earned Ksh 150 from referral sale",
        "type": "success",
        "category": "commission",
        "isRead": false,
        "createdAt": "2026-09-19T10:30:00Z",
        "actionUrl": "/dashboard/finance"
      }
    ]
  }
}
```

### 6.2 Mark Notification as Read
**PUT** `/notifications/:notificationId/read`

```javascript
// Response (200 OK)
{
  "success": true,
  "message": "Notification marked as read"
}
```

### 6.3 Mark All as Read
**PUT** `/notifications/mark-all-read`

```javascript
// Response (200 OK)
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

## 7. ADMIN ENDPOINTS

### 7.1 Get All Users
**GET** `/admin/users?status=active&page=1&limit=20&search=john`

```javascript
// Request (Protected, Admin Only)
// Headers: Authorization: Bearer <admin_token>

// Response (200 OK)
{
  "success": true,
  "data": {
    "total": 150,
    "page": 1,
    "users": [
      {
        "userId": "507f1f77bcf86cd799439011",
        "username": "johndoe",
        "email": "john@example.com",
        "phone": "0797893629",
        "status": "active",
        "joinedAt": "2026-07-25T10:30:00Z",
        "balance": 5500,
        "totalEarnings": 8000,
        "referrals": 5
      }
    ]
  }
}
```

### 7.2 Get User Details (Admin)
**GET** `/admin/users/:userId`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "phone": "0797893629",
    "status": "active",
    "mainWallet": { "balance": 5500 },
    "earnings": { ... },
    "referredBy": { "username": "referrer" },
    "directReferrals": 5,
    "transactions": [ ... ],
    "withdrawals": [ ... ],
    "commissions": [ ... ]
  }
}
```

### 7.3 Suspend User
**PUT** `/admin/users/:userId/suspend`

```javascript
// Request (Protected, Admin Only)
{
  "reason": "Suspicious activity"
}

// Response (200 OK)
{
  "success": true,
  "message": "User suspended successfully"
}
```

### 7.4 Approve Withdrawal
**PUT** `/admin/withdrawals/:withdrawalId/approve`

```javascript
// Request (Protected, Admin Only)
{
  "transactionReference": "MPL123456789"
}

// Response (200 OK)
{
  "success": true,
  "message": "Withdrawal approved",
  "data": {
    "withdrawalId": "wd_507f1f77bcf86cd799439011",
    "status": "approved",
    "approvedAt": "2026-09-19T10:30:00Z"
  }
}
```

### 7.5 Reject Withdrawal
**PUT** `/admin/withdrawals/:withdrawalId/reject`

```javascript
// Request (Protected, Admin Only)
{
  "reason": "Insufficient balance on account"
}

// Response (200 OK)
{
  "success": true,
  "message": "Withdrawal rejected"
}
```

### 7.6 Get Pending Withdrawals
**GET** `/admin/withdrawals?status=pending&limit=20&sort=-requestedAt`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "total": 15,
    "withdrawals": [
      {
        "withdrawalId": "wd_507f1f77bcf86cd799439011",
        "user": { "username": "johndoe" },
        "amount": 1000,
        "status": "pending",
        "requestedAt": "2026-09-19T10:30:00Z",
        "method": "mpesa",
        "mpesaPhone": "0797893629"
      }
    ]
  }
}
```

### 7.7 Get Financial Analytics
**GET** `/admin/analytics/finance?period=month`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "totalDeposits": 50000,
    "totalWithdrawals": 35000,
    "totalCommissions": 8500,
    "netEarnings": 6500,
    "activeUsers": 245,
    "newUsersThisMonth": 38,
    "avgOrderValue": 850,
    "topEarners": [
      { "username": "topuser", "earnings": 5000 }
    ]
  }
}
```

### 7.8 Create System Setting
**POST** `/admin/settings`

```javascript
// Request (Protected, Admin Only)
{
  "setting": "affiliate_commission",
  "value": 15,
  "category": "commission",
  "description": "Commission percentage for affiliate sales"
}

// Response (201 Created)
{
  "success": true,
  "message": "Setting created/updated successfully"
}
```

### 7.9 Get All Products (Admin)
**GET** `/admin/products?status=active&limit=20`

```javascript
// Response (200 OK)
{
  "success": true,
  "data": {
    "total": 42,
    "products": [
      {
        "productId": "prod_507f1f77bcf86cd799439011",
        "name": "How to make money online",
        "category": "ebook",
        "price": 200,
        "discount": 29,
        "sold": 17,
        "status": "active",
        "seller": { "username": "admin" }
      }
    ]
  }
}
```

### 7.10 Create Product (Admin)
**POST** `/admin/products`

```javascript
// Request (Protected, Admin Only)
{
  "name": "React Mastery",
  "description": "Complete guide to React development",
  "category": "course",
  "price": 500,
  "image": "https://...",
  "content": "https://...",
  "commission": {
    "affiliate": 20,
    "referralLevel1": 10,
    "referralLevel2": 5
  }
}

// Response (201 Created)
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "productId": "prod_507f1f77bcf86cd799439011"
  }
}
```

---

## 8. ERROR RESPONSES

### Standard Error Response
```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400,
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

### Common Status Codes
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict (e.g., duplicate username)
- `422` - Unprocessable Entity (validation error)
- `500` - Internal Server Error

---

## 9. RATE LIMITING

All endpoints are rate-limited:
- **Public endpoints**: 100 requests/minute
- **Protected endpoints**: 300 requests/minute
- **Admin endpoints**: 500 requests/minute

Response headers include:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
X-RateLimit-Reset: 1632000600
```

---

## 10. PAGINATION

Query parameters for paginated endpoints:
```
?page=1&limit=20&sort=-createdAt&search=keyword
```

Response structure:
```json
{
  "success": true,
  "data": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8,
    "items": [ ... ]
  }
}
```

---

**Next**: See FRONTEND-STRUCTURE.md for React component architecture

**Created by**: Peter Ngacha / Fastweb Technologies  
**Last Updated**: September 2026
