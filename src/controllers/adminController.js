const User = require('../models/User');
const Company = require('../models/Company');
const Subscription = require('../models/Subscription');
const { successResponse, errorResponse } = require('../utils/responses');
const emailService = require('../services/emailService');

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
      .populate('company_id', 'name')
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
      is_active: user.is_active,
      email_verified: user.email_verified,
      created_at: user.created_at,
      company_name: user.company_id?.name || null,
      specialty: user.specialty,
      workplace: user.workplace,
      subscription: user.subscription_id ? {
        id: user.subscription_id._id,
        plan_name: user.subscription_id.plan_name,
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
    }, 'Users fetched successfully');

  } catch (error) {
    console.error('Get all users error:', error);
    return errorResponse(res, 'Failed to fetch users', 500);
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
      role: 'company_admin' 
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
    }, 'Analytics fetched successfully');

  } catch (error) {
    console.error('Get analytics error:', error);
    return errorResponse(res, 'Failed to fetch analytics', 500);
  }
};

/**
 * Get all companies with pagination
 * GET /api/admin/companies
 */
const getAllCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const companies = await Company.find()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const totalCompanies = await Company.countDocuments();
    const totalPages = Math.ceil(totalCompanies / limit);

    // Get user count for each company
    const companiesWithUserCount = await Promise.all(
      companies.map(async (company) => {
        const userCount = await User.countDocuments({ 
          company_id: company._id,
          role: { $ne: 'super_admin' }
        });
        
        return {
          id: company._id,
          name: company.name,
          email: company.email,
          is_active: company.is_active,
          created_at: company.created_at,
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
    }, 'Companies fetched successfully');

  } catch (error) {
    console.error('Get all companies error:', error);
    return errorResponse(res, 'Failed to fetch companies', 500);
  }
};

/**
 * Send invoice with email
 * POST /api/admin/users/:id/send-invoice
 */
