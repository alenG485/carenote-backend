const { validationResult } = require('express-validator');
const Session = require('../models/Session');
const User = require('../models/User');
const cortiService = require('../services/cortiService');
const { successResponse, errorResponse } = require('../utils/responses');


/**
 * Session Controller
 * Handles Corti.AI recording sessions, facts management, and WebSocket connections
 */

/**
 * Start a new recording session
 * POST /api/sessions/start
 */
const startSession = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { 
      session_title,
      specialty = 'general',
      encounter_type = 'consultation',
      patient_data = {}
    } = req.body;

    // Auto-generate session title if not provided
    const finalSessionTitle = session_title || `Konsultation - ${new Date().getMilliseconds()}`;

    // Create interaction with Corti API
    const interactionResponse = await cortiService.createInteraction(req.user._id, patient_data);

    const token = await cortiService.getAccessToken();

    // Create session in database
    const session = new Session({
      user_id: req.user._id,
      corti_interaction_id: interactionResponse.interactionId,
      websocket_url: interactionResponse.websocketUrl,
      access_token: token,
      session_title: finalSessionTitle,
      specialty,
      encounter_type,
      status: 'active',
      started_at: new Date()
    });

    const savedSession = await session.save();

    return successResponse(res, {
      session: savedSession
    }, 'Session startet succesfuldt', 201);

  } catch (error) {
    console.error('Start session error:', error);
    return errorResponse(res, error.message || 'Kunne ikke starte session', 500);
  }
};

/**
 * Get session
 * GET /api/sessions/:sessionId
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      deleted: false
    });

    if (!session) {
      return errorResponse(res, 'Aktiv session ikke fundet', 404);
    }

    return successResponse(res, {
      session: session
    }, 'Session hentet succesfuldt');

  } catch (error) {
    console.error('Get WebSocket URL error:', error);
    return errorResponse(res, 'Kunne ikke hente WebSocket URL', 500);
  }
};

/**
 * Get session facts from Corti API
 * GET /api/sessions/:sessionId/facts
 */
const getSessionFacts = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      deleted: false
    });

    if (!session) {
      return errorResponse(res, 'Session ikke fundet', 404);
    }

    // Fetch facts directly from Corti API
    const facts = await cortiService.getFacts(session.corti_interaction_id);

    return successResponse(res, {
      facts: facts,
      session_id: sessionId,
      interaction_id: session.corti_interaction_id
    }, 'Fakta hentet succesfuldt');

  } catch (error) {
    console.error('Get session facts error:', error);
    return errorResponse(res, 'Kunne ikke hente session fakta', 500);
  }
};

/**
 * Add fact to session via Corti API
 * POST /api/sessions/:sessionId/facts
 */
const addFact = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { text, group, source = 'user' } = req.body;

    if (!text || !group) {
      return errorResponse(res, 'Text and group are required', 400);
    }

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      deleted: false
    });

    if (!session) {
      return errorResponse(res, 'Session ikke fundet', 404);
    }

    // Add fact via Corti API
    const result = await cortiService.addFact(session.corti_interaction_id, {
      text,
      group,
      source
    });

    return successResponse(res, {
      fact: result,
      session_id: sessionId
    }, 'Fakta tilføjet succesfuldt');

  } catch (error) {
    console.error('Add fact error:', error);
    return errorResponse(res, 'Kunne ikke tilføje fakta', 500);
  }
};

/**
 * Update fact via Corti API
 * PUT /api/sessions/:sessionId/facts/:factId
 */
const updateFact = async (req, res) => {
  try {
    const { sessionId, factId } = req.params;
    const { text, group, isDiscarded } = req.body;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      deleted: false
    });

    if (!session) {
      return errorResponse(res, 'Session ikke fundet', 404);
    }

    // Update fact via Corti API
    const result = await cortiService.updateFact(session.corti_interaction_id, factId, {
      text,
      group,
      isDiscarded
    });

    return successResponse(res, {
      fact: result,
      session_id: sessionId
    }, 'Fakta opdateret succesfuldt');

  } catch (error) {
    console.error('Update fact error:', error);
    return errorResponse(res, 'Kunne ikke opdatere fakta', 500);
  }
};

/**
 * Start session recording
 * POST /api/sessions/:sessionId/start-recording
 */
