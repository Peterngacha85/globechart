# GLOBECHART - Authentication & JWT Implementation

## Overview
Complete JWT (JSON Web Token) authentication system with refresh tokens, role-based access control, and secure password handling.

---

## 1. JWT SETUP

### Backend JWT Configuration

```javascript
// backend/config/jwt.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_change_in_production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';
const REFRESH_TOKEN_EXPIRE = process.env.REFRESH_TOKEN_EXPIRE || '30d';

// Generate Access Token
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
};

// Generate Refresh Token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET + 'refresh',
    { expiresIn: REFRESH_TOKEN_EXPIRE }
  );
};

// Verify Token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Verify Refresh Token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET + 'refresh');
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  JWT_SECRET,
  JWT_EXPIRE
};
```

---

## 2. AUTHENTICATION MIDDLEWARE

### Backend Auth Middleware

```javascript
// backend/middleware/auth.middleware.js
const { verifyToken } = require('../config/jwt');

// Protect routes - require authentication
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided. Authorization required.'
    });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
  
  req.user = decoded;
  next();
};

// Admin only - require super_admin role
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Optional auth - check token if present, continue if not
const optional = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
};

module.exports = { protect, adminOnly, optional };
```

---

## 3. AUTH CONTROLLER

### Backend Authentication Controller

```javascript
// backend/controllers/authController.js
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../config/jwt');
const bcrypt = require('bcryptjs');

// Register
exports.register = async (req, res) => {
  try {
    const { username, email, phone, country, password, referralCode } = req.body;
    
    // Validation
    if (!username || !email || !phone || !password) {
      return res.status(422).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }, { phone }]
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username, email, or phone already exists'
      });
    }
    
    // Find referrer
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode });
    }
    
    // Create user
    const user = new User({
      username,
      email,
      phone,
      password,
      country,
      referredBy: referrer ? referrer._id : null,
      referralCode: Math.random().toString(36).substring(2, 8).toUpperCase()
    });
    
    await user.save();
    
    // Update referrer's referral count
    if (referrer) {
      await User.findByIdAndUpdate(referrer._id, {
        $push: { directReferrals: user._id },
        $inc: { 'networkTree.level1Count': 1 }
      });
    }
    
    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        referralCode: user.referralCode,
        token: accessToken,
        refreshToken
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    
    if (!username || !password) {
      return res.status(422).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    // Find user
    const user = await User.findOne({ username }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    // Check status
    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: `Your account is ${user.status}`
      });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    // Update login info
    user.lastLogin = new Date();
    user.loginCount += 1;
    await user.save();
    
    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        token: accessToken,
        refreshToken,
        expiresIn: '7d'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }
    
    const { verifyRefreshToken } = require('../config/jwt');
    const decoded = verifyRefreshToken(refreshToken);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    const user = await User.findById(decoded.userId);
    
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }
    
    const newAccessToken = generateAccessToken(user._id, user.role);
    
    res.json({
      success: true,
      data: {
        token: newAccessToken,
        expiresIn: '7d'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      error: error.message
    });
  }
};

// Logout
exports.logout = async (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
};
```

---

## 4. FRONTEND AUTH SERVICE

### React Auth Service

```javascript
// frontend/src/services/authService.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken
        });
        
        localStorage.setItem('accessToken', response.data.data.token);
        originalRequest.headers.Authorization = `Bearer ${response.data.data.token}`;
        
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

const authService = {
  // Register
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    if (response.data.data.token) {
      localStorage.setItem('accessToken', response.data.data.token);
      localStorage.setItem('refreshToken', response.data.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.data.data));
    }
    return response.data;
  },

  // Login
  login: async (username, password, rememberMe = false) => {
    const response = await api.post('/auth/login', {
      username,
      password,
      rememberMe
    });
    if (response.data.data.token) {
      localStorage.setItem('accessToken', response.data.data.token);
      localStorage.setItem('refreshToken', response.data.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.data.data));
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
    }
    return response.data;
  },

  // Logout
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');
  },

  // Get current user
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // Check if authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem('accessToken');
  },

  // Refresh token
  refreshToken: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await api.post('/auth/refresh-token', { refreshToken });
    if (response.data.data.token) {
      localStorage.setItem('accessToken', response.data.data.token);
    }
    return response.data;
  }
};

export default authService;
```

---

## 5. REACT AUTH CONTEXT

### Frontend Auth Context

```javascript
// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth on mount
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username, password, rememberMe = false) => {
    try {
      setError(null);
      const response = await authService.login(username, password, rememberMe);
      setUser(response.data);
      return response;
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
      throw err;
    }
  }, []);

  const register = useCallback(async (userData) => {
    try {
      setError(null);
      const response = await authService.register(userData);
      setUser(response.data);
      return response;
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const value = {
    user,
    isLoading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## 6. REACT AUTH HOOK

### Frontend useAuth Hook

```javascript
// frontend/src/hooks/useAuth.js
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

---

## 7. PROTECTED ROUTES

### React Protected Route Component

```javascript
// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};
```

---

## 8. LOGIN FORM COMPONENT

### React Login Component

