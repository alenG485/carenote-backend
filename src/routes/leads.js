const express = require('express');
const router = express.Router();
const { createLead } = require('../controllers/leadController');
const { leadValidation } = require('../middleware/validation');

/**
 * Lead Routes
 * Public endpoint for capturing pre-signup interest
 */

/**
 * POST /api/leads
 * Capture lead email and marketing consent
 */
router.post('/', leadValidation.create, createLead);

module.exports = router;

