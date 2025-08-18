const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

/**
 * PDF Service
 * Handles PDF generation for invoices and other documents
 */

class PDFService {
  constructor() {
    this.browser = null;
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  /**
   * Generate PDF from HTML content
   */
  async generatePDF(htmlContent, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Set content and wait for it to load
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        },
        ...options
      });

      return pdfBuffer;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate PDF invoice from HTML
   */
  async generateInvoicePDF(invoiceHTML, invoiceNumber) {
    try {
      const pdfBuffer = await this.generatePDF(invoiceHTML, {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        preferCSSPageSize: true
      });

      return {
        buffer: pdfBuffer,
        filename: `invoice-${invoiceNumber}.pdf`,
        contentType: 'application/pdf'
      };
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
  }

  /**
   * Save PDF to temporary file
   */
  async savePDFToFile(pdfBuffer, filename) {
    const tempDir = path.join(__dirname, '../../temp');
    
    // Create temp directory if it doesn't exist
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, pdfBuffer);
    
    return filePath;
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log('Temporary file cleaned up:', filePath);
    } catch (error) {
      console.error('Failed to cleanup temp file:', error);
      // Don't throw error as this is cleanup operation
    }
  }

  /**
   * Clean up all temporary files in temp directory
   */
  async cleanupAllTempFiles() {
    try {
      const tempDir = path.join(__dirname, '../../temp');
      const files = await fs.readdir(tempDir);
      
      for (const file of files) {
        if (file.endsWith('.pdf')) {
          const filePath = path.join(tempDir, file);
          await this.cleanupTempFile(filePath);
        }
      }
      
      console.log('All temporary PDF files cleaned up');
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error);
    }
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        console.log('PDF service browser closed');
      } catch (error) {
        console.error('Failed to close browser:', error);
      }
    }
  }

  /**
   * Graceful shutdown - cleanup everything
   */
  async shutdown() {
    await this.cleanupAllTempFiles();
    await this.closeBrowser();
  }
}

module.exports = new PDFService();
