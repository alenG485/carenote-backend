const User = require('../models/User');
const Company = require('../models/Company');
const emailService = require('../services/emailService');
const { errorResponse, successResponse } = require('../utils/responses');

/**
 * Get clinic data including company info and users
 */
const getClinicData = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user with company info
    const user = await User.findById(userId).populate('company_id');
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.company_id) {
      return errorResponse(res, 'User not associated with any company', 404);
    }

    const company = user.company_id;

    // Get all users in the company
    const users = await User.find({ company_id: company._id })
      .select('email name specialty phone created_at is_active is_company_admin user_metadata')
      .sort({ created_at: -1 });

    // Calculate stats
    const stats = {
      total_users: users.length,
      active_users: users.filter(u => u.is_active).length,
      admins: users.filter(u => u.is_company_admin).length
    };

    const clinicData = {
      company: {
        id: company._id,
        name: company.name,
        max_users: company.max_users || 10,
        current_user_count: users.length,
        created_at: company.created_at
      },
      users: users.map(user => ({
        id: user._id,
        email: user.email,
        name: user.name,
        specialty: user.specialty,
        phone: user.phone,
        created_at: user.created_at,
        is_active: user.is_active,
        is_company_admin: user.is_company_admin,
        user_metadata: {
          specialty: user.specialty,
          phone: user.phone
        }
      })),
      stats
    };

    return successResponse(res, clinicData, 'Clinic data retrieved successfully');
  } catch (error) {
    console.error('Error getting clinic data:', error);
    return errorResponse(res, 'Failed to get clinic data', 500);
  }
};

/**
 * Invite user to clinic
 */
const inviteUser = async (req, res) => {
  try {
    const { email, name, specialty, phone, role } = req.body;
    const invitedBy = req.user.id;

    // Validate required fields
    if (!email || !name) {
      return errorResponse(res, 'Email and name are required', 400);
    }

    // Get current user's company
    const currentUser = await User.findById(invitedBy).populate('company_id');
    if (!currentUser || !currentUser.company_id) {
      return errorResponse(res, 'User not associated with any company', 404);
    }

    const company = currentUser.company_id;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'User already exists', 400);
    }

    // Check if company has reached max users
    const userCount = await User.countDocuments({ company_id: company._id });
    if (userCount >= company.max_users) {
      return errorResponse(res, `Company has reached maximum number of users (${company.max_users})`, 400);
    }

    // Create invitation token
    const invitationToken = require('crypto').randomBytes(32).toString('hex');
    
    // Store invitation in database (you might want to create an Invitation model)
    // For now, we'll create the user with a temporary password
    const tempPassword = require('crypto').randomBytes(8).toString('hex');
    
    const newUser = new User({
      email,
      name,
      specialty,
      phone,
      password: tempPassword, // User will need to reset this
      company_id: company._id,
      is_company_admin: false, // Invited users are always regular users
      is_active: false, // User needs to verify email first
      email_verified: false,
      invitation_token: invitationToken,
      invited_by: invitedBy
    });

    await newUser.save();

    // Send invitation email
    try {
      await emailService.sendInvitationEmail({
        email,
        name,
        companyName: company.name,
        invitationToken,
        invitedBy: currentUser.name || currentUser.email
      });
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError);
      // Delete the user if email fails
      await User.findByIdAndDelete(newUser._id);
      return errorResponse(res, 'Failed to send invitation email', 500);
    }

    return successResponse(res, { message: 'Invitation sent successfully' }, 'User invited successfully');
  } catch (error) {
    console.error('Error inviting user:', error);
    return errorResponse(res, 'Failed to invite user', 500);
  }
};

/**
 * Update user status (activate/deactivate/remove)
 */
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body;
    const currentUserId = req.user.id;

    // Validate action
    if (!['activate', 'deactivate', 'remove'].includes(action)) {
      return errorResponse(res, 'Invalid action', 400);
    }

    // Get current user's company
    const currentUser = await User.findById(currentUserId).populate('company_id');
    if (!currentUser || !currentUser.company_id) {
      return errorResponse(res, 'User not associated with any company', 404);
    }

    // Get target user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check if target user is in the same company
    if (targetUser.company_id.toString() !== currentUser.company_id._id.toString()) {
      return errorResponse(res, 'Cannot modify user from different company', 403);
    }

    // Prevent self-modification
    if (targetUser._id.toString() === currentUserId) {
      return errorResponse(res, 'Cannot modify your own status', 400);
    }

    let updateData = {};

    if (action === 'remove') {
      updateData = {
        company_id: null,
        is_company_admin: false
      };
    } else {
      updateData = {
        is_active: action === 'activate'
      };
    }

    await User.findByIdAndUpdate(userId, updateData);

    const actionText = action === 'activate' ? 'activated' : action === 'deactivate' ? 'deactivated' : 'removed';
    return successResponse(res, { message: `User ${actionText} successfully` }, `User ${actionText} successfully`);
  } catch (error) {
    console.error('Error updating user status:', error);
    return errorResponse(res, 'Failed to update user status', 500);
  }
};

module.exports = {
  getClinicData,
  inviteUser,
  updateUserStatus
}; 