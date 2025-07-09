const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { templateValidation, paramValidation, queryValidation } = require('../middleware/validation');

/**
 * Template Routes
 * Handles clinical document templates with role-based access
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
 * @route   GET /api/templates/stats
 * @desc    Get template statistics
 * @access  Private
 */
router.get('/stats', 
  authenticate, 
  templateController.getTemplateStats
);

/**
 * @route   GET /api/templates
 * @desc    Get templates for user (role-based)
 * @access  Private
 */
router.get('/', 
  authenticate, 
  queryValidation.pagination,
  queryValidation.search,
  templateController.getTemplates
);

/**
 * @route   GET /api/templates/:id
 * @desc    Get single template by ID
 * @access  Private
 */
router.get('/:id', 
  authenticate,
  paramValidation.mongoId('id'),
  templateController.getTemplate
);

/**
 * @route   PUT /api/templates/:id
 * @desc    Update template
 * @access  Private
 */
router.put('/:id', 
  authenticate,
  paramValidation.mongoId('id'),
  templateValidation.update,
  templateController.updateTemplate
);

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete template
 * @access  Private
 */
router.delete('/:id', 
  authenticate,
  paramValidation.mongoId('id'),
  templateController.deleteTemplate
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

/**
 * @route   POST /api/templates/:id/finalize
 * @desc    Finalize template (mark as final)
 * @access  Private
 */
router.post('/:id/finalize', 
  authenticate,
  paramValidation.mongoId('id'),
  templateController.finalizeTemplate
);

/**
 * @route   POST /api/templates/:id/archive
 * @desc    Archive template
 * @access  Private
 */
router.post('/:id/archive', 
  authenticate,
  paramValidation.mongoId('id'),
  templateController.archiveTemplate
);

module.exports = router; 