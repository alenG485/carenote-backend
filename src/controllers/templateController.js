const { validationResult } = require('express-validator');
const Template = require('../models/Template');
const Session = require('../models/Session');
const cortiService = require('../services/cortiService');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Template Controller
 * Handles clinical document templates based on session facts
 */

/**
 * Generate template from session
 * POST /api/templates/generate
 */
const generateTemplate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { 
      session_id, 
      type = 'brief-clinical-note',
      outputLanguage
    } = req.body;

    // Verify session access (user owns session OR is company admin of session owner)
    const User = require('../models/User');
    const session = await Session.findById(session_id);
    
    if (!session) {
      return errorResponse(res, 'Session ikke fundet', 404);
    }

    // Check access: user owns session OR is company admin and session owner was invited by them
    let hasAccess = false;
    
    if (session.user_id.toString() === req.user._id.toString()) {
      hasAccess = true;
    } else if (req.user.is_company_admin) {
      const sessionOwner = await User.findById(session.user_id).select('_id invited_by');
      if (sessionOwner && sessionOwner.invited_by && 
          sessionOwner.invited_by.toString() === req.user._id.toString()) {
        hasAccess = true;
      }
    }

    if (!hasAccess && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Adgang nægtet til denne session', 403);
    }

    // Generate template from Corti
    const templateData = await cortiService.generateTemplate(
      session.corti_interaction_id, 
      type,
      outputLanguage
    );
    // Generate title based on template type and session
    const templateTitle = type === 'soap' ? 'SOAP Note' : 'Brief Clinical Note';

    // Create or update template in database
    // Use session owner's user_id (not req.user._id) so templates are associated with session owner
    const template = await Template.getOrCreateTemplate(
      session._id,
      session.user_id, // Use session owner's user_id
      type,
      templateData.templateKey,
      templateTitle,
      templateData.content,
      templateData.facts,
      outputLanguage
    );

    return successResponse(res, {
      template: template,
      generation_info: {
        facts_used: templateData.facts.length,
        template_type: type,
        corti_template_key: templateData.templateKey
      }
    }, 'Skabelon genereret succesfuldt', 201);

  } catch (error) {
    console.error('Generate template error:', error);
    return errorResponse(res, error.message || 'Kunne ikke generere skabelon', 500);
  }
};

/**
 * Get templates for a session
 * GET /api/templates/session/:sessionId
 * Access control handled by requireSessionAccess middleware
 */
const getSessionTemplates = async (req, res) => {
  try {
    // Session is already loaded and access verified by requireSessionAccess middleware
    const session = req.session;

    // Get templates for this session - use session owner's user_id
    // This allows company admins to see templates from sessions they have access to
    const templates = await Template.getTemplatesForSession(session._id, session.user_id);

    return successResponse(res, {
      templates: templates,
      session_id: session._id
    }, 'Skabeloner hentet succesfuldt');

  } catch (error) {
    console.error('Get session templates error:', error);
    return errorResponse(res, 'Kunne ikke hente session skabeloner', 500);
  }
};

/**
 * Regenerate template with updated facts
 * POST /api/templates/:id/regenerate
 */
const regenerateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const User = require('../models/User');

    const template = await Template.findById(id).populate('session_id');

    if (!template) {
      return errorResponse(res, 'Skabelon ikke fundet', 404);
    }

    if (!template.session_id) {
      return errorResponse(res, 'Skabelon session ikke fundet', 404);
    }

    // Check access: user owns template OR is company admin and session owner was invited by them
    let hasAccess = false;
    
    if (template.user_id.toString() === req.user._id.toString()) {
      hasAccess = true;
    } else if (req.user.is_company_admin) {
      const sessionOwner = await User.findById(template.session_id.user_id).select('_id invited_by');
      if (sessionOwner && sessionOwner.invited_by && 
          sessionOwner.invited_by.toString() === req.user._id.toString()) {
        hasAccess = true;
      }
    }

    if (!hasAccess && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Adgang nægtet til denne skabelon', 403);
    }

    // Generate new template from current session facts
    const templateData = await cortiService.generateTemplate(
      template.session_id.corti_interaction_id, 
      template.type,
      template.output_language
    );

    // Update template with new content and facts
    template.regenerate(templateData.content, templateData.facts);
    await template.save();

    return successResponse(res, {
      template: template,
      generation_info: {
        facts_used: templateData.facts.length,
        regeneration_count: template.regenerated_count
      }
    }, 'Skabelon regenereret succesfuldt', 200);

  } catch (error) {
    console.error('Regenerate template error:', error);
    return errorResponse(res, error.message || 'Kunne ikke regenerere skabelon', 500);
  }
};

module.exports = {
  generateTemplate,
  getSessionTemplates,
  regenerateTemplate
}; 