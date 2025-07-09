const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireCompanyAdmin } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Admin Routes
 * Handles administrative operations for super admins and company admins
 */

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard data
 * @access  Private (Super Admin or Company Admin)
 */
router.get('/dashboard', authenticate, requireCompanyAdmin, async (req, res) => {
  try {
    const dashboardData = {
      user_level: req.user.getAccessLevel(),
      role: req.user.role,
      company_id: req.user.company_id
    };

    return successResponse(res, { dashboard: dashboardData }, 'Admin dashboard data retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to get admin dashboard data', 500);
  }
});

module.exports = router; 