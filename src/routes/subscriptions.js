const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, requireCompanyAdmin } = require('../middleware/auth');
const { subscriptionValidation, paramValidation } = require('../middleware/validation');

/**
 * Subscription Routes
 * Handles subscription management with Stripe integration
 */



/**
 * @route   GET /api/subscriptions/current
 * @desc    Get current user's subscription
 * @access  Private
 */
router.get('/current', authenticate, subscriptionController.getCurrentSubscription);

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
 * @route   POST /api/subscriptions/:id/checkout
 * @desc    Create Stripe checkout session
 * @access  Private
 */
router.post('/:id/checkout', 
  authenticate,
  paramValidation.mongoId('id'),
  subscriptionController.createCheckoutSession
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
 * @route   POST /api/subscriptions/webhook
 * @desc    Handle Stripe webhook
 * @access  Public (Stripe webhook)
 */
router.post('/webhook', 
  express.raw({ type: 'application/json' }),
  subscriptionController.handleStripeWebhook
);

module.exports = router; 