```javascript
// frontend/src/components/Auth/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password, rememberMe);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-gradient-to-br from-purple-500 to-pink-500 rounded-full p-3 mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 110 16 8 8 0 010-16z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">GLOBECHART</h1>
          <p className="text-gray-600 text-sm">Member Portal</p>
        </div>

        {/* Sign In Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-purple-600 mb-2">SIGN IN</h2>
          <p className="text-gray-600 text-sm">Use your username and password to sign in</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          {/* Username */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              USERNAME
            </label>
            <div className="relative">
              <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
              </svg>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                PASSWORD
              </label>
              <a href="/forgot-password" className="text-purple-600 text-sm hover:underline">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="mb-6 flex items-center">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-600">
              Keep me signed in
            </label>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : '→ Sign In'}
          </button>
        </form>

        {/* Social Login */}
        <div className="mt-6">
          <p className="text-center text-gray-600 text-sm mb-4">OR</p>
          <div className="flex gap-3">
            <button className="flex-1 border border-gray-300 rounded-lg py-2 hover:bg-gray-50 transition">
              f
            </button>
            <button className="flex-1 border border-gray-300 rounded-lg py-2 hover:bg-gray-50 transition">
              𝕏
            </button>
            <button className="flex-1 border border-gray-300 rounded-lg py-2 hover:bg-gray-50 transition">
              📷
            </button>
          </div>
        </div>

        {/* Sign Up Link */}
        <p className="text-center mt-6 text-gray-600 text-sm">
          Don't have an account?{' '}
          <a href="/register" className="text-purple-600 font-semibold hover:underline">
            Sign Up Free
          </a>
        </p>

        {/* Copyright */}
        <p className="text-center mt-8 text-xs text-gray-500">
          © 2026 GLOBECHART. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
```

---

## 9. REGISTER FORM COMPONENT

### React Register Component

```javascript
// frontend/src/components/Auth/Register.jsx
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Register = () => {
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref');
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    country: 'Kenya',
    password: '',
    referralCode: referralCode || '',
    agreeTerms: false
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!formData.agreeTerms) {
      setError('You must agree to the Terms of Service and No-Refund Policy');
      setLoading(false);
      return;
    }

    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-gradient-to-br from-purple-500 to-pink-500 rounded-full p-3 mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 110 16 8 8 0 010-16z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">GLOBECHART</h1>
          <p className="text-gray-600 text-sm">Create account — start earning today</p>
        </div>

        {/* Registration Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-purple-600 mb-2">NEW MEMBER REGISTRATION</h2>
          {referralCode && (
            <p className="text-purple-600 font-semibold">
              👥 Invited by <span className="text-lg">{referralCode}</span>
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleRegister}>
          {/* Username */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              USERNAME
              <span className="text-xs text-gray-500"> (this is how you sign in)</span>
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="letters, numbers, underscore"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              pattern="^[a-zA-Z0-9_]+$"
            />
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              EMAIL
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your@email.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          {/* Phone */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PHONE
              <span className="text-xs text-gray-500"> (for payouts)</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="07XXXXXXXXX"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              pattern="^0[1-9]\d{8}$"
            />
          </div>

          {/* Country */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              COUNTRY
            </label>
            <select
              name="country"
              value={formData.country}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option>Kenya</option>
              <option>Tanzania</option>
              <option>Uganda</option>
              <option>Nigeria</option>
              <option>Other</option>
            </select>
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PASSWORD
              <span className="text-xs text-gray-500"> (Min. 6 characters)</span>
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              minLength={6}
            />
          </div>

          {/* Terms */}
          <div className="mb-6 flex items-start">
            <input
              type="checkbox"
              name="agreeTerms"
              id="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleChange}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded mt-1"
              required
            />
            <label htmlFor="agreeTerms" className="ml-2 text-sm text-gray-600">
              I agree to the{' '}
              <a href="/terms" className="text-purple-600 hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/no-refund" className="text-purple-600 hover:underline">
                No-Refund Policy
              </a>
            </label>
          </div>

          {/* Create Account Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Creating account...' : '👤 Create Account'}
          </button>
        </form>

        {/* Sign In Link */}
        <p className="text-center mt-6 text-gray-600 text-sm">
          Already have an account?{' '}
          <a href="/login" className="text-purple-600 font-semibold hover:underline">
            Sign In
          </a>
        </p>

        {/* Copyright */}
        <p className="text-center mt-8 text-xs text-gray-500">
          © 2026 GLOBECHART. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Register;
```

---

## 10. SECURING PASSWORDS

### Best Practices

```javascript
// Password Requirements
const passwordRequirements = {
  minLength: 6,
  requireUppercase: false,  // Optional
  requireNumbers: false,    // Optional
  requireSpecialChars: false // Optional
};

// Hash passwords with bcryptjs (backend)
const bcrypt = require('bcryptjs');

// Before saving user
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Verify password
const verifyPassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};
```

---

## 11. TOKEN STORAGE

### Frontend Token Management

```javascript
// Secure token storage (localStorage with caution)
const tokenStorage = {
  setAccessToken: (token) => localStorage.setItem('accessToken', token),
  getAccessToken: () => localStorage.getItem('accessToken'),
  removeAccessToken: () => localStorage.removeItem('accessToken'),
  
  setRefreshToken: (token) => localStorage.setItem('refreshToken', token),
  getRefreshToken: () => localStorage.getItem('refreshToken'),
  removeRefreshToken: () => localStorage.removeItem('refreshToken')
};

// Note: For maximum security, use httpOnly cookies:
// Backend sets: res.cookie('token', token, { httpOnly: true })
// Frontend: axios automatically includes cookies with credentials: true
```

---

## 12. LOGGING IN USERS AUTOMATICALLY

### Auto-login if "Remember Me" checked

```javascript
// frontend/src/hooks/useAuthInit.js
import { useEffect } from 'react';
import { useAuth } from './useAuth';
import authService from '../services/authService';

export const useAuthInit = () => {
  const { setUser } = useAuth();

  useEffect(() => {
    const rememberMe = localStorage.getItem('rememberMe');
    const user = authService.getCurrentUser();
    
    if (rememberMe && user) {
      setUser(user);
    }
  }, []);
};
```

---

**Next**: See WEBSOCKET-SETUP.md for real-time features

**Created by**: Peter Ngacha / Fastweb Technologies  
**Last Updated**: September 2026