const startSessionRecording = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      status: 'active'
    });

    if (!session) {
      return errorResponse(res, 'Aktiv session ikke fundet', 404);
    }

    // Update session status to started
    session.status = 'started';
    await session.save();

    return successResponse(res, {
      session: session
    }, 'Session optagelse startet succesfuldt');

  } catch (error) {
    console.error('Start session recording error:', error);
    return errorResponse(res, 'Kunne ikke starte session optagelse', 500);
  }
};

/**
 * End recording session
 * POST /api/sessions/:sessionId/end
 */
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id
    });

    if (!session) {
      return errorResponse(res, 'Aktiv session ikke fundet', 404);
    }

    // End the session
    session.endSession();
    await session.save();

    return successResponse(res, {
      session: session
    }, 'Session afsluttet succesfuldt');

  } catch (error) {
    console.error('End session error:', error);
    return errorResponse(res, 'Kunne ikke afslutte session', 500);
  }
};

/**
 * Get user's sessions (with pagination for all sessions)
 * GET /api/sessions
 */
const getUserSessions = async (req, res) => {
  try {
    const { limit = 50, page = 1, status, days, user_id } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Handle different user roles
    if (req.user.role === 'super_admin') {
      // Super admin can see all sessions
      if (user_id) {
        query.user_id = user_id;
      }
    } else if (req.user.role === 'company_admin') {
      // Company admin can see sessions from users in their company
      if (user_id) {
        // Verify the user belongs to the company admin's company
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.company_id?.toString() !== req.user.company_id?.toString()) {
          return errorResponse(res, 'Adgang nægtet til denne brugers sessions', 403);
        }
        query.user_id = user_id;
      } else {
        // Get all users in the company
        const companyUsers = await User.find({ company_id: req.user.company_id }).select('_id');
        const userIds = companyUsers.map(user => user._id);
        query.user_id = { $in: userIds };
      }
    } else {
      // Regular user can only see their own sessions
      query.user_id = req.user._id;
    }
    
    // Exclude deleted sessions
    query.deleted = false;
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    // Add date filter if days parameter is provided
    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days));
      query.created_at = { $gte: daysAgo };
    }

    const sessions = await Session.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('corti_interaction_id status session_title started_at ended_at created_at user_id')
      .populate('user_id', 'name email specialty')
      .lean(); // Use lean() for better performance with large datasets

    const total = await Session.countDocuments(query);

    // Add session statistics (without facts since they're fetched from Corti)
    const sessionStats = sessions.map(session => ({
      ...session,
      facts_count: 0, // Will be fetched from Corti when needed
      active_facts_count: 0 // Will be fetched from Corti when needed
    }));

    return successResponse(res, {
      sessions: sessionStats,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_sessions: total,
        limit: parseInt(limit)
      }
    }, 'Sessions hentet succesfuldt');

  } catch (error) {
    console.error('Get user sessions error:', error);
    return errorResponse(res, 'Kunne ikke hente sessions', 500);
  }
};

/**
 * Get company users and their recent sessions (for company admins)
 * GET /api/sessions/company
 */
const getCompanySessions = async (req, res) => {
  try {
    const { limit = 50, days = 7 } = req.query;

    // Only company admins and super admins can access this
    if (req.user.role !== 'company_admin' && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Virksomhedsadministrator adgang påkrævet', 403);
    }

    let companyId = req.user.company_id;
    
    // Super admin can specify company_id
    if (req.user.role === 'super_admin' && req.query.company_id) {
      companyId = req.query.company_id;
    }

    if (!companyId) {
      return errorResponse(res, 'Virksomheds ID påkrævet', 400);
    }

    // Calculate date filter
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));
    daysAgo.setHours(0, 0, 0, 0);

    // Get all users in the company
    const companyUsers = await User.find({ company_id: companyId })
      .select('_id name email specialty role')
      .lean();

    const userIds = companyUsers.map(user => user._id);

    // Get sessions for all company users
    const sessions = await Session.find({
      user_id: { $in: userIds },
      created_at: { $gte: daysAgo },
      deleted: false
    })
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .select('corti_interaction_id status session_title started_at ended_at created_at user_id')
      .populate('user_id', 'name email specialty')
      .lean();

    // Group sessions by user
    const userSessions = {};
    companyUsers.forEach(user => {
      userSessions[user._id] = {
        user: user,
        sessions: [],
        total_sessions: 0,
        total_facts: 0 // Will be calculated from Corti when needed
      };
    });

    // Populate sessions for each user
    sessions.forEach(session => {
      const userId = session.user_id._id;
      if (userSessions[userId]) {
        userSessions[userId].sessions.push(session);
        userSessions[userId].total_sessions++;
        // Facts count will be fetched from Corti when needed
      }
    });

    // Convert to array and sort by total sessions
    const companyData = Object.values(userSessions)
      .sort((a, b) => b.total_sessions - a.total_sessions);

    return successResponse(res, {
      company_users: companyData,
      total_users: companyUsers.length,
      total_sessions: sessions.length,
      date_range: `${days} days`
    }, 'Virksomheds sessions hentet succesfuldt');

  } catch (error) {
    console.error('Get company sessions error:', error);
    return errorResponse(res, 'Kunne ikke hente virksomheds sessions', 500);
  }
};

