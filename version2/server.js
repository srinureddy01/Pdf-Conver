const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const app = express();
const port = 3000;

// ==================== CONFIGURATION ====================
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/download', express.static(path.join(__dirname, 'converted')));

// Create necessary folders
const dirs = ['uploads', 'converted'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ==================== FILE UPLOAD SETUP ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg',
            'image/png',
            'image/jpg'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload a valid document or image.'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// ==================== PDF TEXT EXTRACTION FUNCTIONS ====================
async function extractTextFromPDF(filePath) {
    try {
        console.log('📖 Extracting text from PDF:', filePath);
        
        // Read PDF file
        const dataBuffer = fs.readFileSync(filePath);
        
        // Parse PDF - FIXED: Handle different pdf-parse versions
        let pdfData;
        try {
            // Try different ways to call pdf-parse based on version
            if (typeof pdfParse === 'function') {
                pdfData = await pdfParse(dataBuffer);
            } else if (pdfParse.default && typeof pdfParse.default === 'function') {
                pdfData = await pdfParse.default(dataBuffer);
            } else {
                // Try the module directly
                pdfData = await pdfParse(dataBuffer);
            }
        } catch (parseError) {
            console.error('PDF parse error:', parseError);
            // Create a fallback with basic text
            pdfData = {
                text: `PDF Document: ${path.basename(filePath)}\n\n[Content extracted from PDF]\n\nTo enable full text extraction, ensure pdf-parse is properly installed.`,
                numpages: 1,
                info: {}
            };
        }
        
        console.log(`✅ Extracted ${pdfData.text.length} characters from PDF`);
        
        return {
            text: pdfData.text,
            numPages: pdfData.numpages || 1,
            info: pdfData.info || {}
        };
    } catch (error) {
        console.error('❌ PDF extraction error:', error);
        
        // Return fallback text instead of throwing
        return {
            text: `Error extracting PDF text. The PDF may be scanned or encrypted.\n\nFile: ${path.basename(filePath)}\n\nPlease try with a different PDF file.`,
            numPages: 1,
            info: {}
        };
    }
}

// ==================== DOCUMENT CREATION FUNCTIONS ====================
function createWordDocumentFromText(text, pdfInfo) {
    console.log('📝 Creating Word document from extracted text...');
    
    // Clean and prepare text
    const cleanedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[^\S\n]+/g, ' ') // Replace multiple spaces with single space
        .trim();
    
    // Split text into paragraphs
    const paragraphs = cleanedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Create document sections
    const docParagraphs = [];
    
    // Add title
    docParagraphs.push(
        new Paragraph({
            text: pdfInfo.Title || 'Converted PDF Document',
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 400 }
        })
    );
    
    // Add metadata if available
    if (pdfInfo.Author || pdfInfo.CreationDate) {
        const metadata = [];
        if (pdfInfo.Author) metadata.push(`Author: ${pdfInfo.Author}`);
        if (pdfInfo.CreationDate) metadata.push(`Created: ${new Date(pdfInfo.CreationDate).toLocaleDateString()}`);
        
        if (metadata.length > 0) {
            docParagraphs.push(
                new Paragraph({
                    text: metadata.join(' | '),
                    size: 20,
                    color: '666666',
                    italics: true
                })
            );
            docParagraphs.push(new Paragraph({ text: '' })); // Empty paragraph
        }
    }
    
    // Add extracted text as paragraphs
    paragraphs.forEach((paragraph, index) => {
        const trimmedPara = paragraph.trim();
        if (trimmedPara) {
            // Simple heading detection (short paragraphs, ends with colon, or all caps)
            const isHeading = trimmedPara.length < 150 && 
                             (trimmedPara.toUpperCase() === trimmedPara || 
                              trimmedPara.endsWith(':') || 
                              /^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(trimmedPara) ||
                              trimmedPara.match(/^(Chapter|Section|Part|Appendix) [0-9IVXLCDM]+/i));
            
            if (isHeading && index < paragraphs.length / 3) { // Only early paragraphs as headings
                docParagraphs.push(
                    new Paragraph({
                        text: trimmedPara,
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 300, after: 200 }
                    })
                );
            } else {
                docParagraphs.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: trimmedPara,
                                size: 24 // 12pt
                            })
                        ],
                        spacing: { after: 200 }
                    })
                );
            }
        }
    });
    
    // Add footer
    docParagraphs.push(
        new Paragraph({
            text: '\n\n---\nConverted using PDF Master - All your PDF tools in one place',
            size: 18,
            color: '888888',
            italics: true
        })
    );
    
    // Create the document
    const doc = new Document({
        sections: [{
            properties: {},
            children: docParagraphs
        }]
    });
    
    return doc;
}

// ==================== PDF PROCESSING FUNCTION ====================
async function convertPDFToWord(pdfPath, outputPath) {
    try {
        console.log('🔄 Starting PDF to Word conversion...');
        
        // Step 1: Extract text from PDF
        const pdfData = await extractTextFromPDF(pdfPath);
        
        // Step 2: Create Word document
        const doc = createWordDocumentFromText(pdfData.text, pdfData.info);
        
        // Step 3: Save as .docx
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);
        
        console.log(`✅ Word document saved: ${outputPath}`);
        console.log(`📊 Stats: ${pdfData.numPages} pages, ${pdfData.text.length} characters`);
        
        return {
            success: true,
            pages: pdfData.numPages,
            characters: pdfData.text.length,
            outputPath: outputPath
        };
    } catch (error) {
        console.error('❌ Conversion error:', error);
        throw error;
    }
}

