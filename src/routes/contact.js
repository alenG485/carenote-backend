const express = require('express');
const router = express.Router();
const { sendContactMessage, contactValidation } = require('../controllers/contactController');

/**
 * Contact Routes
 * Public routes for contact form submissions
 */

/**
 * POST /api/contact
 * Send contact message (no authentication required)
 */
router.post('/', contactValidation, sendContactMessage);

module.exports = router;

