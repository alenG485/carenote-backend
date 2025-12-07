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
      return errorResponse(res, 'Intet abonnement fundet', 404);
    }

    return successResponse(res, { subscription }, 'Nuværende abonnement hentet succesfuldt');
  } catch (error) {
    console.error('Get current subscription error:', error);
    return errorResponse(res, 'Kunne ikke hente nuværende abonnement', 500);
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
      return errorResponse(res, 'Validering fejlede', 400, errors.array());
    }

    const { plan_name, billing_amount, billing_interval, trial_days } = req.body;

    // Check if user already has subscription
    const existingSubscription = await Subscription.findOne({ user_id: req.user._id });

    if (existingSubscription) {
      return errorResponse(res, 'Abonnement findes allerede', 400);
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
    }, 'Abonnement oprettet succesfuldt', 201);

  } catch (error) {
    console.error('Create subscription error:', error);
    return errorResponse(res, error.message || 'Kunne ikke oprette abonnement', 500);
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
      return errorResponse(res, 'Validering fejlede', 400, errors.array());
    }

    const { id } = req.params;
    const { plan_name, billing_amount, billing_interval, status, notes } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Ikke autoriseret til at opdatere dette abonnement', 403);
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
    }, 'Abonnement opdateret succesfuldt');

  } catch (error) {
    console.error('Update subscription error:', error);
    return errorResponse(res, error.message || 'Kunne ikke opdatere abonnement', 500);
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
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Ikke autoriseret til at annullere dette abonnement', 403);
    }

    // Cancel subscription
    subscription.cancel(req.user._id);
    await subscription.save();

    return successResponse(res, {
      subscription
    }, 'Abonnement annulleret succesfuldt');

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return errorResponse(res, error.message || 'Kunne ikke annullere abonnement', 500);
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
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Ikke autoriseret til at genaktivere dette abonnement', 403);
    }

    // Reactivate subscription
    subscription.reactivate();
    await subscription.save();

    return successResponse(res, {
      subscription
    }, 'Abonnement genaktiveret succesfuldt');

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return errorResponse(res, error.message || 'Kunne ikke genaktivere abonnement', 500);
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
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Ikke autoriseret til at forlænge dette abonnement', 403);
    }

    // Extend subscription
    const extensionDays = days || 30;
    subscription.extend(extensionDays);
    await subscription.save();

    return successResponse(res, {
      subscription
    }, `Abonnement forlænget med ${extensionDays} dage succesfuldt`);

  } catch (error) {
    console.error('Extend subscription error:', error);
    return errorResponse(res, error.message || 'Kunne ikke forlænge abonnement', 500);
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
      return errorResponse(res, 'Ikke autoriseret til at se alle abonnementer', 403);
    }

    const subscriptions = await Subscription.find()
      .populate('user_id', 'name email')
      .populate('cancelled_by', 'name email')
      .sort({ created_at: -1 });

    return successResponse(res, {
      subscriptions,
      count: subscriptions.length
    }, 'Alle abonnementer hentet succesfuldt');

  } catch (error) {
    console.error('Get all subscriptions error:', error);
    return errorResponse(res, 'Kunne ikke hente abonnementer', 500);
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
      return errorResponse(res, 'Ikke autoriseret til at se dette abonnement', 403);
    }

    const subscription = await Subscription.findById(id)
      .populate('user_id', 'name email')
      .populate('cancelled_by', 'name email');

    if (!subscription) {
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    return successResponse(res, {
      subscription
    }, 'Abonnement hentet succesfuldt');

  } catch (error) {
    console.error('Get subscription by ID error:', error);
    return errorResponse(res, 'Kunne ikke hente abonnement', 500);
  }
};

/**
 * Get pricing configuration
 * GET /api/subscriptions/pricing
 */
const getPricing = async (req, res) => {
  try {
    const { pricingConfig } = require('../config/pricing');
    return successResponse(res, { pricing: pricingConfig }, 'Priser hentet succesfuldt');
  } catch (error) {
    console.error('Get pricing error:', error);
    return errorResponse(res, 'Kunne ikke hente priser', 500);
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
  getSubscriptionById,
  getPricing
}; 