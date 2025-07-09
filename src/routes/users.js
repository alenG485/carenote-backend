const express = require('express');
const router = express.Router();
const { authenticate, requireCompanyAdmin, requireSuperAdmin } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * User Management Routes
 * Handles user management operations
 */

/**
 * @route   GET /api/users/profile
 * @desc    Get user profile (alias to auth/me)
 * @access  Private
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    return successResponse(res, { user: req.user }, 'User profile retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to get user profile', 500);
  }
});

module.exports = router; 