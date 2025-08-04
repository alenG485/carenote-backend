const { body, param, query } = require('express-validator');

/**
 * Validation Middleware
 * Request validation rules using express-validator
 */

// User validation rules
const userValidation = {
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('phone')
      .optional(),
    body('workplace')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Workplace must be less than 200 characters'),
    body('journalSystem')
      .optional(),
    body('role')
      .optional()
      .isIn(['user', 'company_admin', 'super_admin'])
      .withMessage('Invalid role'),
    body('companyName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Company name must be between 2 and 200 characters')
      .custom((value, { req }) => {
        // Company name is required if role is company_admin
        if (req.body.role === 'company_admin' && !value) {
          throw new Error('Company name is required for company admin registration');
        }
        return true;
      }),
    body('plan_name')
      .optional()
      .isIn(['individual', 'clinic-small', 'clinic-medium', 'clinic-large'])
      .withMessage('Plan name must be one of: individual, clinic-small, clinic-medium, clinic-large'),
    body('trialEndDate')
      .optional()
      .isISO8601()
      .withMessage('Trial end date must be a valid date')
  ],

  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  updateProfile: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('specialty')
      .optional(),
    body('phone')
      .optional()
      .isMobilePhone()
      .withMessage('Please provide a valid phone number'),
    body('workplace')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Workplace must be less than 200 characters'),
    body('journalSystem')
      .optional()
  ],

  forgotPassword: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email')
  ],

  resetPassword: [
    body('token')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Valid reset token is required'),
    body('new_password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
  ],

  verifyEmail: [
    body('token')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Valid verification token is required')
  ],

  resendVerification: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email')
  ]
};

// Session validation rules
const sessionValidation = {
  start: [
    body('session_title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Session title must be between 1 and 200 characters'),
    body('specialty')
      .optional()
      .isString()
      .withMessage('Specialty must be a string'),
    body('encounter_type')
      .optional()
      .isIn(['consultation', 'follow_up', 'emergency', 'routine'])
      .withMessage('Invalid encounter type'),
    body('patient_data')
      .optional()
      .isObject()
      .withMessage('Patient data must be an object')
  ],

  addFact: [
    body('text')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Fact text must be between 1 and 1000 characters'),
    body('group')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Fact group is required and must be less than 100 characters'),
    body('confidence')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Confidence must be between 0 and 1')
  ],

  updateFact: [
    body('text')
      .optional()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Fact text must be between 1 and 1000 characters'),
    body('group')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Fact group must be less than 100 characters'),
    body('confidence')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Confidence must be between 0 and 1'),
    body('is_discarded')
      .optional()
      .isBoolean()
      .withMessage('is_discarded must be a boolean')
  ]
};

// Template validation rules
const templateValidation = {
  generate: [
    body('session_id')
      .isMongoId()
      .withMessage('Valid session ID is required'),
    body('type')
      .optional()
      .isIn(['soap', 'brief-clinical-note'])
      .withMessage('Invalid template type')
  ]
};

// Subscription validation rules
const subscriptionValidation = {
  create: [
    body('plan_name')
      .optional()
      .isIn(['individual', 'clinic-small', 'clinic-medium', 'clinic-large'])
      .withMessage('Plan name must be one of: individual, clinic-small, clinic-medium, clinic-large'),
    body('billing_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Billing amount must be a positive number'),
    body('billing_interval')
      .optional()
      .isIn(['monthly', 'yearly'])
      .withMessage('Billing interval must be monthly or yearly'),
    body('trial_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Trial days must be between 1 and 365')
  ],

  update: [
    body('plan_name')
      .optional()
      .isIn(['individual', 'clinic-small', 'clinic-medium', 'clinic-large'])
      .withMessage('Plan name must be one of: individual, clinic-small, clinic-medium, clinic-large'),
    body('billing_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Billing amount must be a positive number'),
    body('billing_interval')
      .optional()
      .isIn(['monthly', 'yearly'])
      .withMessage('Billing interval must be monthly or yearly'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'expired', 'cancelled'])
      .withMessage('Status must be one of: active, inactive, expired, cancelled'),
    body('notes')
      .optional()
      .isString()
      .withMessage('Notes must be a string')
  ]
};

// Company validation rules
const companyValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Company name must be between 2 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('max_users')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Max users must be between 1 and 500')
  ],

  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Company name must be between 2 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('max_users')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Max users must be between 1 and 500')
  ],

  inviteUser: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('specialty')
      .optional()
      .isIn([
        'general', 'cardiology', 'dermatology', 'endocrinology', 'gastroenterology',
        'hematology', 'infectious_disease', 'nephrology', 'neurology', 'oncology',
        'pulmonology', 'rheumatology', 'psychiatry', 'orthopedics', 'ophthalmology',
        'otolaryngology', 'urology', 'gynecology', 'pediatrics', 'geriatrics'
      ])
      .withMessage('Invalid specialty')
  ]
};

// Common parameter validations
const paramValidation = {
  mongoId: (paramName) => [
    param(paramName)
      .isMongoId()
      .withMessage(`Valid ${paramName} is required`)
  ]
};

// Query parameter validations
const queryValidation = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],

  search: [
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters')
  ]
};

module.exports = {
  userValidation,
  sessionValidation,
  templateValidation,
  subscriptionValidation,
  companyValidation,
  paramValidation,
  queryValidation
}; 