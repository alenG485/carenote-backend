const { validationResult } = require('express-validator');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Lead = require('../models/Lead');
const { successResponse, errorResponse } = require('../utils/responses');
const emailService = require('../services/emailService');
const { calculatePrice, getTierLabel } = require('../config/pricing');

/**
 * Admin Controller
 * Handles super admin operations for user management and analytics
 */

/**
 * Get all users with pagination (excluding super admin)
 * GET /api/admin/users
 */
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Exclude super admin users
    const users = await User.find({ role: { $ne: 'super_admin' } })
      .populate('subscription_id')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .select('-password');

    const totalUsers = await User.countDocuments({ role: { $ne: 'super_admin' } });
    const totalPages = Math.ceil(totalUsers / limit);

    const formattedUsers = users.map(user => ({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_company_admin: user.is_company_admin || false,
      is_active: user.is_active,
      email_verified: user.email_verified,
      created_at: user.created_at,
      company_name: user.is_company_admin ? user.workplace : null,
      specialty: user.specialty,
      workplace: user.workplace,
      phone: user.phone || null,
      subscription: user.subscription_id ? {
        id: user.subscription_id._id,
        numLicenses: user.subscription_id.numLicenses,
        pricePerLicense: user.subscription_id.pricePerLicense,
        pricing_tier: user.subscription_id.pricing_tier,
        status: user.subscription_id.status,
        is_trial: user.subscription_id.is_trial,
        current_period_start: user.subscription_id.current_period_start,
        current_period_end: user.subscription_id.current_period_end,
        billing_amount: user.subscription_id.billing_amount,
        billing_interval: user.subscription_id.billing_interval
      } : null
    }));

    return successResponse(res, {
      users: formattedUsers,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_users: totalUsers,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    }, 'Brugere hentet succesfuldt');

  } catch (error) {
    console.error('Get all users error:', error);
    return errorResponse(res, 'Kunne ikke hente brugere', 500);
  }
};

/**
 * Get dashboard analytics and statistics (excluding super admin)
 * GET /api/admin/analytics
 */
const getAnalytics = async (req, res) => {
  try {
    // Get user statistics (excluding super admin)
    const totalUsers = await User.countDocuments({ role: { $ne: 'super_admin' } });
    const activeUsers = await User.countDocuments({ 
      role: { $ne: 'super_admin' },
      is_active: true 
    });
    const companyAdminUsers = await User.countDocuments({ 
      is_company_admin: true,
      role: { $ne: 'super_admin' }
    });
    






    // Get recent activity (last 7 days registrations, excluding super admin)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentRegistrations = await User.countDocuments({
      role: { $ne: 'super_admin' },
      created_at: { $gte: sevenDaysAgo }
    });

    return successResponse(res, {
      users: {
        total: totalUsers,
        active: activeUsers,
        company_admins: companyAdminUsers,
        normal_users: totalUsers - companyAdminUsers
      },
      recent_activity: {
        new_registrations_7_days: recentRegistrations
      }
    }, 'Analytics hentet succesfuldt');

  } catch (error) {
    console.error('Get analytics error:', error);
    return errorResponse(res, 'Kunne ikke hente analytics', 500);
  }
};

/**
 * Get all companies (clinic main users) with pagination
 * GET /api/admin/companies
 */
const getAllCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get all company admins (main users)
    const companyAdmins = await User.find({ 
      is_company_admin: true,
      role: { $ne: 'super_admin' }
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .select('email name workplace created_at is_active');

    const totalCompanies = await User.countDocuments({ 
      is_company_admin: true,
      role: { $ne: 'super_admin' }
    });
    const totalPages = Math.ceil(totalCompanies / limit);

    // Get user count for each company (count invited users)
    const companiesWithUserCount = await Promise.all(
      companyAdmins.map(async (admin) => {
        const userCount = await User.countDocuments({ 
          $or: [
            { invited_by: admin._id },
            { _id: admin._id }
          ]
        });
        
        return {
          id: admin._id,
          name: admin.workplace || 'Klinik',
          email: admin.email,
          admin_name: admin.name,
          is_active: admin.is_active,
          created_at: admin.created_at,
          user_count: userCount
        };
      })
    );

    return successResponse(res, {
      companies: companiesWithUserCount,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_companies: totalCompanies,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    }, 'Virksomheder hentet succesfuldt');

  } catch (error) {
    console.error('Get all companies error:', error);
    return errorResponse(res, 'Kunne ikke hente virksomheder', 500);
  }
};

/**
 * Send invoice with email and PDF attachment
 * POST /api/admin/users/:id/send-invoice
 */
