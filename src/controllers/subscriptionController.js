const { validationResult } = require('express-validator');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/responses');
const { calculatePrice, getTierLabel } = require('../config/pricing');

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

    const { numLicenses, billing_interval, trial_days } = req.body;

    // Check if user already has subscription
    const existingSubscription = await Subscription.findOne({ user_id: req.user._id });

    if (existingSubscription) {
      return errorResponse(res, 'Abonnement findes allerede', 400);
    }

    // Validate numLicenses
    const licenseCount = numLicenses || 1;
    if (licenseCount < 1) {
      return errorResponse(res, 'Antal licenser skal være mindst 1', 400);
    }

    // Calculate pricing
    const billingInterval = billing_interval || 'monthly';
    const pricing = calculatePrice(licenseCount, billingInterval);
    
    if (!pricing) {
      return errorResponse(res, 'Ugyldigt antal licenser eller faktureringsinterval', 400);
    }

    // Calculate trial end date
    const trialDays = trial_days || 10;
    const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    // Determine tier max capacity
    const tierLabel = getTierLabel(pricing.tier.minLicenses);
    const { getMaxLicensesForTier } = require('../config/pricing');
    const maxLicensesForTier = getMaxLicensesForTier(pricing.tier.minLicenses, licenseCount);

    // Create subscription in database
    const subscription = new Subscription({
      user_id: req.user._id,
      numLicenses: maxLicensesForTier, // Store tier max capacity
      pricePerLicense: pricing.pricePerLicense,
      pricing_tier: tierLabel,
      status: 'active',
      is_trial: true,
      current_period_start: new Date(),
      current_period_end: trialEnd,
      billing_amount: pricing.totalPrice, // Billing based on actual users (respecting tier minimum)
      billing_currency: 'DKK',
      billing_interval: billingInterval
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
    const { numLicenses, billing_interval, status, notes } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Ikke autoriseret til at opdatere dette abonnement', 403);
    }

    // If numLicenses is being updated, recalculate pricing
    if (numLicenses && numLicenses !== subscription.numLicenses) {
      const billingInterval = billing_interval || subscription.billing_interval;
      const pricing = calculatePrice(numLicenses, billingInterval);
      
      if (!pricing) {
        return errorResponse(res, 'Ugyldigt antal licenser', 400);
      }

      const { getMaxLicensesForTier } = require('../config/pricing');
      const tierLabel = getTierLabel(pricing.tier.minLicenses);
      const maxLicensesForTier = getMaxLicensesForTier(pricing.tier.minLicenses, numLicenses);

      subscription.numLicenses = maxLicensesForTier; // Store tier max capacity
      subscription.pricePerLicense = pricing.pricePerLicense;
      subscription.pricing_tier = tierLabel;
      subscription.billing_amount = pricing.totalPrice; // Billing based on actual users (respecting tier minimum)
      
      // Note: No need to update company max_users anymore
      // License count is managed via subscription.numLicenses
    }

    // Update other fields
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
 * Upgrade licenses for a subscription
 * PUT /api/subscriptions/:id/licenses
 */
const upgradeLicenses = async (req, res) => {
  try {
    const { id } = req.params;
    const { numLicenses } = req.body;

    if (!numLicenses || numLicenses < 1) {
      return errorResponse(res, 'Antal licenser skal være mindst 1', 400);
    }

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Abonnement ikke fundet', 404);
    }

    // Check if user owns this subscription or is admin
    if (subscription.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Ikke autoriseret til at opdatere dette abonnement', 403);
    }

    // Calculate new pricing
    const pricing = calculatePrice(numLicenses, subscription.billing_interval);
    
    if (!pricing) {
      return errorResponse(res, 'Ugyldigt antal licenser', 400);
    }

    // Store old values for response
    const oldLicenses = subscription.numLicenses;
    const oldPrice = subscription.billing_amount;

    // Determine tier max capacity
    const { getMaxLicensesForTier } = require('../config/pricing');
    const tierLabel = getTierLabel(pricing.tier.minLicenses);
    const maxLicensesForTier = getMaxLicensesForTier(pricing.tier.minLicenses, numLicenses);

    // Update subscription
    subscription.numLicenses = maxLicensesForTier; // Store tier max capacity
    subscription.pricePerLicense = pricing.pricePerLicense;
    subscription.pricing_tier = tierLabel;
    subscription.billing_amount = pricing.totalPrice; // Billing based on actual users (respecting tier minimum)

    await subscription.save();

    // Note: Company model removed - license management is now handled via subscription.numLicenses
    // No need to update a separate company entity

    return successResponse(res, {
      subscription,
      upgradeInfo: {
        oldLicenses,
        newLicenses: numLicenses,
        oldPrice,
        newPrice: pricing.totalPrice,
        priceDifference: pricing.totalPrice - oldPrice,
        tier: subscription.pricing_tier
      }
    }, 'Licenser opgraderet succesfuldt');

  } catch (error) {
    console.error('Upgrade licenses error:', error);
    return errorResponse(res, error.message || 'Kunne ikke opgradere licenser', 500);
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
  upgradeLicenses,
  getPricing
}; 