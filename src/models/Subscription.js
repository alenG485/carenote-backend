const mongoose = require('mongoose');

/**
 * Subscription Model
 * Handles subscription management with Stripe integration
 * Simplified to focus on essential fields and trial management
 */

const subscriptionSchema = new mongoose.Schema({
  // Owner (user_id only, company_id derived from user)
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Stripe Integration
  stripe_customer_id: {
    type: String,
    sparse: true
  },
  stripe_subscription_id: {
    type: String,
    sparse: true
  },
  stripe_price_id: {
    type: String,
    required: true
  },
  
  // Subscription Status
  status: {
    type: String,
    enum: [
      'not_started',
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    ],
    default: 'not_started'
  },
  

  

  

  
  // Billing Periods
  current_period_start: {
    type: Date,
    default: null
  },
  current_period_end: {
    type: Date,
    default: null
  },
  
  // Trial Management
  is_trial: {
    type: Boolean,
    default: true
  },
  
  // Cancellation
  cancel_at_period_end: {
    type: Boolean,
    default: false
  },
  canceled_at: {
    type: Date,
    default: null
  },
  

  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance
subscriptionSchema.index({ user_id: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ is_trial: 1 });

// Validation: user_id is required
subscriptionSchema.pre('validate', function(next) {
  if (!this.user_id) {
    return next(new Error('user_id is required'));
  }
  next();
});

// Virtual to check if subscription is active
subscriptionSchema.virtual('is_active').get(function() {
  const activeStatuses = ['trialing', 'active'];
  return activeStatuses.includes(this.status);
});



// Virtual to check if subscription is expired
subscriptionSchema.virtual('is_expired').get(function() {
  if (!this.current_period_end) return false;
  return new Date() > this.current_period_end;
});

// Virtual to get days until expiration
subscriptionSchema.virtual('days_until_expiration').get(function() {
  if (!this.current_period_end) return null;
  const now = new Date();
  const diffTime = this.current_period_end - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to check if subscription allows access
subscriptionSchema.methods.hasAccess = function() {
  const activeStatuses = ['trialing', 'active'];
  
  // Check status
  if (!activeStatuses.includes(this.status)) return false;
  
  // Check if not expired
  if (this.current_period_end && new Date() > this.current_period_end) {
    return false;
  }
  
  return true;
};



// Method to cancel subscription
subscriptionSchema.methods.cancel = function(cancelAtPeriodEnd = true) {
  if (cancelAtPeriodEnd) {
    this.cancel_at_period_end = true;
  } else {
    this.status = 'canceled';
    this.canceled_at = new Date();
  }
  return this;
};

// Method to reactivate subscription
subscriptionSchema.methods.reactivate = function() {
  this.status = 'active';
  this.cancel_at_period_end = false;
  this.canceled_at = null;
  return this;
};



module.exports = mongoose.model('Subscription', subscriptionSchema); 