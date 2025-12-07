const { validationResult } = require('express-validator');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const emailService = require('../services/emailService');
const { errorResponse, successResponse } = require('../utils/responses');
const { calculatePrice, getTierLabel, getMaxLicensesForTier } = require('../config/pricing');

/**
 * Get clinic data including users and subscription info
 * Returns all users invited by the main user (company admin)
 */
const getClinicData = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get current user
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Check if user is company admin (main user)
    if (!currentUser.is_company_admin) {
      return errorResponse(res, 'Kun virksomhedsadministratorer kan se klinikdata', 403);
    }

    // Fetch subscription directly to ensure we get the latest data (not cached from populate)
    const subscription = await Subscription.findById(currentUser.subscription_id);
    if (!subscription) {
      return errorResponse(res, 'Intet abonnement fundet', 404);
    }

    // Get all users invited by this main user (including the main user)
    const invitedUsers = await User.find({ 
      $or: [
        { invited_by: currentUser._id },
        { _id: currentUser._id }
      ]
    })
      .select('email name specialty phone created_at is_active is_company_admin workplace email_verified invitation_token')
      .sort({ created_at: -1 });

    // Calculate stats
    const stats = {
      total_users: invitedUsers.length,
      active_users: invitedUsers.filter(u => u.is_active).length,
      admins: invitedUsers.filter(u => u.is_company_admin).length
    };

    const clinicData = {
      company: {
        name: currentUser.workplace || 'Klinik',
        current_user_count: invitedUsers.length,
        created_at: currentUser.created_at
      },
      subscription: {
        numLicenses: subscription.numLicenses,
        pricePerLicense: subscription.pricePerLicense,
        pricing_tier: subscription.pricing_tier,
        billing_amount: subscription.billing_amount,
        billing_interval: subscription.billing_interval,
        available_licenses: subscription.numLicenses - invitedUsers.length
      },
      users: invitedUsers.map(user => ({
        id: user._id,
        email: user.email,
        name: user.name,
        specialty: user.specialty,
        phone: user.phone,
        created_at: user.created_at,
        is_active: user.is_active,
        is_company_admin: user.is_company_admin,
        workplace: user.workplace,
        email_verified: user.email_verified,
        has_pending_invitation: !!user.invitation_token
      })),
      stats
    };

    return successResponse(res, clinicData, 'Klinik data hentet succesfuldt');
  } catch (error) {
    console.error('Error getting clinic data:', error);
    return errorResponse(res, 'Kunne ikke hente klinik data', 500);
  }
};

/**
 * Invite user to clinic
 * Only main user (is_company_admin: true) can invite, or users with can_invite permission
 */
const inviteUser = async (req, res) => {
  try {
    // Check validation errors from middleware
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validering fejlede', 400, errors.array());
    }

    const { email, name, specialty, phone } = req.body;
    const invitedBy = req.user.id;

    // Email is already normalized by validation middleware (.normalizeEmail())

    // Get current user and subscription
    const currentUser = await User.findById(invitedBy).populate('subscription_id');
    if (!currentUser) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Check if user can invite (must be company admin or have can_invite permission)
    if (!currentUser.is_company_admin && !currentUser.can_invite) {
      return errorResponse(res, 'Du har ikke tilladelse til at invitere brugere', 403);
    }

    const subscription = currentUser.subscription_id;
    if (!subscription) {
      return errorResponse(res, 'Intet abonnement fundet', 404);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'Bruger findes allerede', 400);
    }

    // Check license availability and auto-upgrade if needed
    // Count all users invited by this main user (including main user)
    const userCount = await User.countDocuments({ 
      $or: [
        { invited_by: currentUser._id },
        { _id: currentUser._id }
      ]
    });
    const newTotal = userCount + 1; // +1 for the new invite

    let subscriptionUpgraded = false;
    let upgradeInfo = null;

    // Auto-upgrade subscription if needed
    if (newTotal > subscription.numLicenses) {
      // Calculate what tier they'd need
      const newPricing = calculatePrice(newTotal, subscription.billing_interval);
      
      if (!newPricing) {
        return errorResponse(res, 'Kunne ikke beregne priser for det ønskede antal licenser', 500);
      }

      // Store previous values BEFORE updating
      const previousLicenses = subscription.numLicenses;
      const previousPrice = subscription.billing_amount;
      const previousTier = subscription.pricing_tier;

      // Determine the tier and max licenses for that tier
      const tierLabel = getTierLabel(newPricing.tier.minLicenses);
      const maxLicensesForTier = getMaxLicensesForTier(newPricing.tier.minLicenses, newTotal);

      // Auto-upgrade the subscription
      // numLicenses represents the maximum capacity of the tier, not the actual user count
      subscription.numLicenses = maxLicensesForTier;
      subscription.pricePerLicense = newPricing.pricePerLicense;
      subscription.pricing_tier = tierLabel;
      // Calculate billing amount based on actual number of users, not tier max
      subscription.billing_amount = newPricing.totalPrice;
      await subscription.save();

      subscriptionUpgraded = true;
      upgradeInfo = {
        previousLicenses: previousLicenses,
        newLicenses: maxLicensesForTier, // Show tier max capacity
        actualUsers: newTotal, // Actual number of users
        previousTier: previousTier,
        newTier: tierLabel,
        previousPrice: previousPrice,
        newPrice: newPricing.totalPrice,
        priceDifference: newPricing.totalPrice - previousPrice
      };
    }

    // Create invitation token
    const invitationToken = require('crypto').randomBytes(32).toString('hex');
    
    // Create the user with a temporary password
    const tempPassword = require('crypto').randomBytes(8).toString('hex');
    
    const newUser = new User({
      email,
      name,
      specialty,
      phone,
      password: tempPassword, // User will need to reset this
      workplace: currentUser.workplace, // Same workplace as main user
      is_company_admin: false, // Invited users are always regular users
      can_invite: false, // Invited users can't invite by default
      is_active: false, // User needs to verify email first
      email_verified: false,
      invitation_token: invitationToken,
      invited_by: invitedBy // Link to main user
    });

    await newUser.save();

    // Send invitation email
    try {
      await emailService.sendInvitationEmail({
        email,
        name,
        companyName: currentUser.workplace || 'Klinik',
        invitationToken,
        invitedBy: currentUser.name || currentUser.email
      });
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError);
      // Delete the user if email fails
      await User.findByIdAndDelete(newUser._id);
      return errorResponse(res, 'Kunne ikke sende invitations e-mail', 500);
    }

    // Return response with upgrade info if subscription was upgraded
    const responseData = { 
      message: 'Invitation sendt succesfuldt',
      subscriptionUpgraded: subscriptionUpgraded
    };
    
    if (subscriptionUpgraded && upgradeInfo) {
      responseData.upgradeInfo = upgradeInfo;
    }

    return successResponse(res, responseData, 'Bruger inviteret succesfuldt');
  } catch (error) {
    console.error('Error inviting user:', error);
    return errorResponse(res, 'Kunne ikke invitere bruger', 500);
  }
};

