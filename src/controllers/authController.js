const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');
const Company = require('../models/Company');
const Subscription = require('../models/Subscription');
const emailService = require('../services/emailService');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Authentication Controller
 * Handles user registration, login, logout, and JWT token management
 */

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Register new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { email, password, name, specialty, phone, workplace, journalSystem, role, companyName, maxUsers, trialEndDate, stripe_price_id } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create new user
    const userData = {
      email,
      password,
      name,
      specialty: specialty || 'general',
      phone,
      workplace,
      journalSystem: journalSystem || 'none',
      role: role || 'user', // Default to user role
      email_verified: false,
      verification_token: verificationToken
    };

    const user = new User(userData);
    await user.save();

    // If user is registering as company admin, create company
    let company = null;
    if (role === 'company_admin') {
      if (!companyName) {
        return errorResponse(res, 'Company name is required for company admin registration', 400);
      }

      // Check if company name already exists
      const existingCompany = await Company.findOne({ name: companyName });
      if (existingCompany) {
        return errorResponse(res, 'Company with this name already exists', 400);
      }

      // Create company
      company = new Company({
        name: companyName,
        created_by: user._id,
        max_users: maxUsers,
        current_user_count: 1 // Include the creator
      });

      await company.save();

      // Link user to company
      user.company_id = company._id;
      await user.save();
    }

    // Create trial subscription for the user
    const trialEnd = trialEndDate ? new Date(trialEndDate) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days default
    
    const subscription = new Subscription({
      user_id: user._id,
      stripe_price_id: stripe_price_id,
      status: 'trialing',
      is_trial: true,
      current_period_start: new Date(),
      current_period_end: trialEnd
    });

    await subscription.save();

    // Link subscription to user
    user.subscription_id = subscription._id;
    await user.save();

    // Send welcome email with verification link
    try {
      await emailService.sendWelcomeEmail({
        name,
        email,
        verificationToken,
        userId: user._id
      });
    } catch (emailError) {
      // Log email error but don't fail registration
      console.error('Failed to send welcome email:', emailError.message);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Remove password and sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.verification_token;
    delete userResponse.reset_password_token;

    const response = {
      user: userResponse,
      tokens: {
        access: accessToken,
        refresh: refreshToken
      },
      message: 'Registration successful. Please check your email to verify your account.'
    };

    // Include company info if created
    if (company) {
      response.company = {
        id: company._id,
        name: company.name,
        max_users: company.max_users,
        current_user_count: company.current_user_count
      };
    }

    // Include subscription info
    response.subscription = {
      id: subscription._id,
      status: subscription.status,
      is_trial: subscription.is_trial,
      current_period_end: subscription.current_period_end,
      stripe_price_id: subscription.stripe_price_id
    };

    return successResponse(res, response, 'User registered successfully', 201);

  } catch (error) {
    console.error('Register error:', error);
    return errorResponse(res, error.message || 'Failed to register user', 500);
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Check if user has active subscription (activation is now based on subscription)
    // This will be handled by subscription middleware or checks

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Get user with company info if applicable
    const userWithCompany = await User.findById(user._id)
      .populate('company_id', 'name max_users current_user_count')
      .select('-password');

    return successResponse(res, {
      user: userWithCompany.toJSON(),
      tokens: {
        access: accessToken,
        refresh: refreshToken
      }
    }, 'Login successful');

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Failed to login', 500);
  }
};

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return errorResponse(res, 'Refresh token is required', 400);
    }

    try {
      // Verify refresh token
      const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
      
      // Get user
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        return errorResponse(res, 'User not found', 404);
      }

          // Check if user has active subscription (activation is now based on subscription)
    // This will be handled by subscription middleware or checks

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);

      return successResponse(res, {
        tokens: {
          access: accessToken,
          refresh: newRefreshToken
        }
      }, 'Token refreshed successfully');

    } catch (jwtError) {
      return errorResponse(res, 'Invalid refresh token', 401);
    }

  } catch (error) {
    console.error('Refresh token error:', error);
    return errorResponse(res, 'Failed to refresh token', 500);
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('company_id', 'name max_users current_user_count')
      .select('-password');

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, { user }, 'Profile retrieved successfully');

  } catch (error) {
    console.error('Get profile error:', error);
    return errorResponse(res, 'Failed to get profile', 500);
  }
};

