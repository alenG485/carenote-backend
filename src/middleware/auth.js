const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/responses');

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
  if (req.user.role !== 'company_admin' && req.user.role !== 'super_admin') {
    return errorResponse(res, 'Company admin access required', 403);
  }
  next();
};

/**
 * Check if user can access specific company data
 */
const requireCompanyAccess = (companyIdParam = 'companyId') => {
  return (req, res, next) => {
    const companyId = req.params[companyIdParam];
    
    if (req.user.role === 'super_admin') {
      // Super admin can access any company
      return next();
    }
    
    if (req.user.role === 'company_admin' && req.user.company_id) {
      if (req.user.company_id.toString() === companyId) {
        return next();
      }
    }
    
    return errorResponse(res, 'Access denied to this company', 403);
  };
};

/**
 * Check subscription access
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    const Subscription = require('../models/Subscription');
    
    let subscription;
    
    if (req.user.company_id) {
      // Company user - check company subscription
      subscription = await Subscription.findOne({
        company_id: req.user.company_id,
        status: { $in: ['trialing', 'active'] }
      });
    } else {
      // Individual user - check individual subscription
      subscription = await Subscription.findOne({
        user_id: req.user._id,
        status: { $in: ['trialing', 'active'] }
      });
    }

    if (!subscription || !subscription.hasAccess()) {
      return errorResponse(res, 'Active subscription required', 402);
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return errorResponse(res, 'Failed to verify subscription', 500);
  }
};

module.exports = {
  authenticate,
  requireSuperAdmin,
  requireCompanyAdmin,
  requireCompanyAccess,
  requireActiveSubscription
}; 