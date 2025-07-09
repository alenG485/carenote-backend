const { Resend } = require('resend');
const winston = require('winston');

/**
 * Email Service using Resend
 * Handles registration confirmation and password reset emails
 */

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@carenote.dk';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.companyName = process.env.COMPANY_NAME || 'CareNote';
    
    // Create logger for email service
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, meta }) => {
          return `${timestamp} [${level.toUpperCase()}] EmailService: ${message} ${meta ? JSON.stringify(meta) : ''}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/email.log' })
      ]
    });
  }

  /**
   * Check if email service is properly configured
   */
  isConfigured() {
    return Boolean(process.env.RESEND_API_KEY);
  }

  /**
   * Generate welcome email template
   */
  generateWelcomeEmailTemplate(userData) {
    const { name, email, verificationToken } = userData;
    const verificationLink = `${this.frontendUrl}/verify-email?token=${verificationToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Velkommen til ${this.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #00d084; }
          .logo { font-size: 32px; font-weight: 300; color: #333; }
          .logo span { font-weight: 600; color: #00d084; }
          .content { padding: 40px 0; }
          .button { display: inline-block; padding: 14px 28px; background-color: #00d084; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .button:hover { background-color: #00b570; }
          .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
          .info-box { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Care<span>Note</span></div>
          </div>
          
          <div class="content">
            <h1>Velkommen til ${this.companyName}, ${name}!</h1>
            
            <p>Tak fordi du har oprettet en konto hos os. Vi er glade for at have dig om bord!</p>
            
            <p>For at komme i gang og aktivere din konto, skal du bekræfte din e-mailadresse ved at klikke på knappen nedenfor:</p>
            
            <div style="text-align: center;">
              <a href="${verificationLink}" class="button">Bekræft e-mailadresse</a>
            </div>
            
            <div class="info-box">
              <h3>Hvad kan du forvente?</h3>
              <ul>
                <li>Intelligent journalføring med AI-assistance</li>
                <li>Automatisk strukturering af kliniske notater</li>
                <li>Tidsbesparelse på op til 90% ved dokumentation</li>
                <li>Sikker håndtering af patientdata</li>
              </ul>
            </div>
            
            <p>Hvis du har spørgsmål eller brug for hjælp, så tøv ikke med at kontakte vores support på <a href="mailto:support@carenote.dk">support@carenote.dk</a>.</p>
            
            <p>Med venlig hilsen,<br>
            ${this.companyName} teamet</p>
            
            <p style="font-size: 14px; color: #666;">
              Hvis du ikke oprettede denne konto, kan du ignorere denne e-mail.
            </p>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. Alle rettigheder forbeholdes.</p>
            <p>Denne e-mail blev sendt til ${email}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Velkommen til ${this.companyName}, ${name}!
      
      Tak fordi du har oprettet en konto hos os. Vi er glade for at have dig om bord!
      
      For at komme i gang og aktivere din konto, skal du bekræfte din e-mailadresse ved at besøge dette link:
      ${verificationLink}
      
      Hvad kan du forvente?
      - Intelligent journalføring med AI-assistance
      - Automatisk strukturering af kliniske notater
      - Tidsbesparelse på op til 90% ved dokumentation
      - Sikker håndtering af patientdata
      
      Hvis du har spørgsmål eller brug for hjælp, så kontakt os på support@carenote.dk.
      
      Med venlig hilsen,
      ${this.companyName} teamet
      
      Hvis du ikke oprettede denne konto, kan du ignorere denne e-mail.
    `;

    return { html, text };
  }

  /**
   * Generate password reset email template
   */
  generatePasswordResetTemplate(userData) {
    const { name, email, resetToken } = userData;
    const resetLink = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    const expirationTime = process.env.PASSWORD_RESET_EXPIRATION_HOURS || '1';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nulstil din adgangskode - ${this.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #00d084; }
          .logo { font-size: 32px; font-weight: 300; color: #333; }
          .logo span { font-weight: 600; color: #00d084; }
          .content { padding: 40px 0; }
          .button { display: inline-block; padding: 14px 28px; background-color: #00d084; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .button:hover { background-color: #00b570; }
          .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
          .warning-box { background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
          .security-note { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Care<span>Note</span></div>
          </div>
          
          <div class="content">
            <h1>Nulstil din adgangskode</h1>
            
            <p>Hej ${name},</p>
            
            <p>Vi har modtaget en anmodning om at nulstille adgangskoden til din ${this.companyName} konto.</p>
            
            <p>Klik på knappen nedenfor for at oprette en ny adgangskode:</p>
            
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Nulstil adgangskode</a>
            </div>
            
            <div class="warning-box">
              <strong>Vigtigt:</strong> Dette link udløber om ${expirationTime} time(r) af sikkerhedsmæssige årsager.
            </div>
            
            <div class="security-note">
              <h4>Sikkerhedstips:</h4>
              <ul>
                <li>Brug en stærk adgangskode med mindst 8 tegn</li>
                <li>Kombiner store og små bogstaver, tal og specialtegn</li>
                <li>Brug ikke den samme adgangskode til andre konti</li>
                <li>Del aldrig din adgangskode med andre</li>
              </ul>
            </div>
            
            <p>Hvis du ikke anmodede om at nulstille din adgangskode, kan du ignorere denne e-mail. Din konto forbliver sikker.</p>
            
            <p>Hvis du har spørgsmål, kan du kontakte os på <a href="mailto:support@carenote.dk">support@carenote.dk</a>.</p>
            
            <p>Med venlig hilsen,<br>
            ${this.companyName} teamet</p>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. Alle rettigheder forbeholdes.</p>
            <p>Denne e-mail blev sendt til ${email}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Nulstil din adgangskode - ${this.companyName}
      
      Hej ${name},
      
      Vi har modtaget en anmodning om at nulstille adgangskoden til din ${this.companyName} konto.
      
      Besøg dette link for at oprette en ny adgangskode:
      ${resetLink}
      
      VIGTIGT: Dette link udløber om ${expirationTime} time(r) af sikkerhedsmæssige årsager.
      
      Sikkerhedstips:
      - Brug en stærk adgangskode med mindst 8 tegn
      - Kombiner store og små bogstaver, tal og specialtegn
      - Brug ikke den samme adgangskode til andre konti
      - Del aldrig din adgangskode med andre
      
      Hvis du ikke anmodede om at nulstille din adgangskode, kan du ignorere denne e-mail. Din konto forbliver sikker.
      
      Spørgsmål? Kontakt os på support@carenote.dk
      
      Med venlig hilsen,
      ${this.companyName} teamet
    `;

    return { html, text };
  }

  /**
   * Send welcome/registration confirmation email
   */
  async sendWelcomeEmail(userData) {
    try {
      if (!this.isConfigured()) {
        this.logger.error('Resend API key not configured');
        throw new Error('Email service not configured');
      }

      const { name, email, verificationToken } = userData;
      const { html, text } = this.generateWelcomeEmailTemplate(userData);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: `Velkommen til ${this.companyName} - Bekræft din e-mailadresse`,
        html,
        text,
        tags: [
          { name: 'category', value: 'welcome' },
          { name: 'user_type', value: 'new_registration' }
        ]
      });

      this.logger.info('Welcome email sent successfully', { 
        email, 
        messageId: result.data?.id,
        userId: userData.userId 
      });

      return { success: true, messageId: result.data?.id };

    } catch (error) {
      this.logger.error('Failed to send welcome email', { 
        email: userData.email, 
        error: error.message,
        userId: userData.userId 
      });
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(userData) {
    try {
      if (!this.isConfigured()) {
        this.logger.error('Resend API key not configured');
        throw new Error('Email service not configured');
      }

      const { name, email, resetToken } = userData;
      const { html, text } = this.generatePasswordResetTemplate(userData);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: `Nulstil din adgangskode - ${this.companyName}`,
        html,
        text,
        tags: [
          { name: 'category', value: 'password_reset' },
          { name: 'user_type', value: 'existing_user' }
        ]
      });

      this.logger.info('Password reset email sent successfully', { 
        email, 
        messageId: result.data?.id,
        userId: userData.userId 
      });

      return { success: true, messageId: result.data?.id };

    } catch (error) {
      this.logger.error('Failed to send password reset email', { 
        email: userData.email, 
        error: error.message,
        userId: userData.userId 
      });
      throw error;
    }
  }

  /**
   * Send email verification reminder
   */
  async sendVerificationReminder(userData) {
    try {
      if (!this.isConfigured()) {
        this.logger.error('Resend API key not configured');
        throw new Error('Email service not configured');
      }

      const { name, email, verificationToken } = userData;
      const verificationLink = `${this.frontendUrl}/verify-email?token=${verificationToken}`;

      const html = `
        <h2>Påmindelse: Bekræft din e-mailadresse</h2>
        <p>Hej ${name},</p>
        <p>Vi bemærkede, at du endnu ikke har bekræftet din e-mailadresse. For at få fuld adgang til ${this.companyName}, skal du bekræfte den ved at klikke på linket nedenfor:</p>
        <p><a href="${verificationLink}" style="background-color: #00d084; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Bekræft e-mailadresse</a></p>
        <p>Med venlig hilsen,<br>${this.companyName} teamet</p>
      `;

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: `Påmindelse: Bekræft din e-mailadresse - ${this.companyName}`,
        html,
        tags: [
          { name: 'category', value: 'verification_reminder' },
          { name: 'user_type', value: 'unverified_user' }
        ]
      });

      this.logger.info('Verification reminder sent successfully', { 
        email, 
        messageId: result.data?.id,
        userId: userData.userId 
      });

      return { success: true, messageId: result.data?.id };

    } catch (error) {
      this.logger.error('Failed to send verification reminder', { 
        email: userData.email, 
        error: error.message,
        userId: userData.userId 
      });
      throw error;
    }
  }
}

module.exports = new EmailService(); 