/**
 * Update user profile
 * PUT /api/auth/profile
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { name, specialty, phone, workplace, journalSystem } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Update fields
    if (name) user.name = name;
    if (specialty) user.specialty = specialty;
    if (phone !== undefined) user.phone = phone;
    if (workplace !== undefined) user.workplace = workplace;
    if (journalSystem !== undefined) user.journalSystem = journalSystem;

    await user.save();

    const updatedUser = await User.findById(user._id)
      .populate('company_id', 'name max_users current_user_count')
      .select('-password');

    return successResponse(res, { user: updatedUser }, 'Profile updated successfully');

  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse(res, 'Failed to update profile', 500);
  }
};

/**
 * Change password
 * PUT /api/auth/password
 */
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return errorResponse(res, 'Current password and new password are required', 400);
    }

    if (new_password.length < 6) {
      return errorResponse(res, 'New password must be at least 6 characters long', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(current_password);
    if (!isCurrentPasswordValid) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }

    // Update password
    user.password = new_password;
    await user.save();

    return successResponse(res, null, 'Password changed successfully');

  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse(res, 'Failed to change password', 500);
  }
};

/**
 * Forgot password - Send password reset email
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 'Email is required', 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists for security
      return successResponse(res, null, 'If the email exists, a reset link will be sent');
    }

    // Check if user is active
    if (!user.is_active) {
      return successResponse(res, null, 'If the email exists, a reset link will be sent');
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + parseInt(process.env.PASSWORD_RESET_EXPIRATION_HOURS || '1') * 60 * 60 * 1000);
    
    // Save reset token to user
    user.reset_password_token = resetToken;
    user.reset_password_expires = resetTokenExpiry;
    await user.save();

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail({
        name: user.name,
        email: user.email,
        resetToken,
        userId: user._id
      });

      console.log(`Password reset email sent to ${email}`);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
      
      // Clear the reset token if email fails
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await user.save();
      
      return errorResponse(res, 'Failed to send reset email. Please try again later.', 500);
    }

    return successResponse(res, null, 'If the email exists, a reset link will be sent');

  } catch (error) {
    console.error('Forgot password error:', error);
    return errorResponse(res, 'Failed to process password reset request', 500);
  }
};

/**
 * Reset password
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return errorResponse(res, 'Token and new password are required', 400);
    }

    if (new_password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters long', 400);
    }

    // Find user with valid reset token
    const user = await User.findOne({
      reset_password_token: token,
      reset_password_expires: { $gt: new Date() }
    });

    if (!user) {
      return errorResponse(res, 'Invalid or expired reset token', 400);
    }

    // Update password and clear reset token
    user.password = new_password;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    return successResponse(res, null, 'Password reset successfully');

  } catch (error) {
    console.error('Reset password error:', error);
    return errorResponse(res, 'Failed to reset password', 500);
  }
};

/**
 * Verify email address
 * POST /api/auth/verify-email
 */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return errorResponse(res, 'Verification token is required', 400);
    }

    // Find user with valid verification token
    const user = await User.findOne({
      verification_token: token,
      email_verified: false
    });

    if (!user) {
      return errorResponse(res, 'Invalid or expired verification token', 400);
    }

    // Verify the email
    user.email_verified = true;
    user.verification_token = null;
    await user.save();

    return successResponse(res, null, 'Email verified successfully');

  } catch (error) {
    console.error('Email verification error:', error);
    return errorResponse(res, 'Failed to verify email', 500);
  }
};

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 'Email is required', 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (user.email_verified) {
      return errorResponse(res, 'Email is already verified', 400);
    }

    if (!user.is_active) {
      return errorResponse(res, 'Account is deactivated', 400);
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verification_token = verificationToken;
    await user.save();

    // Send verification email
    try {
      await emailService.sendVerificationReminder({
        name: user.name,
        email: user.email,
        verificationToken,
        userId: user._id
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      return errorResponse(res, 'Failed to send verification email. Please try again later.', 500);
    }

    return successResponse(res, null, 'Verification email sent successfully');

  } catch (error) {
    console.error('Resend verification error:', error);
    return errorResponse(res, 'Failed to resend verification email', 500);
  }
};

/**
 * Logout user (client-side token removal)
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    // For JWT, logout is typically handled client-side by removing the token
    // Could implement token blacklisting here if needed
    
    return successResponse(res, null, 'Logged out successfully');

  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse(res, 'Failed to logout', 500);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  logout
}; 