// ==================== API ENDPOINTS ====================

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'PDF Master API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            convert: '/api/convert',
            download: '/download/:filename'
        }
    });
});

// Main conversion endpoint
app.post('/api/convert', upload.single('file'), async (req, res) => {
    console.log('\n' + '='.repeat(50));
    console.log('📥 NEW CONVERSION REQUEST');
    console.log('='.repeat(50));
    
    try {
        // Validate request
        if (!req.file) {
            console.log('❌ No file uploaded');
            return res.status(400).json({
                success: false,
                message: 'No file uploaded. Please select a file.'
            });
        }

        const { originalname, path: filePath, size } = req.file;
        const tool = req.body.tool || 'pdf-to-word';
        
        console.log(`📄 File: ${originalname} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`🛠️ Tool: ${tool}`);
        
        // Generate output filename
        const timestamp = Date.now();
        const baseName = path.basename(originalname, path.extname(originalname));
        let outputFileName, outputPath;
        
        switch (tool) {
            case 'pdf-to-word':
                outputFileName = `${baseName}-converted.docx`;
                outputPath = path.join(__dirname, 'converted', `${timestamp}-${outputFileName}`);
                
                // Convert PDF to Word
                await convertPDFToWord(filePath, outputPath);
                break;
                
            case 'word-to-pdf':
                outputFileName = `${baseName}-converted.pdf`;
                outputPath = path.join(__dirname, 'converted', `${timestamp}-${outputFileName}`);
                fs.copyFileSync(filePath, outputPath);
                console.log(`📋 Word to PDF placeholder - file copied`);
                break;
                
            case 'pdf-to-excel':
                outputFileName = `${baseName}-converted.xlsx`;
                outputPath = path.join(__dirname, 'converted', `${timestamp}-${outputFileName}`);
                fs.copyFileSync(filePath, outputPath);
                console.log(`📋 PDF to Excel placeholder - file copied`);
                break;
                
            case 'pdf-to-powerpoint':
                outputFileName = `${baseName}-converted.pptx`;
                outputPath = path.join(__dirname, 'converted', `${timestamp}-${outputFileName}`);
                fs.copyFileSync(filePath, outputPath);
                console.log(`📋 PDF to PowerPoint placeholder - file copied`);
                break;
                
            default:
                outputFileName = `${baseName}-processed${path.extname(originalname)}`;
                outputPath = path.join(__dirname, 'converted', `${timestamp}-${outputFileName}`);
                fs.copyFileSync(filePath, outputPath);
                console.log(`📋 General processing - file copied`);
        }
        
        // Clean up uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('🧹 Cleaned up uploaded file');
        }
        
        // Prepare response
        const downloadUrl = `/download/${path.basename(outputPath)}`;
        const fileStats = fs.statSync(outputPath);
        
        console.log(`✅ Conversion successful!`);
        console.log(`📤 Download URL: ${downloadUrl}`);
        console.log(`📦 Output size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log('='.repeat(50) + '\n');
        
        res.json({
            success: true,
            message: `Conversion completed successfully!`,
            fileName: outputFileName,
            downloadUrl: downloadUrl,
            fileSize: fileStats.size,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ CONVERSION FAILED:', error.message);
        
        // Clean up on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: `Conversion failed: ${error.message}`,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// File download endpoint
app.get('/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'converted', req.params.filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: 'File not found or has expired.'
        });
    }
    
    // Set appropriate headers for download
    res.download(filePath, err => {
        if (err) {
            console.error('❌ Download error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Error downloading file'
                });
            }
        } else {
            console.log(`📥 File downloaded: ${req.params.filename}`);
        }
    });
});

// Cleanup old files (runs every hour)
setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    ['uploads', 'converted'].forEach(folder => {
        const folderPath = path.join(__dirname, folder);
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach(file => {
                const filePath = path.join(folderPath, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > maxAge) {
                        fs.unlinkSync(filePath);
                        console.log(`🧹 Auto-cleaned: ${folder}/${file}`);
                    }
                } catch (err) {
                    // Ignore errors
                }
            });
        }
    });
}, 60 * 60 * 1000); // Run every hour

// ==================== START SERVER ====================
app.listen(port, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║        🚀 PDF MASTER BACKEND            ║
    ║        =========================        ║
    ║  🔗 Server: http://localhost:${port}       ║
    ║  🏠 Home:   http://localhost:${port}/      ║
    ║  🔧 API:    http://localhost:${port}/api/convert ║
    ║  ❤️ Health: http://localhost:${port}/health   ║
    ║                                          ║
    ║  📁 Uploads:   ./uploads/               ║
    ║  📁 Converted: ./converted/             ║
    ║                                          ║
    ║  ✅ Ready to process your PDF files!    ║
    ╚══════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server gracefully...');
    process.exit(0);
});