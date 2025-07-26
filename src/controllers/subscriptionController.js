const { validationResult } = require('express-validator');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Subscription Controller
 * Handles manual subscription management
 * No Stripe integration - all billing is manual
 */

/**
 * Get current user's subscription
 * GET /api/subscriptions/current
 */
const getCurrentSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user_id: req.user._id
    }).populate('user_id', 'name email');

    if (!subscription) {
      return errorResponse(res, 'No subscription found', 404);
    }

    return successResponse(res, { subscription }, 'Current subscription retrieved successfully');
  } catch (error) {
    console.error('Get current subscription error:', error);
    return errorResponse(res, 'Failed to get current subscription', 500);
  }
};

/**
 * Create new subscription
 * POST /api/subscriptions
 */
const createSubscription = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { plan_name, billing_amount, billing_interval, trial_days } = req.body;

    // Check if user already has subscription
    const existingSubscription = await Subscription.findOne({ user_id: req.user._id });

    if (existingSubscription) {
      return errorResponse(res, 'Subscription already exists', 400);
    }

    // Calculate trial end date
    const trialDays = trial_days || 15;
    const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    // Create subscription in database
    const subscription = new Subscription({
      user_id: req.user._id,
      plan_name: plan_name || 'individual',
      status: 'active',
      is_trial: true,
      current_period_start: new Date(),
      current_period_end: trialEnd,
      billing_amount: billing_amount || 599,
      billing_currency: 'DKK',
      billing_interval: billing_interval || 'monthly'
    });

    const savedSubscription = await subscription.save();

    // Update user with subscription reference
    await User.findByIdAndUpdate(req.user._id, {
      subscription_id: savedSubscription._id
    });

    return successResponse(res, {
      subscription: savedSubscription
    }, 'Subscription created successfully', 201);

  } catch (error) {
    console.error('Create subscription error:', error);
    return errorResponse(res, error.message || 'Failed to create subscription', 500);
  }
};

/**
 * Update subscription
 * PUT /api/subscriptions/:id
 */
const updateSubscription = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { id } = req.params;
    const { plan_name, billing_amount, billing_interval, status, notes } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Not authorized to update this subscription', 403);
    }

    // Update fields
    if (plan_name) subscription.plan_name = plan_name;
    if (billing_amount) subscription.billing_amount = billing_amount;
    if (billing_interval) subscription.billing_interval = billing_interval;
    if (status) subscription.status = status;
    if (notes !== undefined) subscription.notes = notes;

    const updatedSubscription = await subscription.save();

    return successResponse(res, {
      subscription: updatedSubscription
    }, 'Subscription updated successfully');

  } catch (error) {
    console.error('Update subscription error:', error);
    return errorResponse(res, error.message || 'Failed to update subscription', 500);
  }
};

/**
 * Cancel subscription
 * DELETE /api/subscriptions/:id
 */
const cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Not authorized to cancel this subscription', 403);
    }

    // Cancel subscription
    subscription.cancel(req.user._id);
    await subscription.save();

    return successResponse(res, {
      subscription
    }, 'Subscription cancelled successfully');

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return errorResponse(res, error.message || 'Failed to cancel subscription', 500);
  }
};

/**
 * Reactivate subscription
 * POST /api/subscriptions/:id/reactivate
 */
const reactivateSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Not authorized to reactivate this subscription', 403);
    }

    // Reactivate subscription
    subscription.reactivate();
    await subscription.save();

    return successResponse(res, {
      subscription
    }, 'Subscription reactivated successfully');

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return errorResponse(res, error.message || 'Failed to reactivate subscription', 500);
  }
};

/**
 * Extend subscription
 * POST /api/subscriptions/:id/extend
 */
const extendSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Not authorized to extend this subscription', 403);
    }

    // Extend subscription
    const extensionDays = days || 30;
    subscription.extend(extensionDays);
    await subscription.save();

    return successResponse(res, {
      subscription
    }, `Subscription extended by ${extensionDays} days successfully`);

  } catch (error) {
    console.error('Extend subscription error:', error);
    return errorResponse(res, error.message || 'Failed to extend subscription', 500);
  }
};

/**
 * Get all subscriptions (admin only)
 * GET /api/subscriptions
 */
const getAllSubscriptions = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'super_admin') {
      return errorResponse(res, 'Not authorized to view all subscriptions', 403);
    }

    const subscriptions = await Subscription.find()
      .populate('user_id', 'name email')
      .populate('cancelled_by', 'name email')
      .sort({ created_at: -1 });

    return successResponse(res, {
      subscriptions,
      count: subscriptions.length
    }, 'All subscriptions retrieved successfully');

  } catch (error) {
    console.error('Get all subscriptions error:', error);
    return errorResponse(res, 'Failed to get subscriptions', 500);
  }
};

/**
 * Get subscription by ID (admin only)
 * GET /api/subscriptions/:id
 */
const getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is admin
    if (req.user.role !== 'super_admin') {
      return errorResponse(res, 'Not authorized to view this subscription', 403);
    }

    const subscription = await Subscription.findById(id)
      .populate('user_id', 'name email')
      .populate('cancelled_by', 'name email');

    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    return successResponse(res, {
      subscription
    }, 'Subscription retrieved successfully');

  } catch (error) {
    console.error('Get subscription by ID error:', error);
    return errorResponse(res, 'Failed to get subscription', 500);
  }
};

module.exports = {
  getCurrentSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  extendSubscription,
  getAllSubscriptions,
  getSubscriptionById
}; 