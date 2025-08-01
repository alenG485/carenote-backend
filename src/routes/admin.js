const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { paramValidation } = require('../middleware/validation');

/**
 * Admin Routes
 * Handles super admin operations for user management and analytics
 * All routes require super admin access
 */


/**
 * @route   GET /api/admin/users
 * @desc    Get all users with pagination
 * @access  Private (Super Admin only)
 */
router.get('/users', 
  authenticate, 
  requireSuperAdmin,
  adminController.getAllUsers
);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get specific user details with subscription info
 * @access  Private (Super Admin only)
 */
router.get('/users/:userId', 
  authenticate, 
  requireSuperAdmin,
  paramValidation.mongoId('userId'),
  adminController.getUserDetails
);

/**
 * @route   POST /api/admin/users/:userId/send-invoice
 * @desc    Send invoice for a user
 * @access  Private (Super Admin only)
 */
router.post('/users/:userId/send-invoice', 
  authenticate, 
  requireSuperAdmin,
  paramValidation.mongoId('userId'),
  adminController.sendInvoice
);

/**
 * @route   POST /api/admin/users/:userId/mark-subscription
 * @desc    Mark subscription access for a user
 * @access  Private (Super Admin only)
 */
router.post('/users/:userId/mark-subscription', 
  authenticate, 
  requireSuperAdmin,
  paramValidation.mongoId('userId'),
  adminController.markSubscription
);

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user
 * @access  Private (Super Admin only)
 */
router.delete('/users/:userId', 
  authenticate, 
  requireSuperAdmin,
  paramValidation.mongoId('userId'),
  adminController.deleteUser
);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get dashboard analytics and statistics
 * @access  Private (Super Admin only)
 */
router.get('/analytics', 
  authenticate, 
  requireSuperAdmin,
  adminController.getAnalytics
);

/**
 * @route   GET /api/admin/companies
 * @desc    Get all companies (read-only)
 * @access  Private (Super Admin only)
 */
router.get('/companies', 
  authenticate, 
  requireSuperAdmin,
  adminController.getAllCompanies
);

module.exports = router; 