# Subscription Model Simplification

## Overview
The Subscription model has been simplified to remove plan details, pricing, and limits that are now managed on the frontend. The backend now focuses on Stripe integration and subscription status tracking.

## Changes Made

### 1. Simplified Subscription Model
- **Removed fields:**
  - `plan_name` - managed on frontend
  - `plan_type` - managed on frontend  
  - `price_monthly` - managed on frontend
  - `price_yearly` - managed on frontend
  - `max_users` - managed on frontend
  - `features` - managed on frontend
  - `trial_start` - using `current_period_start` instead
  - `trial_end` - using `current_period_end` instead
  - `company_id` - simplified to user-based subscriptions only

- **Kept essential fields:**
  - `user_id` - links to user
  - `stripe_customer_id` - Stripe customer reference
  - `stripe_subscription_id` - Stripe subscription reference
  - `stripe_price_id` - **REQUIRED** - Stripe price ID from frontend
  - `status` - subscription status
  - `is_trial` - boolean flag for trial status
  - `current_period_start` - billing period start
  - `current_period_end` - billing period end (also trial end)
  - `cancel_at_period_end` - cancellation flag
  - `canceled_at` - cancellation timestamp
  - `payment_method_brand` - payment method info
  - `payment_method_last4` - payment method info

### 2. Updated Registration Flow
- Registration now requires `stripe_price_id` from frontend
- Trial subscription is created with `is_trial: true`
- Trial end date can be passed from frontend or defaults to 15 days
- Subscription is linked to user immediately upon registration

### 3. Updated Controllers

#### Auth Controller
- Registration accepts `stripe_price_id` and `trialEndDate`
- Creates trial subscription with simplified model
- Returns subscription info in registration response

#### Subscription Controller
- Removed `getPlans()` method - plans managed on frontend
- Simplified `createSubscription()` to only require `stripe_price_id`
- Updated `getCurrentSubscription()` to work with user-based subscriptions
- Simplified checkout session creation to use Stripe price ID directly
- Webhook handlers remain compatible with simplified model

### 4. Updated Validation
- Registration validation requires `stripe_price_id`
- Subscription creation validation simplified
- Removed plan-specific validation rules

### 5. Updated Routes
- Removed `/plans` endpoint - plans managed on frontend
- All other endpoints remain functional with simplified model

## Frontend Integration

### Registration Request
```javascript
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Dr. John Doe",
  "role": "user", // or "company_admin"
  "journalSystem": "sundhedsplatformen",
  "companyName": "Clinic Name", // required if role is company_admin
  "stripe_price_id": "price_1234567890", // REQUIRED
  "trialEndDate": "2024-02-15T00:00:00.000Z" // optional
}
```

### Registration Response
```javascript
{
  "user": { /* user data */ },
  "token": "jwt_token",
  "subscription": {
    "id": "subscription_id",
    "status": "trialing",
    "is_trial": true,
    "current_period_end": "2024-02-15T00:00:00.000Z",
    "stripe_price_id": "price_1234567890"
  }
}
```

## Benefits

1. **Simplified Architecture**: Backend focuses on Stripe integration, frontend manages business logic
2. **Reduced Complexity**: Fewer fields to maintain and validate
3. **Better Separation**: Pricing and plan details managed where they belong (frontend)
4. **Easier Maintenance**: Less code to maintain and debug
5. **Flexible Pricing**: Frontend can easily change prices without backend changes

## Migration Notes

- Existing subscriptions will continue to work
- New registrations require `stripe_price_id` from frontend
- Trial period is now managed via `is_trial` flag and `current_period_end`
- All Stripe webhook functionality remains intact 