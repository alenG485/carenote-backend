const { Resend } = require('resend');
const pdfService = require('./pdfService');
const fs = require('fs');
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
    
    // Brand colors matching the application theme
    this.colors = {
      primary: '#00A19D',
      primaryLight: '#7FD1AE',
      primaryDark: '#005F5E',
      secondary: '#E8F9F8',
      accent: '#B4E7E4'
    };
    
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
          .header { text-align: center; padding: 30px 0; border-bottom: 2px solid ${this.colors.primary} !important; }
          .logo { font-size: 32px; font-weight: 300; color: #333; }
          .logo span { font-weight: 600; color: ${this.colors.primary} !important; }
          .content { padding: 40px 0; }
          .button { display: inline-block; padding: 14px 28px; background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .button:hover { background-color: ${this.colors.primaryDark} !important; }
          a.button { background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none !important; }
          a.button:hover { background-color: ${this.colors.primaryDark} !important; }
          .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
          .info-box { background-color: ${this.colors.secondary} !important; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${this.colors.primary} !important; }
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
          .header { text-align: center; padding: 30px 0; border-bottom: 2px solid ${this.colors.primary} !important; }
          .logo { font-size: 32px; font-weight: 300; color: #333; }
          .logo span { font-weight: 600; color: ${this.colors.primary} !important; }
          .content { padding: 40px 0; }
          .button { display: inline-block; padding: 14px 28px; background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .button:hover { background-color: ${this.colors.primaryDark} !important; }
          a.button { background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none !important; }
          a.button:hover { background-color: ${this.colors.primaryDark} !important; }
          .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
          .warning-box { background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
          .security-note { background-color: ${this.colors.secondary} !important; padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 14px; border-left: 4px solid ${this.colors.primary} !important; }
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

      const { email } = userData;
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
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Påmindelse: Bekræft din e-mailadresse - ${this.companyName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 30px 0; border-bottom: 2px solid ${this.colors.primary}; }
            .logo { font-size: 32px; font-weight: 300; color: #333; }
            .logo span { font-weight: 600; color: ${this.colors.primary}; }
            .content { padding: 40px 0; }
            .button { display: inline-block; padding: 14px 28px; background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .button:hover { background-color: ${this.colors.primaryDark} !important; }
            a.button { background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none !important; }
            a.button:hover { background-color: ${this.colors.primaryDark} !important; }
            .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Care<span>Note</span></div>
            </div>
            
            <div class="content">
              <h2>Påmindelse: Bekræft din e-mailadresse</h2>
              <p>Hej ${name},</p>
              <p>Vi bemærkede, at du endnu ikke har bekræftet din e-mailadresse. For at få fuld adgang til ${this.companyName}, skal du bekræfte den ved at klikke på knappen nedenfor:</p>
              
              <div style="text-align: center;">
                <a href="${verificationLink}" class="button">Bekræft e-mailadresse</a>
              </div>
              
              <p>Med venlig hilsen,<br>${this.companyName} teamet</p>
            </div>
            
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${this.companyName}. Alle rettigheder forbeholdes.</p>
              <p>Denne e-mail blev sendt til ${email}</p>
            </div>
          </div>
        </body>
        </html>
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

  /**
   * Generate invitation email template
   */
  generateInvitationEmailTemplate(invitationData) {
    const { email, name, companyName, invitationToken, invitedBy } = invitationData;
    const invitationLink = `${this.frontendUrl}/accept-invitation?token=${invitationToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invitation til ${companyName} - ${this.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 30px 0; border-bottom: 2px solid ${this.colors.primary} !important; }
          .logo { font-size: 32px; font-weight: 300; color: #333; }
          .logo span { font-weight: 600; color: ${this.colors.primary} !important; }
          .content { padding: 40px 0; }
          .button { display: inline-block; padding: 14px 28px; background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .button:hover { background-color: ${this.colors.primaryDark} !important; }
          a.button { background-color: ${this.colors.primary} !important; color: white !important; text-decoration: none !important; }
          a.button:hover { background-color: ${this.colors.primaryDark} !important; }
          .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
          .info-box { background-color: ${this.colors.secondary} !important; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${this.colors.primary} !important; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Care<span>Note</span></div>
          </div>
          
          <div class="content">
            <h1>Invitation til ${companyName}</h1>
            
            <p>Hej ${name},</p>
            
            <p>Du er blevet inviteret til at deltage i ${companyName} på ${this.companyName} platformen af ${invitedBy}.</p>
            
            <p>${this.companyName} er en intelligent journalføringsplatform, der hjælper sundhedspersonale med at spare tid på dokumentation og forbedre patientplejen.</p>
            
            <p>Klik på knappen nedenfor for at acceptere invitationen og oprette din konto:</p>
            
            <div style="text-align: center;">
              <a href="${invitationLink}" class="button">Accepter invitation</a>
            </div>
            
            <div class="info-box">
              <h3>Hvad får du adgang til?</h3>
              <ul>
                <li>Intelligent journalføring med AI-assistance</li>
                <li>Automatisk strukturering af kliniske notater</li>
                <li>Tidsbesparelse på op til 90% ved dokumentation</li>
                <li>Sikker håndtering af patientdata</li>
                <li>Samarbejde med dit team</li>
              </ul>
            </div>
            
            <p>Hvis du har spørgsmål eller brug for hjælp, så tøv ikke med at kontakte vores support på <a href="mailto:support@carenote.dk">support@carenote.dk</a>.</p>
            
            <p>Med venlig hilsen,<br>
            ${this.companyName} teamet</p>
            
            <p style="font-size: 14px; color: #666;">
              Hvis du ikke forventede denne invitation, kan du ignorere denne e-mail.
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
      Invitation til ${companyName} - ${this.companyName}
      
      Hej ${name},
      
      Du er blevet inviteret til at deltage i ${companyName} på ${this.companyName} platformen af ${invitedBy}.
      
      ${this.companyName} er en intelligent journalføringsplatform, der hjælper sundhedspersonale med at spare tid på dokumentation og forbedre patientplejen.
      
      Besøg dette link for at acceptere invitationen og oprette din konto:
      ${invitationLink}
      
      Hvad får du adgang til?
      - Intelligent journalføring med AI-assistance
      - Automatisk strukturering af kliniske notater
      - Tidsbesparelse på op til 90% ved dokumentation
      - Sikker håndtering af patientdata
      - Samarbejde med dit team
      
      Hvis du har spørgsmål eller brug for hjælp, så kontakt os på support@carenote.dk.
      
      Med venlig hilsen,
      ${this.companyName} teamet
      
      Hvis du ikke forventede denne invitation, kan du ignorere denne e-mail.
    `;

    return { html, text };
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(invitationData) {
    try {
      if (!this.isConfigured()) {
        this.logger.error('Resend API key not configured');
        throw new Error('Email service not configured');
      }

      const { html, text } = this.generateInvitationEmailTemplate(invitationData);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: invitationData.email,
        subject: `Invitation til ${invitationData.companyName} - ${this.companyName}`,
        html,
        text,
        tags: [
          { name: 'category', value: 'invitation' },
          { name: 'user_type', value: 'invited_user' }
        ]
      });

      this.logger.info('Invitation email sent successfully', { 
        email: invitationData.email, 
        messageId: result.data?.id 
      });

      return { success: true, messageId: result.data?.id };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Send invoice email with PDF attachment
   */
  async sendInvoiceEmail(invoiceData) {
    let tempPdfPath = null;
    
    try {
      if (!this.isConfigured()) {
        this.logger.error('Resend API key not configured');
        throw new Error('Email service not configured');
      }

      const { to, subject, invoiceData: data, invoiceHTML } = invoiceData;

      // Generate PDF attachment
      let pdfAttachment = null;
      try {
        const pdfResult = await pdfService.generateInvoicePDF(invoiceHTML, data.invoice_number);
        
        // Validate PDF buffer
        if (!pdfResult.buffer || pdfResult.buffer.length === 0) {
          throw new Error('Generated PDF buffer is empty');
        }
        
        // Save PDF to temporary file for email attachment
        tempPdfPath = await pdfService.savePDFToFile(pdfResult.buffer, pdfResult.filename);
        
        // Read file from disk and convert to base64 (following Resend documentation)
        const fileContent = fs.readFileSync(tempPdfPath);
        const base64Content = fileContent.toString('base64');
        
        // Validate base64 content
        if (!base64Content || base64Content.length === 0) {
          throw new Error('Base64 conversion failed');
        }
        
        pdfAttachment = {
          filename: pdfResult.filename,
          content: base64Content
        };
        
        this.logger.info('PDF generated successfully for attachment', {
          filename: pdfResult.filename,
          fileSize: fileContent.length,
          base64Size: base64Content.length,
          base64Start: base64Content.substring(0, 20) + '...',
          isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64Content)
        });
        
      } catch (pdfError) {
        this.logger.error('PDF generation failed, sending email without attachment:', pdfError);
        // Continue without PDF attachment
      }

      // Prepare email data
      const emailData = {
        from: this.fromEmail,
        to: to,
        subject: subject || `Faktura ${data.invoice_number} - ${this.companyName}`,
        html: invoiceHTML,
        tags: [
          { name: 'category', value: 'invoice' },
          { name: 'user_type', value: 'billing' },
          { name: 'invoice_number', value: data.invoice_number }
        ]
      };

      // Add PDF attachment if available
      if (pdfAttachment) {
        // Validate attachment structure
        if (!pdfAttachment.filename || !pdfAttachment.content) {
          this.logger.error('Invalid attachment structure:', pdfAttachment);
          pdfAttachment = null;
        } else {
          emailData.attachments = [pdfAttachment];
          this.logger.info('PDF attachment added to email', {
            filename: pdfAttachment.filename,
            contentLength: pdfAttachment.content.length,
            emailDataKeys: Object.keys(emailData)
          });
        }
      } else {
        this.logger.warn('No PDF attachment available for email');
      }

      this.logger.info('Sending email with data:', {
        to: emailData.to,
        subject: emailData.subject,
        hasAttachments: !!emailData.attachments,
        attachmentCount: emailData.attachments ? emailData.attachments.length : 0
      });

      const result = await this.resend.emails.send(emailData);

      this.logger.info('Resend API response:', {
        success: !!result.data,
        messageId: result.data?.id,
        responseKeys: Object.keys(result),
        dataKeys: result.data ? Object.keys(result.data) : null
      });

      this.logger.info('Invoice email sent successfully', { 
        email: to, 
        messageId: result.data?.id,
        invoiceNumber: data.invoice_number,
        amount: data.amount,
        hasPdfAttachment: !!pdfAttachment
      });

      return { 
        success: true, 
        messageId: result.data?.id,
        hasPdfAttachment: !!pdfAttachment
      };

    } catch (error) {
      this.logger.error('Failed to send invoice email', { 
        email: invoiceData.to, 
        error: error.message,
        invoiceNumber: invoiceData.invoiceData?.invoice_number
      });
      throw error;
    } finally {
      // Clean up temporary PDF file
      if (tempPdfPath) {
        try {
          await pdfService.cleanupTempFile(tempPdfPath);
          this.logger.info('Temporary PDF file cleaned up successfully', { 
            filePath: tempPdfPath 
          });
        } catch (cleanupError) {
          this.logger.error('Failed to cleanup temporary PDF file', { 
            filePath: tempPdfPath, 
            error: cleanupError.message 
          });
        }
      }
    }
  }

  /**
   * Generate contact form email template
   */
  generateContactEmailTemplate(contactData) {
    const { name, email, subject, message } = contactData;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ny kontakthenvendelse - ${this.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 30px 0; border-bottom: 2px solid ${this.colors.primary} !important; }
          .logo { font-size: 32px; font-weight: 300; color: #333; }
          .logo span { font-weight: 600; color: ${this.colors.primary} !important; }
          .content { padding: 40px 0; }
          .info-box { background-color: ${this.colors.secondary} !important; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${this.colors.primary} !important; }
          .message-box { background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
          .footer { border-top: 1px solid #eee; padding: 20px 0; font-size: 14px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Care<span>Note</span></div>
          </div>
          
          <div class="content">
            <h1>Ny kontakthenvendelse</h1>
            
            <div class="info-box">
              <p><strong>Fra:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Emne:</strong> ${subject}</p>
            </div>
            
            <h2>Besked:</h2>
            <div class="message-box">
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.companyName}. Alle rettigheder forbeholdes.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Ny kontakthenvendelse - ${this.companyName}
      
      Fra: ${name}
      Email: ${email}
      Emne: ${subject}
      
      Besked:
      ${message}
    `;

    return { html, text };
  }

  /**
   * Send contact form email
   */
  async sendContactEmail(contactData) {
    try {
      if (!this.isConfigured()) {
        this.logger.error('Resend API key not configured');
        throw new Error('Email service not configured');
      }

      const { name, email, subject, message } = contactData;
      const { html, text } = this.generateContactEmailTemplate(contactData);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: 'kontakt@carenote.dk',
        replyTo: email,
        subject: `Kontakthenvendelse: ${subject}`,
        html,
        text,
        tags: [
          { name: 'category', value: 'contact' },
          { name: 'source', value: 'contact_form' }
        ]
      });

      this.logger.info('Contact email sent successfully', { 
        from: email,
        name,
        subject,
        messageId: result.data?.id
      });

      return { success: true, messageId: result.data?.id };

    } catch (error) {
      this.logger.error('Failed to send contact email', { 
        from: contactData.email, 
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new EmailService(); 