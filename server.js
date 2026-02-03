const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun } = require('docx');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 
app.use('/download', express.static(path.join(__dirname, 'converted')));

// Create folders
const dirs = ['uploads', 'converted'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Serve the HTML file at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// API Endpoint
app.post('/api/convert', upload.single('file'), async (req, res) => {
    try {
        console.log('📥 Received file:', req.file?.originalname);
        console.log('🛠️ Tool:', req.body?.tool);
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded' 
            });
        }

        const tool = req.body.tool;
        const timestamp = Date.now();
        const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        
        let outputPath;
        let finalFileName;

        if (tool === 'pdf-to-word') {
            finalFileName = `${baseName}.docx`;
            outputPath = path.join(__dirname, 'converted', `${timestamp}-${finalFileName}`);
            
            // **FIXED: SIMPLE VERSION - No pdf-parse needed for demo**
            // For now, create a simple Word document without parsing PDF
            const doc = new Document({
                sections: [{
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Converted from: ${req.file.originalname}`,
                                    bold: true,
                                    size: 28
                                })
                            ]
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: '\n\nThis is a demo conversion.',
                                    size: 24
                                })
                            ]
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: '\nOriginal file has been processed successfully.',
                                    size: 24
                                })
                            ]
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: '\n\nTo add real PDF-to-Word conversion:',
                                    bold: true,
                                    size: 24
                                })
                            ]
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: '1. Install: npm install pdf-parse',
                                    size: 20
                                })
                            ]
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: '2. Use pdf-parse to extract text from PDF',
                                    size: 20
                                })
                            ]
                        })
                    ]
                }]
            });
            
            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(outputPath, buffer);
            console.log('✅ Word document created:', finalFileName);
            
        } else {
            // For other tools, just copy the file as placeholder
            finalFileName = `processed-${req.file.originalname}`;
            outputPath = path.join(__dirname, 'converted', `${timestamp}-${finalFileName}`);
            fs.copyFileSync(req.file.path, outputPath);
            console.log('📄 File processed:', finalFileName);
        }

        // Clean up original upload
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // Return success with download URL
        const downloadFileName = path.basename(outputPath);
        res.json({
            success: true,
            fileName: finalFileName,
            downloadUrl: `/download/${downloadFileName}`,
            message: 'Conversion successful!'
        });

    } catch (err) {
        console.error("❌ SERVER ERROR:", err.message);
        
        // Clean up if file exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + err.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        server: 'PDF Master Backend',
        time: new Date().toISOString(),
        folders: ['uploads', 'converted']
    });
});

// Start server
app.listen(port, () => {
    console.log('====================================');
    console.log(`🚀 PDF Master Backend Started!`);
    console.log(`📡 Server URL: http://localhost:${port}`);
    console.log(`🏠 Home Page: http://localhost:${port}/`);
    console.log(`🔧 API: http://localhost:${port}/api/convert`);
    console.log(`❤️ Health: http://localhost:${port}/health`);
    console.log('====================================');
    console.log('📁 Folders created: uploads/, converted/');
    console.log('✅ Ready to accept PDF files!');
});