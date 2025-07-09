# CareNote Backend API

A robust Node.js backend for the CareNote healthcare application with MongoDB, JWT authentication, Stripe integration, and Corti.AI API integration.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with 3-level role system
- **Subscription Management**: Stripe integration for subscription handling
- **Corti.AI Integration**: Real-time audio processing and clinical note generation
- **Role-Based Access Control**: Normal users, company admins, and super admins
- **Template Management**: Clinical document templates with version control
- **Session Management**: Recording sessions with facts extraction
- **Error Handling**: Comprehensive error handling and logging
- **Validation**: Request validation with express-validator
- **Security**: Helmet, CORS, rate limiting, and input sanitization

## 📁 Project Structure

```
carenote-backend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── sessionController.js # Recording sessions
│   │   ├── subscriptionController.js # Stripe subscriptions
│   │   └── templateController.js # Clinical templates
│   ├── middleware/
│   │   ├── auth.js             # Authentication middleware
│   │   └── validation.js       # Request validation
│   ├── models/
│   │   ├── User.js             # User model with roles
│   │   ├── Company.js          # Company/clinic model
│   │   ├── Session.js          # Recording session model
│   │   ├── Template.js         # Template model
│   │   └── Subscription.js     # Subscription model
│   ├── routes/
│   │   ├── auth.js             # Auth routes
│   │   ├── sessions.js         # Session routes
│   │   ├── subscriptions.js    # Subscription routes
│   │   ├── templates.js        # Template routes
│   │   ├── users.js            # User routes
│   │   └── admin.js            # Admin routes
│   ├── services/
│   │   └── cortiService.js     # Corti.AI integration
│   └── utils/
│       └── responses.js        # Response helpers
├── logs/                       # Log files
├── package.json
├── server.js                   # Main server file
└── README.md
```

## 🛠 Setup Instructions

### 1. Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### 2. Installation

```bash
# Clone the repository
cd carenote-backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### 3. Environment Configuration

Edit `.env` file with your configuration:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/carenote

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_REFRESH_SECRET=your_refresh_secret
JWT_EXPIRES_IN=24h

# Corti AI
CORTI_CLIENT_ID=your_corti_client_id
CORTI_CLIENT_SECRET=your_corti_client_secret
CORTI_ENVIRONMENT=eu
CORTI_TENANT_NAME=base

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
RESEND_API_KEY=your_resend_key
FROM_EMAIL=noreply@carenote.dk

# Frontend
FRONTEND_URL=http://localhost:3000

# Super Admin
SUPER_ADMIN_EMAIL=admin@carenote.dk
```

### 4. Database Setup

```bash
# Start MongoDB
mongod

# The application will create the database and collections automatically
```

### 5. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/password` - Change password
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/logout` - Logout user

### Sessions (Corti.AI Integration)
- `POST /api/sessions/start` - Start recording session
- `GET /api/sessions` - Get user sessions
- `GET /api/sessions/:id/ws-url` - Get WebSocket URL
- `GET /api/sessions/:id/facts` - Get session facts
- `POST /api/sessions/:id/facts` - Add fact to session
- `PUT /api/sessions/:id/facts/:factId` - Update fact
- `POST /api/sessions/:id/end` - End session

### Templates
- `POST /api/templates/generate` - Generate template from session
- `GET /api/templates` - Get templates (role-based)
- `GET /api/templates/:id` - Get single template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/:id/regenerate` - Regenerate template
- `POST /api/templates/:id/finalize` - Finalize template
- `POST /api/templates/:id/archive` - Archive template
- `GET /api/templates/stats` - Get template statistics

### Subscriptions
- `GET /api/subscriptions/plans` - Get available plans
- `GET /api/subscriptions/current` - Get current subscription
- `POST /api/subscriptions` - Create subscription
- `POST /api/subscriptions/:id/checkout` - Create Stripe checkout
- `PUT /api/subscriptions/:id` - Update subscription
- `DELETE /api/subscriptions/:id` - Cancel subscription
- `POST /api/subscriptions/:id/reactivate` - Reactivate subscription
- `POST /api/subscriptions/webhook` - Stripe webhook

### Admin
- `GET /api/admin/dashboard` - Get admin dashboard data

## 🔐 Role-Based Access Control

### 1. Normal User (`role: 'user'`)
- Access to own templates and sessions
- Can create and manage personal content
- Can have individual or company subscriptions

### 2. Company Admin (`role: 'user'` + `is_company_admin: true`)
- All normal user permissions
- **Can see templates from all users in their company**
- Can invite users to company (within subscription limits)
- Can manage company subscription

### 3. Super Admin (`role: 'admin'` + `is_super_admin: true`)
- Full access to all users, companies, and templates
- Can see system-wide statistics
- Can manage any subscription or user

## 💳 Subscription Management

### Subscription Plans
- **Individual**: 599 DKK/month, 1 user
- **Clinic Basic**: 599 DKK/month, 5 users
- **Clinic Pro**: 550 DKK/month, 15 users
- **Enterprise**: 525 DKK/month, 50 users

### Key Features
- Stripe integration for payment processing
- Automatic subscription limits enforcement
- Usage tracking and reporting
- Webhook handling for subscription updates
- Support for both individual and company subscriptions

## 🤖 Corti.AI Integration

### Features
- Real-time audio streaming via WebSocket
- Automatic facts extraction during recording
- Clinical template generation (SOAP notes, brief clinical notes)
- Facts editing and template regeneration
- No audio file storage (streams directly to Corti)

### Workflow
1. Start session → Get Corti WebSocket URL
2. Stream audio → Corti extracts facts in real-time
3. User edits facts → Updates via Corti API
4. Generate template → From facts via Corti API
5. Save template → In local database
6. Regenerate → When facts are updated

## 🔒 Security Features

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- CORS configuration for frontend integration
- Helmet for security headers
- Input validation and sanitization
- MongoDB injection prevention

## 📊 Logging

- Winston logger for structured logging
- Separate log files for errors and combined logs
- Request/response logging with timing
- Error stack traces in development

## 🚀 Deployment

### Environment Setup
```bash
# Production environment variables
NODE_ENV=production
MONGODB_URI=mongodb://your-production-db
JWT_SECRET=your-production-secret
# ... other production variables
```

### Health Check
- `GET /health` - Application health status

## 🤝 Contributing

1. Follow the existing code structure
2. Use the provided response helpers (`successResponse`, `errorResponse`)
3. Add proper validation for new endpoints
4. Include proper error handling
5. Update this README for new features

## 📝 Notes

- **No audio storage**: Audio streams directly to Corti.AI, no local storage needed
- **Template-focused**: Emphasis on clinical document generation and management
- **Role-based access**: Company admins can view all templates from their users
- **Subscription limits**: Enforced at the API level with proper error handling
- **Extensible**: Easy to add new endpoints and features

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection**: Ensure MongoDB is running and URI is correct
2. **JWT Errors**: Check JWT_SECRET is set and tokens aren't expired
3. **Corti API**: Verify Corti credentials and environment settings
4. **Stripe Webhook**: Ensure webhook secret matches Stripe dashboard

For more help, check the logs in the `logs/` directory. 