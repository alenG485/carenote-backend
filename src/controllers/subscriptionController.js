const { validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/Subscription');
const Company = require('../models/Company');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Subscription Controller
 * Handles subscription management with Stripe integration
 * Manages both individual and company subscriptions
 */



/**
 * Get current user's subscription
 * GET /api/subscriptions/current
 */
const getCurrentSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user_id: req.user._id
    });

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

    const { stripe_price_id, billing_interval } = req.body;

    // Check if user already has subscription
    const existingSubscription = await Subscription.findOne({ user_id: req.user._id });

    if (existingSubscription) {
      return errorResponse(res, 'Subscription already exists', 400);
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: req.user.email,
      name: req.user.name,
      metadata: {
        user_id: req.user._id.toString(),
        stripe_price_id,
        billing_interval
      }
    });

    // Create subscription in database
    const subscription = new Subscription({
      user_id: req.user._id,
      stripe_customer_id: customer.id,
      stripe_price_id,
      status: 'not_started',
      is_trial: false
    });

    const savedSubscription = await subscription.save();

    return successResponse(res, {
      subscription: savedSubscription,
      stripe_customer_id: customer.id
    }, 'Subscription created successfully', 201);

  } catch (error) {
    console.error('Create subscription error:', error);
    return errorResponse(res, error.message || 'Failed to create subscription', 500);
  }
};

/**
 * Create Stripe checkout session
 * POST /api/subscriptions/:id/checkout
 */
const createCheckoutSession = async (req, res) => {
  try {
    const { id } = req.params;
    
    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check if user owns this subscription
    if (subscription.user_id && subscription.user_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    if (subscription.company_id && req.user.company_id?.toString() !== subscription.company_id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: subscription.stripe_customer_id,
      payment_method_types: ['card'],
      line_items: [{
        price: subscription.stripe_price_id,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        subscription_id: subscription._id.toString(),
        user_id: req.user._id.toString()
      }
    });

    return successResponse(res, {
      checkout_url: session.url,
      session_id: session.id
    }, 'Checkout session created successfully');

  } catch (error) {
    console.error('Create checkout session error:', error);
    return errorResponse(res, error.message || 'Failed to create checkout session', 500);
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
    const { plan_name, billing_interval } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check access permissions
    if (subscription.user_id && subscription.user_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    if (subscription.company_id && req.user.company_id?.toString() !== subscription.company_id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Get new plan details if plan is changing
    if (plan_name && plan_name !== subscription.plan_name) {
      const plans = Subscription.getPlans();
      const newPlan = plans.find(plan => plan.name === plan_name);
      
      if (!newPlan) {
        return errorResponse(res, 'Invalid plan selected', 400);
      }

      subscription.plan_name = plan_name;
      subscription.plan_type = newPlan.type;
      subscription.price_monthly = newPlan.price_monthly;
      subscription.price_yearly = newPlan.price_yearly;
      subscription.max_users = newPlan.max_users;
      subscription.features = newPlan.features;
    }

    if (billing_interval) {
      subscription.billing_interval = billing_interval;
    }

    const updatedSubscription = await subscription.save();

    return successResponse(res, { subscription: updatedSubscription }, 'Subscription updated successfully');

  } catch (error) {
    console.error('Update subscription error:', error);
    return errorResponse(res, 'Failed to update subscription', 500);
  }
};

/**
 * Cancel subscription
 * DELETE /api/subscriptions/:id
 */
const cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_at_period_end = true } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return errorResponse(res, 'Subscription not found', 404);
    }

    // Check access permissions
    if (subscription.user_id && subscription.user_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    if (subscription.company_id && req.user.company_id?.toString() !== subscription.company_id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Cancel in Stripe if subscription exists
    if (subscription.stripe_subscription_id) {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: cancel_at_period_end
      });
    }

    // Update subscription status
    subscription.cancel(cancel_at_period_end);
    await subscription.save();

    return successResponse(res, { subscription }, 'Subscription cancelled successfully');

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return errorResponse(res, 'Failed to cancel subscription', 500);
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

    // Check access permissions
    if (subscription.user_id && subscription.user_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    if (subscription.company_id && req.user.company_id?.toString() !== subscription.company_id.toString()) {
      return errorResponse(res, 'Access denied', 403);
    }

    // Reactivate in Stripe if subscription exists
    if (subscription.stripe_subscription_id) {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: false
      });
    }

    // Reactivate subscription
    subscription.reactivate();
    await subscription.save();

    return successResponse(res, { subscription }, 'Subscription reactivated successfully');

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return errorResponse(res, 'Failed to reactivate subscription', 500);
  }
};

/**
 * Handle Stripe webhook
 * POST /api/subscriptions/webhook
 */
const handleStripeWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};

/**
 * Helper function to handle subscription updates from Stripe
 */
const handleSubscriptionUpdate = async (stripeSubscription) => {
  try {
    const subscription = await Subscription.findOne({
      stripe_customer_id: stripeSubscription.customer
    });

    if (subscription) {
      subscription.stripe_subscription_id = stripeSubscription.id;
      subscription.status = stripeSubscription.status;
      subscription.current_period_start = new Date(stripeSubscription.current_period_start * 1000);
      subscription.current_period_end = new Date(stripeSubscription.current_period_end * 1000);
      subscription.cancel_at_period_end = stripeSubscription.cancel_at_period_end;
      
      if (stripeSubscription.canceled_at) {
        subscription.canceled_at = new Date(stripeSubscription.canceled_at * 1000);
      }

      await subscription.save();
    }
  } catch (error) {
    console.error('Handle subscription update error:', error);
  }
};

/**
 * Helper function to handle subscription deletion from Stripe
 */
const handleSubscriptionDeleted = async (stripeSubscription) => {
  try {
    const subscription = await Subscription.findOne({
      stripe_subscription_id: stripeSubscription.id
    });

    if (subscription) {
      subscription.status = 'canceled';
      subscription.canceled_at = new Date();
      await subscription.save();
    }
  } catch (error) {
    console.error('Handle subscription deleted error:', error);
  }
};

/**
 * Helper function to handle successful payments
 */
const handlePaymentSucceeded = async (invoice) => {
  try {
    const subscription = await Subscription.findOne({
      stripe_customer_id: invoice.customer
    });

    if (subscription) {
      // Update payment method info if available
      if (invoice.charge) {
        const charge = await stripe.charges.retrieve(invoice.charge);
        if (charge.payment_method_details?.card) {
          subscription.payment_method_brand = charge.payment_method_details.card.brand;
          subscription.payment_method_last4 = charge.payment_method_details.card.last4;
        }
      }

      await subscription.save();
    }
  } catch (error) {
    console.error('Handle payment succeeded error:', error);
  }
};

/**
 * Helper function to handle failed payments
 */
const handlePaymentFailed = async (invoice) => {
  try {
    const subscription = await Subscription.findOne({
      stripe_customer_id: invoice.customer
    });

    if (subscription) {
      // Update subscription status if needed
      // Could send notification email here
      console.log(`Payment failed for subscription ${subscription._id}`);
    }
  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
};

module.exports = {
  getCurrentSubscription,
  createSubscription,
  createCheckoutSession,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  handleStripeWebhook
}; 