const sendInvoice = async (req, res) => {
  try {
    const { userId } = req.params;
    const { invoice_date, amount, description, invoice_number } = req.body;

    if (!invoice_date || !amount || !invoice_number) {
      return errorResponse(res, 'Fakturadato, beløb og fakturanummer er påkrævet', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Don't allow sending invoices to super admin
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Kan ikke sende faktura til super administrator', 400);
    }

    const invoiceData = {
      user_id: userId,
      user_email: user.email,
      user_name: user.name,
      invoice_number: invoice_number,
      invoice_date: new Date(invoice_date),
      amount: parseFloat(amount),
      description: description || 'CareNote Subscription',
      created_by: req.user._id,
      status: 'pending',
      
      banking_details: {
        account_name: 'CareNote ApS',
        bank: 'Danske Bank',
        account_number: '1234 5678 9012 3456',
        iban: 'DK1234567890123456',
        swift_bic: 'DABADKKK'
      }
    };

    // Generate invoice HTML
    const invoiceHTML = generateInvoiceHTML(invoiceData);

    // Send email with invoice and PDF attachment
    try {
      const emailResult = await emailService.sendInvoiceEmail({
        to: user.email,
        subject: `Faktura ${invoice_number} - CareNote`,
        invoiceData: invoiceData,
        invoiceHTML: invoiceHTML
      });

      console.log('Invoice email sent successfully to:', user.email, {
        hasPdfAttachment: emailResult.hasPdfAttachment
      });

      return successResponse(res, {
        invoice: invoiceData,
        email_result: {
          messageId: emailResult.messageId,
          hasPdfAttachment: emailResult.hasPdfAttachment
        },
        message: emailResult.hasPdfAttachment 
          ? 'Faktura oprettet og sendt succesfuldt via e-mail med PDF vedhæftning'
          : 'Faktura oprettet og sendt succesfuldt via e-mail (PDF generering fejlede)'
      }, 'Faktura sendt succesfuldt');

    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      // Still return success but log the email error
      return successResponse(res, {
        invoice: invoiceData,
        message: 'Faktura oprettet, men e-mail sending fejlede',
        email_error: emailError.message
      }, 'Faktura oprettet, men e-mail fejlede');

    }

  } catch (error) {
    console.error('Send invoice error:', error);
    return errorResponse(res, 'Failed to send invoice', 500);
  }
};

// Brand colors matching the application theme
const BRAND_COLORS = {
  primary: '#00A19D',
  primaryLight: '#7FD1AE',
  primaryDark: '#005F5E',
  secondary: '#E8F9F8',
  accent: '#B4E7E4'
};

// Generate invoice HTML
const generateInvoiceHTML = (invoiceData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoiceData.invoice_number}</title>
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          .invoice-container { box-shadow: none; }
        }
        
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 10px; 
          background-color: ${BRAND_COLORS.secondary} !important;
          line-height: 1.4;
          font-size: 12px;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background-color: white !important;
          padding: 25px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .invoice-header { 
          text-align: center; 
          margin-bottom: 25px; 
          border-bottom: 2px solid ${BRAND_COLORS.primary} !important;
          padding-bottom: 15px;
        }
        .invoice-header h1 {
          color: ${BRAND_COLORS.primary} !important;
          margin: 0;
          font-size: 24px;
          font-weight: bold;
        }
        .invoice-header h2 {
          color: ${BRAND_COLORS.primaryDark} !important;
          margin: 8px 0;
          font-size: 16px;
          font-weight: normal;
        }
        .invoice-details { 
          margin-bottom: 20px; 
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .bill-to, .invoice-info {
          flex: 1;
          min-width: 250px;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
          font-size: 11px;
        }
        .invoice-table th, .invoice-table td { 
          border: 1px solid #dee2e6; 
          padding: 10px; 
          text-align: left; 
        }
        .invoice-table th { 
          background-color: ${BRAND_COLORS.secondary} !important; 
          font-weight: 600;
          color: ${BRAND_COLORS.primaryDark} !important;
        }
        .total-row { 
          font-weight: bold; 
          background-color: ${BRAND_COLORS.secondary} !important;
        }
        .banking-details { 
          background-color: ${BRAND_COLORS.secondary} !important; 
          padding: 15px; 
          border-radius: 8px; 
          margin-top: 20px; 
          border-left: 4px solid ${BRAND_COLORS.primary} !important;
          font-size: 11px;
        }
        .banking-details h3 {
          margin-top: 0;
          margin-bottom: 10px;
          color: ${BRAND_COLORS.primaryDark} !important;
          font-size: 14px;
        }
        .banking-details p {
          margin: 5px 0;
          color: ${BRAND_COLORS.primaryDark} !important;
        }
        .footer { 
          margin-top: 20px; 
          text-align: center; 
          color: ${BRAND_COLORS.primaryDark} !important; 
          font-size: 11px; 
          border-top: 1px solid #dee2e6;
          padding-top: 15px;
        }
        .amount {
          font-size: 14px;
          font-weight: bold;
          color: ${BRAND_COLORS.primary} !important;
        }
        .invoice-number {
          font-size: 14px;
          font-weight: bold;
          color: ${BRAND_COLORS.primaryDark} !important;
        }
        .company-info {
          margin-bottom: 15px;
          text-align: center;
        }
        .company-info p {
          margin: 3px 0;
          color: ${BRAND_COLORS.primaryDark} !important;
          font-size: 11px;
        }
        h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <h1>CareNote</h1>
          <h2>FAKTURA</h2>
          <div class="company-info">
            <p>CareNote ApS</p>
            <p>Healthcare Documentation Platform</p>
            <p>Email: kontakt@carenote.dk</p>
          </div>
          <p class="invoice-number">Faktura #: ${invoiceData.invoice_number}</p>
        </div>
        
        <div class="invoice-details">
          <div class="bill-to">
            <h3>Faktureres til:</h3>
            <p><strong>${invoiceData.user_name}</strong><br>
            ${invoiceData.user_email}</p>
          </div>
          <div class="invoice-info">
            <p><strong>Fakturadato:</strong> ${new Date(invoiceData.invoice_date).toLocaleDateString('da-DK')}</p>
            <p><strong>Forfaldsdato:</strong> ${new Date(new Date(invoiceData.invoice_date).getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('da-DK')}</p>
          </div>
        </div>
        
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Beskrivelse</th>
              <th style="text-align: right;">Beløb</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${invoiceData.description}</td>
              <td style="text-align: right;" class="amount">${invoiceData.amount.toFixed(2)} DKK</td>
            </tr>
            <tr class="total-row">
              <td><strong>I alt</strong></td>
              <td style="text-align: right;" class="amount"><strong>${invoiceData.amount.toFixed(2)} DKK</strong></td>
            </tr>
          </tbody>
        </table>
        
        <div class="banking-details">
          <h3>Betalingsoplysninger</h3>
          <p><strong>Kontonavn:</strong> ${invoiceData.banking_details.account_name}</p>
          <p><strong>Bank:</strong> ${invoiceData.banking_details.bank}</p>
          <p><strong>Kontonummer:</strong> ${invoiceData.banking_details.account_number}</p>
          <p><strong>IBAN:</strong> ${invoiceData.banking_details.iban}</p>
          <p><strong>SWIFT/BIC:</strong> ${invoiceData.banking_details.swift_bic}</p>
          <p><strong>Reference:</strong> ${invoiceData.invoice_number}</p>
        </div>
        
        <div class="footer">
          <p>Tak fordi du valgte CareNote!</p>
          <p>For spørgsmål om denne faktura, kontakt os venligst på kontakt@carenote.dk</p>
          <p><small>Denne faktura er genereret automatisk. Inkluder venligst fakturanummeret som reference ved betaling.</small></p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Mark subscription access for a user
 * POST /api/admin/users/:id/mark-subscription
 */
const markSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { access_date, expiry_date, numLicenses, billing_amount, billing_interval, status } = req.body;

    if (!access_date || !expiry_date || !numLicenses || !billing_amount || !billing_interval || !status) {
      return errorResponse(res, 'Adgangsdato, udløbsdato, antal licenser, faktureringsbeløb, faktureringsinterval og status er påkrævet', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Don't allow modifying super admin subscriptions
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Kan ikke ændre super administrator abonnement', 400);
    }

    const accessDate = new Date(access_date);
    const expiryDate = new Date(expiry_date);
    const currentDate = new Date();

    // Check if user already has a subscription
    let subscription = await Subscription.findOne({ user_id: userId });

    if (subscription) {
      // Calculate pricing based on licenses
      const licenseCount = parseInt(numLicenses);
      const billingInterval = billing_interval || 'monthly';
      const pricing = calculatePrice(licenseCount, billingInterval);
      
      if (!pricing) {
        return errorResponse(res, 'Ugyldigt antal licenser', 400);
      }

      // Determine tier max capacity
      const tierLabel = getTierLabel(pricing.tier.minLicenses);
      const { getMaxLicensesForTier } = require('../config/pricing');
      const maxLicensesForTier = getMaxLicensesForTier(pricing.tier.minLicenses, licenseCount);

      // Update existing subscription
      subscription.numLicenses = maxLicensesForTier; // Store tier max capacity
      subscription.pricePerLicense = pricing.pricePerLicense;
      subscription.pricing_tier = tierLabel;
      subscription.status = status;
      subscription.is_trial = false;
      subscription.current_period_start = accessDate;
      subscription.current_period_end = expiryDate;
      // Use calculated billing amount (respects tier minimum), but allow admin override if needed
      subscription.billing_amount = parseFloat(billing_amount) || pricing.totalPrice;
      subscription.billing_currency = 'DKK';
      subscription.billing_interval = billingInterval;
      subscription.updated_at = currentDate;
    } else{
      return errorResponse(res, 'User does not have a subscription', 400);
    }

    await subscription.save();

    // Note: No need to update company max_users anymore
    // License count is managed via subscription.numLicenses

    // Update user's subscription reference
    user.subscription_id = subscription._id;
    await user.save();

    return successResponse(res, {
      subscription: {
        id: subscription._id,
        numLicenses: subscription.numLicenses,
        pricePerLicense: subscription.pricePerLicense,
        pricing_tier: subscription.pricing_tier,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        billing_amount: subscription.billing_amount,
        billing_interval: subscription.billing_interval
      },
      message: 'Abonnement markeret succesfuldt'
    }, 'Abonnement opdateret succesfuldt');

  } catch (error) {
    console.error('Mark subscription error:', error);
      return errorResponse(res, 'Kunne ikke markere abonnement', 500);
  }
};

/**
 * Delete a user
 * DELETE /api/admin/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Don't allow deleting super admin users
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Kan ikke slette super administrator bruger', 400);
    }

    // Delete user's subscription if exists
    if (user.subscription_id) {
      await Subscription.findByIdAndDelete(user.subscription_id);
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    return successResponse(res, {
      message: 'Bruger slettet succesfuldt'
    }, 'Bruger slettet succesfuldt');

  } catch (error) {
    console.error('Delete user error:', error);
    return errorResponse(res, 'Kunne ikke slette bruger', 500);
  }
};

/**
 * Get user details
 * GET /api/admin/users/:id
 */
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate('subscription_id')
      .select('-password');

    if (!user) {
      return errorResponse(res, 'Bruger ikke fundet', 404);
    }

    // Don't allow viewing super admin details
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Kan ikke se super administrator detaljer', 403);
    }

    const userData = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      email_verified: user.email_verified,
      created_at: user.created_at,
      company_name: user.is_company_admin ? user.workplace : null,
      specialty: user.specialty,
      workplace: user.workplace,
      phone: user.phone || null,
      subscription: user.subscription_id ? {
        id: user.subscription_id._id,
        numLicenses: user.subscription_id.numLicenses,
        pricePerLicense: user.subscription_id.pricePerLicense,
        pricing_tier: user.subscription_id.pricing_tier,
        status: user.subscription_id.status,
        is_trial: user.subscription_id.is_trial,
        current_period_start: user.subscription_id.current_period_start,
        current_period_end: user.subscription_id.current_period_end,
        billing_amount: user.subscription_id.billing_amount,
        billing_interval: user.subscription_id.billing_interval
      } : null
    };

    return successResponse(res, userData, 'Bruger detaljer hentet succesfuldt');

  } catch (error) {
    console.error('Get user details error:', error);
    return errorResponse(res, 'Kunne ikke hente bruger detaljer', 500);
  }
};

