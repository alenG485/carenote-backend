const { validationResult } = require('express-validator');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Lead Controller
 * Handles capture of marketing opt-in emails prior to full registration
 */

/**
 * @route   POST /api/leads
 * @desc    Create or update a lead capture entry
 * @access  Public
 */
const createLead = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validering fejlede', 400, errors.array());
    }

    const { email, marketingOptIn = false } = req.body;

    // Check if user already exists - don't create lead if user exists
    // Email is already normalized (lowercased) by validation middleware
    const existingUser = await User.findOne({ email }).select('_id email');
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Denne e-mail er allerede registreret. Log venligst ind i stedet.',
        data: { alreadyRegistered: true }
      });
    }

    // check if lead already exists
    const existingLead = await Lead.findOne({ email });
    if (existingLead) {
      return successResponse(res, { email: existingLead.email, marketing_opt_in: existingLead.marketing_opt_in }, 'Lead er allerede registreret', 200);
    }

    const lead = new Lead({
      email,
      marketing_opt_in: marketingOptIn,
    });

    await lead.save();

    return successResponse(res, { email: lead.email, marketing_opt_in: lead.marketing_opt_in }, 'Lead blev registreret succesfuldt', 201);
  } catch (error) {
    console.error('Lead capture error:', error);
    return errorResponse(res, 'Kunne ikke registrere lead', 500);
  }
};

module.exports = {
  createLead
};

