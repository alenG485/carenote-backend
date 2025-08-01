const mongoose = require('mongoose');

/**
 * Subscription Model
 * Handles subscription management with manual billing
 * Simplified for manual subscription management
 */

const subscriptionSchema = new mongoose.Schema({
  // Owner (user_id only, company_id derived from user)
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Manual Subscription Details
  plan_name: {
    type: String,
    required: true,
    enum: ['individual', 'clinic-small', 'clinic-medium', 'clinic-large', 'super_admin']
  },
  
  // Subscription Status
  status: {
    type: String,
    enum: [
      'active',
      'inactive',
      'expired',
      'cancelled'
    ],
    default: 'active'
  },
  
  // Billing Periods
  current_period_start: {
    type: Date,
    default: Date.now
  },
  current_period_end: {
    type: Date,
    required: true
  },
  
  // Trial Management
  is_trial: {
    type: Boolean,
    default: true
  },
  
  // Manual Billing Info
  billing_amount: {
    type: Number,
    required: true
  },
  billing_currency: {
    type: String,
    default: 'DKK'
  },
  billing_interval: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  
  // Cancellation
  cancelled_at: {
    type: Date,
    default: null
  },
  cancelled_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Manual Payment Tracking
  last_payment_date: {
    type: Date,
    default: null
  },
  next_payment_date: {
    type: Date,
    default: null
  },
  
  // Notes for manual management
  notes: {
    type: String,
    default: ''
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
subscriptionSchema.index({ current_period_end: 1 });

// Validation: user_id is required
subscriptionSchema.pre('validate', function(next) {
  if (!this.user_id) {
    return next(new Error('user_id is required'));
  }
  next();
});

// Virtual to check if subscription is active
subscriptionSchema.virtual('is_active').get(function() {
  const activeStatuses = ['active'];
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
  const activeStatuses = ['active', 'trialing'];
  
  // Check status
  if (!activeStatuses.includes(this.status)) return false;
  
  // Check if not expired
  if (this.current_period_end && new Date() > this.current_period_end) {
    return false;
  }
  
  return true;
};

// Method to cancel subscription
subscriptionSchema.methods.cancel = function(cancelledBy = null) {
  this.status = 'cancelled';
  this.cancelled_at = new Date();
  this.cancelled_by = cancelledBy;
  return this;
};

// Method to reactivate subscription
subscriptionSchema.methods.reactivate = function() {
  this.status = 'active';
  this.cancelled_at = null;
  this.cancelled_by = null;
  return this;
};

// Method to extend subscription
subscriptionSchema.methods.extend = function(days = 30) {
  const newEndDate = new Date(this.current_period_end);
  newEndDate.setDate(newEndDate.getDate() + days);
  this.current_period_end = newEndDate;
  this.last_payment_date = new Date();
  this.next_payment_date = newEndDate;
  return this;
};

module.exports = mongoose.model('Subscription', subscriptionSchema); 