/**
 * Get all leads with pagination
 * GET /api/admin/leads
 */
const getAllLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get leads with pagination
    const leads = await Lead.find()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalLeads = await Lead.countDocuments();
    const totalPages = Math.ceil(totalLeads / limit);

    // Check which leads have become users
    const leadEmails = leads.map(lead => lead.email);
    const users = await User.find({ email: { $in: leadEmails } })
      .select('email name role created_at')
      .lean();

    // Create a map of email to user for quick lookup
    const userMap = {};
    users.forEach(user => {
      userMap[user.email] = {
        id: user._id,
        name: user.name,
        role: user.role,
        created_at: user.created_at,
        is_registered: true
      };
    });

    // Format leads with user registration status
    const formattedLeads = leads.map(lead => ({
      id: lead._id,
      email: lead.email,
      marketing_opt_in: lead.marketing_opt_in,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      user: userMap[lead.email] || { is_registered: false }
    }));

    return successResponse(res, {
      leads: formattedLeads,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_leads: totalLeads,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      stats: {
        total_leads: totalLeads,
        registered_users: users.length,
        unregistered_leads: totalLeads - users.length,
        marketing_opt_in: await Lead.countDocuments({ marketing_opt_in: true })
      }
    }, 'Leads hentet succesfuldt');

  } catch (error) {
    console.error('Get all leads error:', error);
    return errorResponse(res, 'Kunne ikke hente leads', 500);
  }
};

module.exports = {
  getAllUsers,
  getAnalytics,
  getAllCompanies,
  sendInvoice,
  markSubscription,
  getUserDetails,
  deleteUser,
  getAllLeads
}; 