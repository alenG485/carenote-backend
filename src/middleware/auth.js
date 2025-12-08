const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/responses');
const Subscription = require('../models/Subscription');


/**
 * Authentication Middleware
 * Verifies JWT tokens and loads user data
 */

/**
 * Verify JWT token and load user
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return errorResponse(res, 'Access denied. No token provided.', 401);
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return errorResponse(res, 'Token is valid but user not found', 401);
      }

      // Check if user has active subscription (activation is now based on subscription)
      // This will be handled by subscription middleware or checks

      // Add user to request
      req.user = user;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return errorResponse(res, 'Token expired', 401);
      }
      return errorResponse(res, 'Invalid token', 401);
    }

  } catch (error) {
    console.error('Authentication error:', error);
    return errorResponse(res, 'Authentication failed', 500);
  }
};

/**
 * Check if user is super admin
 */
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return errorResponse(res, 'Super admin access required', 403);
  }
  next();
};

/**
 * Check if user is company admin or super admin
 */
const requireCompanyAdmin = (req, res, next) => {
  if (!req.user.is_company_admin && req.user.role !== 'super_admin') {
    return errorResponse(res, 'Company admin access required', 403);
  }
  next();
};

/**
 * Check if user can access specific company data
 */
const requireCompanyAccess = (userIdParam = 'userId') => {
  return async (req, res, next) => {
    const User = require('../models/User');
    const targetUserId = req.params[userIdParam];
    
    if (req.user.role === 'super_admin') {
      // Super admin can access any user
      return next();
    }
    
    // Check if target user is invited by current user (or is current user)
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return errorResponse(res, 'User not found', 404);
    }
    
    if (targetUser.invited_by && targetUser.invited_by.toString() === req.user._id.toString()) {
      return next();
    }
    
    if (targetUser._id.toString() === req.user._id.toString()) {
      return next();
    }
    
    return errorResponse(res, 'Access denied to this user', 403);
  };
};

/**
 * Check subscription access
 * - If user is company admin (is_company_admin: true), check their own subscription
 * - If user is invited (invited_by exists), check the subscription of the user who invited them
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    let subscription;
    let subscriptionOwnerId;
    
    if (req.user.is_company_admin) {
      // Company admin - check their own subscription
      subscriptionOwnerId = req.user._id;
    } else if (req.user.invited_by) {
      // Invited user - check the subscription of the user who invited them (main admin)
      subscriptionOwnerId = req.user.invited_by;
    } else {
      // Fallback: check own subscription (shouldn't happen, but handle gracefully)
      subscriptionOwnerId = req.user._id;
    }

    // Find subscription for the owner
    subscription = await Subscription.findOne({
      user_id: subscriptionOwnerId,
      status: { $in: ['trialing', 'active'] }
    });

    if (!subscription || !subscription.hasAccess()) {
      return errorResponse(res, 'Aktivt abonnement påkrævet', 402);
    }

    req.subscription = subscription;
    req.subscriptionOwnerId = subscriptionOwnerId;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return errorResponse(res, 'Abonnementet kunne ikke bekræftes', 500);
  }
};

/**
 * Check if user can access a specific session
 * - Super admin can access any session
 * - User can only access their own sessions (session.user_id === req.user._id)
 */
const requireSessionAccess = (sessionIdParam = 'sessionId') => {
  return async (req, res, next) => {
    try {
      const Session = require('../models/Session');
      const sessionId = req.params[sessionIdParam];

      // Find the session
      const session = await Session.findById(sessionId);
      if (!session) {
        return errorResponse(res, 'Session ikke fundet', 404);
      }

      // Super admin can access any session
      if (req.user.role === 'super_admin') {
        req.session = session;
        return next();
      }

      // User can only access their own sessions
      if (session.user_id.toString() !== req.user._id.toString()) {
        return errorResponse(res, 'Adgang nægtet til denne session', 403);
      }

      req.session = session;
      return next();
    } catch (error) {
      console.error('Session access check error:', error);
      return errorResponse(res, 'Kunne ikke verificere session adgang', 500);
    }
  };
};

module.exports = {
  authenticate,
  requireSuperAdmin,
  requireCompanyAdmin,
  requireCompanyAccess,
  requireActiveSubscription,
  requireSessionAccess
}; 