/**
 * Get recent sessions (last 2 days only)
 * GET /api/sessions/recent
 */
const getRecentSessions = async (req, res) => {
  try {
    const { limit = 100, user_id } = req.query;

    // Calculate date 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0); // Start of day

    let query = { 
      created_at: { $gte: twoDaysAgo },
      deleted: false
    };

    // Handle different user roles
    if (req.user.role === 'super_admin') {
      // Super admin can see all sessions
      if (user_id) {
        query.user_id = user_id;
      }
    } else if (req.user.role === 'company_admin') {
      // Company admin can see sessions from users in their company
      if (user_id) {
        // Verify the user belongs to the company admin's company
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.company_id?.toString() !== req.user.company_id?.toString()) {
          return errorResponse(res, 'Adgang nægtet til denne brugers sessions', 403);
        }
        query.user_id = user_id;
      } else {
        // Get all users in the company
        const companyUsers = await User.find({ company_id: req.user.company_id }).select('_id');
        const userIds = companyUsers.map(user => user._id);
        query.user_id = { $in: userIds };
      }
    } else {
      // Regular user can only see their own sessions
      query.user_id = req.user._id;
    }

    const sessions = await Session.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .select('corti_interaction_id status session_title started_at ended_at created_at user_id')
      .populate('user_id', 'name email specialty')
      .lean(); // Use lean() for better performance

    // Add session statistics (without facts since they're fetched from Corti)
    const sessionStats = sessions.map(session => ({
      ...session,
      facts_count: 0, // Will be fetched from Corti when needed
      active_facts_count: 0 // Will be fetched from Corti when needed
    }));

    return successResponse(res, {
      sessions: sessionStats,
      total_sessions: sessionStats.length
    }, 'Seneste sessions hentet succesfuldt');

  } catch (error) {
    console.error('Get recent sessions error:', error);
    return errorResponse(res, 'Kunne ikke hente seneste sessions', 500);
  }
};

/**
 * Soft delete a session
 * DELETE /api/sessions/:sessionId
 */
const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      deleted: false
    });

    if (!session) {
      return errorResponse(res, 'Session ikke fundet', 404);
    }

    // Soft delete the session
    session.softDelete();
    await session.save();

    return successResponse(res, {
      session_id: sessionId
    }, 'Session slettet succesfuldt');

  } catch (error) {
    console.error('Delete session error:', error);
    return errorResponse(res, 'Kunne ikke slette session', 500);
  }
};

/**
 * Get fact groups from Corti API
 * GET /api/sessions/fact-groups
 */
const getFactGroups = async (req, res) => {
  try {
    const { language = 'en' } = req.query;

    // Get fact groups from Corti API
    const factGroups = await cortiService.getFactGroups();

    // Process fact groups based on language
    const processedGroups = factGroups.map(group => {
      // Find translation for the requested language
      let translatedName = group.name; // Default to original name
      
      if (group.translations && Array.isArray(group.translations)) {
        const translation = group.translations.find(t => t.languages_id === language);
        if (translation) {
          translatedName = translation.name;
        }
      }

      return {
        id: group.id,
        key: group.key,
        name: translatedName,
      };
    });

    return successResponse(res, {
      factGroups: processedGroups,
      language: language
    }, 'Fakta grupper hentet succesfuldt');

  } catch (error) {
    console.error('Get fact groups error:', error);
    return errorResponse(res, 'Kunne ikke hente fakta grupper', 500);
  }
};

module.exports = {
  startSession,
  getSession,
  getSessionFacts,
  addFact,
  updateFact,
  startSessionRecording,
  endSession,
  getUserSessions,
  getRecentSessions,
  getCompanySessions,
  deleteSession,
  getFactGroups
}; 