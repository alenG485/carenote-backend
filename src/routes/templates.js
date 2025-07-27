const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { templateValidation, paramValidation } = require('../middleware/validation');

/**
 * Template Routes
 * Handles clinical document templates based on session facts
 */

/**
 * @route   POST /api/templates/generate
 * @desc    Generate template from session
 * @access  Private (requires active subscription)
 */
router.post('/generate', 
  authenticate, 
  requireActiveSubscription,
  templateValidation.generate, 
  templateController.generateTemplate
);

/**
 * @route   GET /api/templates/session/:sessionId
 * @desc    Get templates for a session
 * @access  Private
 */
router.get('/session/:sessionId', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  templateController.getSessionTemplates
);

/**
 * @route   POST /api/templates/:id/regenerate
 * @desc    Regenerate template with updated facts
 * @access  Private (requires active subscription)
 */
router.post('/:id/regenerate', 
  authenticate,
  requireActiveSubscription,
  paramValidation.mongoId('id'),
  templateController.regenerateTemplate
);

module.exports = router; 