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
      .withMessage('Indtast venligst en gyldig e-mail'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Adgangskode skal være mindst 6 tegn')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Adgangskode skal indeholde mindst ét små bogstav, ét stort bogstav og ét tal'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Navn skal være mellem 2 og 100 tegn'),
    body('phone')
      .optional(),
    body('workplace')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Arbejdssted skal være mindre end 200 tegn'),
    body('journalSystem')
      .optional(),
    body('role')
      .optional()
      .isIn(['user', 'super_admin'])
      .withMessage('Ugyldig rolle'),
    // Note: companyName removed - workplace field is used for all users instead
    body('numLicenses')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Antal licenser skal være mellem 1 og 500'),
    body('billing_interval')
      .optional()
      .isIn(['monthly', 'yearly'])
      .withMessage('Faktureringsinterval skal være månedlig eller årlig'),
    body('trialEndDate')
      .optional()
      .isISO8601()
      .withMessage('Prøveperiode slutdato skal være en gyldig dato')
  ],

  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Indtast venligst en gyldig e-mail'),
    body('password')
      .notEmpty()
      .withMessage('Adgangskode er påkrævet')
  ],

  updateProfile: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Navn skal være mellem 2 og 100 tegn'),
    body('specialty')
      .optional(),
    body('phone')
      .optional()
      .isMobilePhone()
      .withMessage('Indtast venligst et gyldigt telefonnummer'),
    body('workplace')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Arbejdssted skal være mindre end 200 tegn'),
    body('journalSystem')
      .optional()
  ],

  forgotPassword: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Indtast venligst en gyldig e-mail')
  ],

  resetPassword: [
    body('token')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Gyldig nulstil token er påkrævet'),
    body('new_password')
      .isLength({ min: 6 })
      .withMessage('Adgangskode skal være mindst 6 tegn')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Adgangskode skal indeholde mindst ét små bogstav, ét stort bogstav og ét tal')
  ],

  verifyEmail: [
    body('token')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Gyldig verifikations token er påkrævet')
  ],

  resendVerification: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Indtast venligst en gyldig e-mail')
  ]
};

// Session validation rules
const sessionValidation = {
  start: [
    body('session_title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Session titel skal være mellem 1 og 200 tegn'),
    body('specialty')
      .optional()
      .isString()
      .withMessage('Specialitet skal være en streng'),
    body('encounter_type')
      .optional()
      .isIn(['consultation', 'follow_up', 'emergency', 'routine'])
      .withMessage('Ugyldig mødestedstype'),
    body('patient_data')
      .optional()
      .isObject()
      .withMessage('Patient data skal være et objekt')
  ],

  addFact: [
    body('text')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Fakta tekst skal være mellem 1 og 1000 tegn'),
    body('group')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Fakta gruppe er påkrævet og skal være mindre end 100 tegn'),
    body('confidence')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Sikkerhed skal være mellem 0 og 1')
  ],

  updateFact: [
    body('text')
      .optional()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Fakta tekst skal være mellem 1 og 1000 tegn'),
    body('group')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Fakta gruppe skal være mindre end 100 tegn'),
    body('confidence')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Sikkerhed skal være mellem 0 og 1'),
    body('is_discarded')
      .optional()
      .isBoolean()
      .withMessage('is_discarded skal være en boolean værdi')
  ]
};

// Template validation rules
const templateValidation = {
  generate: [
    body('session_id')
      .isMongoId()
      .withMessage('Gyldig session ID er påkrævet'),
    body('type')
      .optional()
      .isIn(['soap', 'brief-clinical-note', 'nursing-note'])
      .withMessage('Ugyldig skabelonstype')
  ]
};

// Lead validation rules
const leadValidation = {
  create: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Indtast venligst en gyldig e-mail'),
    body('marketingOptIn')
      .optional()
      .isBoolean()
      .withMessage('MarketingOptIn skal være en boolean værdi')
  ]
};
// Subscription validation rules
const subscriptionValidation = {
  create: [
    body('numLicenses')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Antal licenser skal være mellem 1 og 500'),
    body('billing_interval')
      .optional()
      .isIn(['monthly', 'yearly'])
      .withMessage('Faktureringsinterval skal være månedlig eller årlig'),
    body('trial_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Prøveperiodedage skal være mellem 1 og 365')
  ],

  update: [
    body('numLicenses')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Antal licenser skal være mellem 1 og 500'),
    body('billing_interval')
      .optional()
      .isIn(['monthly', 'yearly'])
      .withMessage('Faktureringsinterval skal være månedlig eller årlig'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'expired', 'cancelled'])
      .withMessage('Status skal være en af: active, inactive, expired, cancelled'),
    body('notes')
      .optional()
      .isString()
      .withMessage('Noter skal være en streng')
  ]
};

// Company validation rules
const companyValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Virksomhedsnavn skal være mellem 2 og 200 tegn'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Beskrivelse skal være mindre end 500 tegn'),
    body('max_users')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Maksimum antal brugere skal være mellem 1 og 500')
  ],

  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Virksomhedsnavn skal være mellem 2 og 200 tegn'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Beskrivelse skal være mindre end 500 tegn'),
    body('max_users')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Maksimum antal brugere skal være mellem 1 og 500')
  ],

  inviteUser: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Indtast venligst en gyldig e-mail'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Navn skal være mellem 2 og 100 tegn'),
    body('specialty')
      .optional(),
    body('phone')
      .optional()
  ]
};

// Common parameter validations
const paramValidation = {
  mongoId: (paramName) => [
    param(paramName)
      .isMongoId()
      .withMessage(`Gyldig ${paramName} er påkrævet`)
  ]
};

// Query parameter validations
const queryValidation = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Side skal være et positivt heltal'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit skal være mellem 1 og 100')
  ],

  search: [
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Søgequery skal være mellem 1 og 100 tegn')
  ]
};

module.exports = {
  userValidation,
  sessionValidation,
  templateValidation,
  subscriptionValidation,
  companyValidation,
  paramValidation,
  queryValidation,
  leadValidation
}; 