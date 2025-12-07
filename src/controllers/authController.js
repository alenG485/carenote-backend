const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const emailService = require('../services/emailService');
const { successResponse, errorResponse } = require('../utils/responses');
const { calculatePrice, getTierLabel, getMaxLicensesForTier } = require('../config/pricing');

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

    const { email, password, name, specialty, phone, workplace, journalSystem, role, numLicenses, trialEndDate, billing_interval } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'Bruger med denne e-mail findes allerede', 400);
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // All registered users are company admins (main users) and can invite others
    // This includes both individual (1+ tier) and clinic (3+, 5+, 10+ tier) users
    const licenseCount = numLicenses || 1;
    
    // Create new user
    const userData = {
      email,
      password,
      name,
      specialty: specialty || 'general',
      phone,
      workplace, // Company name / workplace for all users
      journalSystem: journalSystem || 'none',
      role: role || 'user', // Always 'user' or 'super_admin', no 'company_admin' role
      is_company_admin: true, // All main users are company admins (can invite users)
      invited_by: null, // Main user, not invited
      email_verified: false,
      verification_token: verificationToken
    };

    const user = new User(userData);
    await user.save();

    // Create trial subscription for the user (only main users have subscriptions)
    const trialEnd = trialEndDate ? new Date(trialEndDate) : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days default
    
    // Calculate pricing based on number of licenses
    const billingInterval = billing_interval || 'monthly';
    const pricing = calculatePrice(licenseCount, billingInterval);
    
    if (!pricing) {
      return errorResponse(res, 'Ugyldigt antal licenser eller faktureringsinterval', 400);
    }
    
    const tierLabel = getTierLabel(pricing.tier.minLicenses);
    const maxLicensesForTier = getMaxLicensesForTier(pricing.tier.minLicenses, licenseCount);
    
    const subscription = new Subscription({
      user_id: user._id,
      numLicenses: maxLicensesForTier, // Store tier max capacity, not actual user count
      pricePerLicense: pricing.pricePerLicense,
      pricing_tier: tierLabel,
      status: 'active',
      is_trial: true,
      current_period_start: new Date(),
      current_period_end: trialEnd,
      billing_amount: pricing.totalPrice,
      billing_currency: 'DKK',
      billing_interval: billingInterval
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
      message: 'Registrering gennemført. Tjek venligst din e-mail for at verificere din konto.'
    };

    // Include subscription info
    response.subscription = {
      id: subscription._id,
      status: subscription.status,
      is_trial: subscription.is_trial,
      current_period_end: subscription.current_period_end,
      numLicenses: subscription.numLicenses,
      pricePerLicense: subscription.pricePerLicense,
      pricing_tier: subscription.pricing_tier,
      billing_amount: subscription.billing_amount,
      billing_interval: subscription.billing_interval
    };

    return successResponse(res, response, 'Bruger registreret succesfuldt', 201);

  } catch (error) {
    console.error('Register error:', error);
    return errorResponse(res, error.message || 'Kunne ikke registrere bruger', 500);
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
      return errorResponse(res, 'Ugyldig e-mail eller adgangskode', 401);
    }

    // Check if user has active subscription (activation is now based on subscription)
    // This will be handled by subscription middleware or checks

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(res, 'Ugyldig e-mail eller adgangskode', 401);
    }

    // Check if email is verified
    if (!user.email_verified) {
      return errorResponse(res, 'E-mail ikke verificeret. Tjek venligst din e-mail og verificer din konto før login.', 401);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Get user without password
    const userResponse = await User.findById(user._id)
      .select('-password');

    return successResponse(res, {
      user: userResponse.toJSON(),
      tokens: {
        access: accessToken,
        refresh: refreshToken
      }
    }, 'Login succesfuldt');

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Kunne ikke logge ind', 500);
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password');

    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    return successResponse(res, { user }, 'Profil hentet succesfuldt');

  } catch (error) {
    console.error('Get profile error:', error);
    return errorResponse(res, 'Kunne ikke hente profil', 500);
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
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Update fields
    const workplaceChanged = workplace !== undefined && workplace !== user.workplace;
    
    if (name) user.name = name;
    if (specialty) user.specialty = specialty;
    if (phone !== undefined) user.phone = phone;
    if (workplace !== undefined) user.workplace = workplace;
    if (journalSystem !== undefined) user.journalSystem = journalSystem;

    await user.save();

    // If main user (company admin) changes workplace, sync to all invited users
    if (workplaceChanged && user.is_company_admin) {
      await User.updateMany(
        { invited_by: user._id },
        { workplace: user.workplace }
      );
    }

    const updatedUser = await User.findById(user._id)
      .select('-password');

    return successResponse(res, { user: updatedUser }, 'Profil opdateret succesfuldt');

  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse(res, 'Kunne ikke opdatere profil', 500);
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
      return errorResponse(res, 'Nuværende adgangskode og ny adgangskode er påkrævet', 400);
    }

    if (new_password.length < 6) {
      return errorResponse(res, 'Ny adgangskode skal være mindst 6 tegn', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(current_password);
    if (!isCurrentPasswordValid) {
      return errorResponse(res, 'Nuværende adgangskode er forkert', 400);
    }

    // Update password
    user.password = new_password;
    await user.save();

    return successResponse(res, null, 'Adgangskode ændret succesfuldt');

  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse(res, 'Kunne ikke ændre adgangskode', 500);
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
      return errorResponse(res, 'E-mail er påkrævet', 400);
    }

    const user = await User.findOne({ email });


    // If user doesn't exist, still return success (security: don't reveal if email exists)
    if (!user) {
      return successResponse(res, null, 'Hvis e-mailen findes, vil et nulstillingslink blive sendt');
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
      
      return errorResponse(res, 'Kunne ikke sende nulstil e-mail. Prøv venligst igen senere.', 500);
    }

    return successResponse(res, null, 'Hvis e-mailen findes, vil et nulstillingslink blive sendt');

  } catch (error) {
    console.error('Forgot password error:', error);
    return errorResponse(res, 'Kunne ikke behandle anmodning om nulstilling af adgangskode', 500);
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
      return errorResponse(res, 'Ugyldig eller udløbet nulstillings token', 400);
    }

    // Update password and clear reset token
    user.password = new_password;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    return successResponse(res, null, 'Adgangskode nulstillet succesfuldt');

  } catch (error) {
    console.error('Reset password error:', error);
    return errorResponse(res, 'Kunne ikke nulstille adgangskode', 500);
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
      return errorResponse(res, 'Ugyldig eller udløbet verifikations token', 400);
    }

    // Verify the email
    user.email_verified = true;
    user.verification_token = null;
    await user.save();

    return successResponse(res, null, 'E-mail verificeret succesfuldt');

  } catch (error) {
    console.error('Email verification error:', error);
    return errorResponse(res, 'Kunne ikke verificere e-mail', 500);
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
      return errorResponse(res, 'E-mail er påkrævet', 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
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
      return errorResponse(res, 'Kunne ikke sende verifikations e-mail. Prøv venligst igen senere.', 500);
    }

    return successResponse(res, null, 'Verifikations e-mail sendt succesfuldt');

  } catch (error) {
    console.error('Resend verification error:', error);
    return errorResponse(res, 'Kunne ikke gensende verifikations e-mail', 500);
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
    
    return successResponse(res, null, 'Logget ud succesfuldt');

  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse(res, 'Kunne ikke logge ud', 500);
  }
};

