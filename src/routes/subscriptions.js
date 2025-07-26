const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { subscriptionValidation, paramValidation } = require('../middleware/validation');

/**
 * Subscription Routes
 * Handles manual subscription management
 */

/**
 * @route   GET /api/subscriptions/current
 * @desc    Get current user's subscription
 * @access  Private
 */
router.get('/current', authenticate, subscriptionController.getCurrentSubscription);

/**
 * @route   GET /api/subscriptions
 * @desc    Get all subscriptions (admin only)
 * @access  Private (Super Admin)
 */
router.get('/', authenticate, requireSuperAdmin, subscriptionController.getAllSubscriptions);

/**
 * @route   GET /api/subscriptions/:id
 * @desc    Get subscription by ID (admin only)
 * @access  Private (Super Admin)
 */
router.get('/:id', 
  authenticate, 
  requireSuperAdmin,
  paramValidation.mongoId('id'),
  subscriptionController.getSubscriptionById
);

/**
 * @route   POST /api/subscriptions
 * @desc    Create new subscription
 * @access  Private
 */
router.post('/', 
  authenticate, 
  subscriptionValidation.create, 
  subscriptionController.createSubscription
);

/**
 * @route   PUT /api/subscriptions/:id
 * @desc    Update subscription
 * @access  Private
 */
router.put('/:id', 
  authenticate,
  paramValidation.mongoId('id'),
  subscriptionValidation.update,
  subscriptionController.updateSubscription
);

/**
 * @route   DELETE /api/subscriptions/:id
 * @desc    Cancel subscription
 * @access  Private
 */
router.delete('/:id', 
  authenticate,
  paramValidation.mongoId('id'),
  subscriptionController.cancelSubscription
);

/**
 * @route   POST /api/subscriptions/:id/reactivate
 * @desc    Reactivate subscription
 * @access  Private
 */
router.post('/:id/reactivate', 
  authenticate,
  paramValidation.mongoId('id'),
  subscriptionController.reactivateSubscription
);

/**
 * @route   POST /api/subscriptions/:id/extend
 * @desc    Extend subscription
 * @access  Private
 */
router.post('/:id/extend', 
  authenticate,
  paramValidation.mongoId('id'),
  subscriptionController.extendSubscription
);

module.exports = router; 