const sendInvoice = async (req, res) => {
  try {
    const { userId } = req.params;
    const { invoice_date, amount, description, invoice_number } = req.body;

    if (!invoice_date || !amount || !invoice_number) {
      return errorResponse(res, 'Invoice date, amount, and invoice number are required', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Don't allow sending invoices to super admin
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Cannot send invoice to super admin', 400);
    }

    const invoiceData = {
      user_id: userId,
      user_email: user.email,
      user_name: user.name,
      invoice_number: invoice_number,
      invoice_date: new Date(invoice_date),
      due_date: new Date(new Date(invoice_date).getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from invoice date
      amount: parseFloat(amount),
      description: description || 'CareNote Subscription',
      status: 'pending',
      created_by: req.user._id,
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

    // Send email with invoice
    try {
      await emailService.sendInvoiceEmail({
        to: user.email,
        subject: `Faktura ${invoice_number} - CareNote`,
        invoiceData: invoiceData,
        invoiceHTML: invoiceHTML
      });

      console.log('Invoice email sent successfully to:', user.email);

      return successResponse(res, {
        invoice: invoiceData,
        message: 'Invoice created and sent successfully via email'
      }, 'Invoice sent successfully');

    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      // Still return success but log the email error
      return successResponse(res, {
        invoice: invoiceData,
        message: 'Invoice created but email sending failed',
        email_error: emailError.message
      }, 'Invoice created but email failed');

    }

  } catch (error) {
    console.error('Send invoice error:', error);
    return errorResponse(res, 'Failed to send invoice', 500);
  }
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
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          background-color: #f8f9fa;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background-color: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .invoice-header { 
          text-align: center; 
          margin-bottom: 40px; 
          border-bottom: 2px solid #e9ecef;
          padding-bottom: 20px;
        }
        .invoice-header h1 {
          color: #2c3e50;
          margin: 0;
          font-size: 28px;
        }
        .invoice-header h2 {
          color: #7f8c8d;
          margin: 10px 0;
          font-size: 18px;
          font-weight: normal;
        }
        .invoice-details { 
          margin-bottom: 30px; 
          display: flex;
          justify-content: space-between;
        }
        .bill-to, .invoice-info {
          flex: 1;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 30px; 
        }
        .invoice-table th, .invoice-table td { 
          border: 1px solid #dee2e6; 
          padding: 15px; 
          text-align: left; 
        }
        .invoice-table th { 
          background-color: #f8f9fa; 
          font-weight: 600;
          color: #495057;
        }
        .total-row { 
          font-weight: bold; 
          background-color: #f8f9fa;
        }
        .banking-details { 
          background-color: #f8f9fa; 
          padding: 25px; 
          border-radius: 8px; 
          margin-top: 30px; 
          border-left: 4px solid #007bff;
        }
        .banking-details h3 {
          margin-top: 0;
          color: #495057;
        }
        .banking-details p {
          margin: 8px 0;
          color: #6c757d;
        }
        .footer { 
          margin-top: 40px; 
          text-align: center; 
          color: #6c757d; 
          font-size: 14px; 
          border-top: 1px solid #dee2e6;
          padding-top: 20px;
        }
        .amount {
          font-size: 18px;
          font-weight: bold;
          color: #28a745;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <h1>CareNote</h1>
          <h2>INVOICE</h2>
          <p><strong>Invoice #:</strong> ${invoiceData.invoice_number}</p>
        </div>
        
        <div class="invoice-details">
          <div class="bill-to">
            <h3>Bill To:</h3>
            <p><strong>${invoiceData.user_name}</strong><br>
            ${invoiceData.user_email}</p>
          </div>
          <div class="invoice-info">
            <p><strong>Invoice Date:</strong> ${new Date(invoiceData.invoice_date).toLocaleDateString('da-DK')}</p>
            <p><strong>Due Date:</strong> ${new Date(invoiceData.due_date).toLocaleDateString('da-DK')}</p>
          </div>
        </div>
        
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${invoiceData.description}</td>
              <td style="text-align: right;" class="amount">${invoiceData.amount.toFixed(2)} DKK</td>
            </tr>
            <tr class="total-row">
              <td><strong>Total</strong></td>
              <td style="text-align: right;" class="amount"><strong>${invoiceData.amount.toFixed(2)} DKK</strong></td>
            </tr>
          </tbody>
        </table>
        
        <div class="banking-details">
          <h3>Banking Details</h3>
          <p><strong>Account Name:</strong> ${invoiceData.banking_details.account_name}</p>
          <p><strong>Bank:</strong> ${invoiceData.banking_details.bank}</p>
          <p><strong>Account Number:</strong> ${invoiceData.banking_details.account_number}</p>
          <p><strong>IBAN:</strong> ${invoiceData.banking_details.iban}</p>
          <p><strong>SWIFT/BIC:</strong> ${invoiceData.banking_details.swift_bic}</p>
          <p><strong>Reference:</strong> ${invoiceData.invoice_number}</p>
        </div>
        
        <div class="footer">
          <p>Thank you for choosing CareNote!</p>
          <p>For questions about this invoice, please contact us at billing@carenote.dk</p>
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
    const { access_date, expiry_date, plan_name, billing_amount, billing_interval, status } = req.body;

    if (!access_date || !expiry_date || !plan_name || !billing_amount || !billing_interval || !status) {
      return errorResponse(res, 'Access date, expiry date, plan name, billing amount, billing interval, and status are required', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Don't allow modifying super admin subscriptions
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Cannot modify super admin subscription', 400);
    }

    const accessDate = new Date(access_date);
    const expiryDate = new Date(expiry_date);
    const currentDate = new Date();

    // Check if user already has a subscription
    let subscription = await Subscription.findOne({ user_id: userId });

    if (subscription) {
      // Update existing subscription
      subscription.plan_name = plan_name;
      subscription.status = status;
      subscription.is_trial = false;
      subscription.current_period_start = accessDate;
      subscription.current_period_end = expiryDate;
      subscription.billing_amount = parseFloat(billing_amount);
      subscription.billing_currency = 'DKK';
      subscription.billing_interval = billing_interval;
      subscription.updated_at = currentDate;
    } else {
      // Create new subscription
      subscription = new Subscription({
        user_id: userId,
        plan_name: plan_name,
        status: status,
        is_trial: false,
        current_period_start: accessDate,
        current_period_end: expiryDate,
        billing_amount: parseFloat(billing_amount),
        billing_currency: 'DKK',
        billing_interval: billing_interval
      });
    }

    await subscription.save();

    // Update user's subscription reference
    user.subscription_id = subscription._id;
    await user.save();

    return successResponse(res, {
      subscription: {
        id: subscription._id,
        plan_name: subscription.plan_name,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        billing_amount: subscription.billing_amount,
        billing_interval: subscription.billing_interval
      },
      message: 'Subscription marked successfully'
    }, 'Subscription updated successfully');

  } catch (error) {
    console.error('Mark subscription error:', error);
    return errorResponse(res, 'Failed to mark subscription', 500);
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
      return errorResponse(res, 'User not found', 404);
    }

    // Don't allow deleting super admin users
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Cannot delete super admin user', 400);
    }

    // Delete user's subscription if exists
    if (user.subscription_id) {
      await Subscription.findByIdAndDelete(user.subscription_id);
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    return successResponse(res, {
      message: 'User deleted successfully'
    }, 'User deleted successfully');

  } catch (error) {
    console.error('Delete user error:', error);
    return errorResponse(res, 'Failed to delete user', 500);
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
      .populate('company_id', 'name')
      .populate('subscription_id')
      .select('-password');

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Don't allow viewing super admin details
    if (user.role === 'super_admin') {
      return errorResponse(res, 'Cannot view super admin details', 403);
    }

    const userData = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      email_verified: user.email_verified,
      created_at: user.created_at,
      company_name: user.company_id?.name || null,
      specialty: user.specialty,
      workplace: user.workplace,
      subscription: user.subscription_id ? {
        id: user.subscription_id._id,
        plan_name: user.subscription_id.plan_name,
        status: user.subscription_id.status,
        is_trial: user.subscription_id.is_trial,
        current_period_start: user.subscription_id.current_period_start,
        current_period_end: user.subscription_id.current_period_end,
        billing_amount: user.subscription_id.billing_amount,
        billing_interval: user.subscription_id.billing_interval
      } : null
    };

    return successResponse(res, userData, 'User details fetched successfully');

  } catch (error) {
    console.error('Get user details error:', error);
    return errorResponse(res, 'Failed to fetch user details', 500);
  }
};

module.exports = {
  getAllUsers,
  getAnalytics,
  getAllCompanies,
  sendInvoice,
  markSubscription,
  getUserDetails,
  deleteUser
}; 