/**
 * Update user status (activate/deactivate/remove)
 * Only main user (is_company_admin) can manage users
 */
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body;
    const currentUserId = req.user.id;

    // Validate action
    if (!['activate', 'deactivate', 'remove'].includes(action)) {
      return errorResponse(res, 'Ugyldig handling', 400);
    }

    // Get current user (must be company admin)
    const currentUser = await User.findById(currentUserId);
    if (!currentUser || !currentUser.is_company_admin) {
      return errorResponse(res, 'Kun virksomhedsadministratorer kan administrere brugere', 403);
    }

    // Get target user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Check if target user was invited by current user (or is current user)
    if (targetUser.invited_by && targetUser.invited_by.toString() !== currentUserId && targetUser._id.toString() !== currentUserId) {
      return errorResponse(res, 'Kan ikke ændre bruger fra anden virksomhed', 403);
    }

    // Prevent self-modification for remove action
    if (action === 'remove' && targetUser._id.toString() === currentUserId) {
      return errorResponse(res, 'Kan ikke fjerne dig selv', 400);
    }

    if (action === 'remove') {
      // Check if user has pending invitation (has invitation_token and not active)
      const hasPendingInvitation = targetUser.invitation_token && !targetUser.is_active && !targetUser.email_verified;
      
      if (hasPendingInvitation) {
        // For pending invitations, delete the user completely (they haven't accepted yet)
        await User.findByIdAndDelete(userId);
        return successResponse(res, { message: 'Invitation annulleret succesfuldt' }, 'Invitation annulleret succesfuldt');
      } else {
        // For active users, just remove them from company (keep user record in case they have data)
        const updateData = {
          invited_by: null,
          workplace: null,
          is_company_admin: false,
          can_invite: false
        };
        await User.findByIdAndUpdate(userId, updateData);
        return successResponse(res, { message: 'Bruger fjernet fra klinikken succesfuldt' }, 'Bruger fjernet succesfuldt');
      }
    } else {
      // Activate or deactivate
      const updateData = {
        is_active: action === 'activate'
      };
      await User.findByIdAndUpdate(userId, updateData);
      const actionText = action === 'activate' ? 'aktiveret' : 'deaktiveret';
      return successResponse(res, { message: `Bruger ${actionText} succesfuldt` }, `Bruger ${actionText} succesfuldt`);
    }
  } catch (error) {
    console.error('Error updating user status:', error);
    return errorResponse(res, 'Kunne ikke opdatere bruger status', 500);
  }
};

/**
 * Resend invitation email to a user with pending invitation
 * POST /api/clinic/users/:userId/resend-invitation
 */
const resendInvitation = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Get current user (must be company admin)
    const currentUser = await User.findById(currentUserId);
    if (!currentUser || !currentUser.is_company_admin) {
      return errorResponse(res, 'Kun virksomhedsadministratorer kan gensende invitationer', 403);
    }

    // Get target user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Check if target user was invited by current user
    if (!targetUser.invited_by || targetUser.invited_by.toString() !== currentUserId) {
      return errorResponse(res, 'Kan ikke gensende invitation for bruger fra anden virksomhed', 403);
    }

    // Check if user has a pending invitation
    if (!targetUser.invitation_token) {
      return errorResponse(res, 'Bruger har ingen pending invitation', 400);
    }

    // Check if invitation is expired (older than 7 days)
    const invitationAge = Date.now() - targetUser.created_at.getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (invitationAge > maxAge) {
      // Generate new invitation token if expired
      targetUser.invitation_token = require('crypto').randomBytes(32).toString('hex');
      targetUser.created_at = new Date(); // Reset creation date
      await targetUser.save();
    }

    // Send invitation email
    try {
      await emailService.sendInvitationEmail({
        email: targetUser.email,
        name: targetUser.name,
        companyName: currentUser.workplace || 'Klinik',
        invitationToken: targetUser.invitation_token,
        invitedBy: currentUser.name || currentUser.email
      });
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError);
      return errorResponse(res, 'Kunne ikke sende invitations e-mail', 500);
    }

    return successResponse(res, { message: 'Invitation gensendt succesfuldt' }, 'Invitation gensendt succesfuldt');
  } catch (error) {
    console.error('Error resending invitation:', error);
    return errorResponse(res, 'Kunne ikke gensende invitation', 500);
  }
};

module.exports = {
  getClinicData,
  inviteUser,
  updateUserStatus,
  resendInvitation
};