/**
 * Verify invitation token
 * GET /api/auth/verify-invitation
 */
const verifyInvitation = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return errorResponse(res, 'Invitation token is required', 400);
    }

    // Find user with this invitation token
    const user = await User.findOne({ invitation_token: token });
    if (!user) {
      return errorResponse(res, 'Ugyldig eller udløbet invitations token', 400);
    }

    // Check if invitation is still valid (not expired)
    const invitationAge = Date.now() - user.created_at.getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (invitationAge > maxAge) {
      return errorResponse(res, 'Invitation has expired', 400);
    }

    // Get main user (who invited this user)
    const mainUser = await User.findById(user.invited_by);
    if (!mainUser) {
      return errorResponse(res, 'Hovedbruger ikke fundet', 404);
    }

    const invitationData = {
      email: user.email,
      name: user.name,
      specialty: user.specialty,
      phone: user.phone,
      company: {
        name: mainUser.workplace || 'Klinik'
      }
    };

    return successResponse(res, invitationData, 'Invitation verificeret succesfuldt');
  } catch (error) {
    console.error('Verify invitation error:', error);
    return errorResponse(res, 'Kunne ikke verificere invitation', 500);
  }
};

/**
 * Accept invitation and set password
 * POST /api/auth/accept-invitation
 */
const acceptInvitation = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return errorResponse(res, 'Token and password are required', 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', 400);
    }

    // Find user with this invitation token
    const user = await User.findOne({ invitation_token: token });
    if (!user) {
      return errorResponse(res, 'Ugyldig eller udløbet invitations token', 400);
    }

    // Check if invitation is still valid
    const invitationAge = Date.now() - user.created_at.getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (invitationAge > maxAge) {
      return errorResponse(res, 'Invitation has expired', 400);
    }

    // Update user password and activate account
    user.password = password;
    user.is_active = true;
    user.email_verified = true;
    user.invitation_token = null; // Clear the invitation token
    await user.save();

    // Get main user (who invited this user)
    const mainUser = await User.findById(user.invited_by);
    if (!mainUser) {
      return errorResponse(res, 'Hovedbruger ikke fundet', 404);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Remove password and sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.password;
    delete userResponse.verification_token;
    delete userResponse.reset_password_token;
    delete userResponse.invitation_token;

    const response = {
      user: userResponse,
      tokens: {
        access: accessToken,
        refresh: refreshToken
      },
      message: 'Konto aktiveret succesfuldt',
      company: {
        name: mainUser.workplace || 'Klinik'
      }
    };

    return successResponse(res, response, 'Invitation accepteret succesfuldt');
  } catch (error) {
    console.error('Accept invitation error:', error);
    return errorResponse(res, 'Kunne ikke acceptere invitation', 500);
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  logout,
  verifyInvitation,
  acceptInvitation
}; 