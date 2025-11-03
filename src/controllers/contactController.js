const emailService = require('../services/emailService');
const { successResponse, errorResponse } = require('../utils/responses');
const { body, validationResult } = require('express-validator');

/**
 * Contact Controller
 * Handles contact form submissions from non-registered users
 */

/**
 * Validation rules for contact form
 */
const contactValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Navn er påkrævet')
    .isLength({ min: 2, max: 100 })
    .withMessage('Navn skal være mellem 2 og 100 tegn'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email er påkrævet')
    .isEmail()
    .withMessage('Ugyldig email adresse')
    .normalizeEmail(),
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Emne er påkrævet')
    .isLength({ min: 3, max: 200 })
    .withMessage('Emne skal være mellem 3 og 200 tegn'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Besked er påkrævet')
    .isLength({ min: 10, max: 5000 })
    .withMessage('Besked skal være mellem 10 og 5000 tegn')
];

/**
 * Send contact message
 * POST /api/contact
 * No authentication required - public endpoint
 */
const sendContactMessage = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validering fejlede', 400, errors.array());
    }

    const { name, email, subject, message } = req.body;

    // Send email using email service
    try {
      await emailService.sendContactEmail({
        name,
        email,
        subject,
        message
      });

      return successResponse(
        res,
        { message: 'Din besked er blevet sendt. Vi vender tilbage hurtigst muligt.' },
        'Besked sendt succesfuldt',
        201
      );
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      return errorResponse(
        res,
        'Kunne ikke sende besked. Prøv venligst igen senere.',
        500
      );
    }
  } catch (error) {
    console.error('Contact form error:', error);
    return errorResponse(
      res,
      'Der opstod en fejl. Prøv venligst igen senere.',
      500
    );
  }
};

module.exports = {
  sendContactMessage,
  contactValidation
};

