const express = require('express'); 
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express(); 
app.set('trust proxy', 1); // Render terminates TLS at its edge; this makes req.secure accurate

const User = require('./Models/User');
const Car = require('./Models/Car');
const Invoice = require('./Models/Invoice');
const Financing = require('./Models/Financing');
const ProfitShare = require('./Models/ProfitShare');

// --- 1. SECURITY & MIDDLEWARE ---
app.use(cookieParser());

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "http://googleusercontent.com", "https://www.google.com"], 
            connectSrc: ["'self'", "https://formspree.io", "https://static.cloudflareinsights.com", "https://vpic.nhtsa.dot.gov"],
            frameSrc: ["'self'", "http://googleusercontent.com", "https://www.google.com"]
        }
    }
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(__dirname));

// --- 2. AUTHENTICATION LOCK (MIDDLEWARE) ---
const requireAuth = (req, res, next) => {
    let token = req.cookies.mai_token;
    if (!token) {
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
    }
    if (!token) return res.status(401).json({ error: "Access Denied: No Token Provided" });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
        req.user = verified; 
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid or Expired Token" });
    }
};

const requireAdmin = (req, res, next) => {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
        return res.status(403).json({ error: "Access Denied: Admin privileges required" });
    }
    next();
};

// --- 3. MAIN HOME ROUTE ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 4. STORAGE CONFIGURATION (Cloudinary — persists across Render deploys) ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const photoStorage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'megacars/cars', resource_type: 'image' }
});
const docStorage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'megacars/documents', resource_type: 'auto' }
});

const uploadPhotos = multer({ storage: photoStorage, limits: { files: 30, fileSize: 50 * 1024 * 1024 } });
const uploadDocs = multer({ storage: docStorage, limits: { files: 5, fileSize: 50 * 1024 * 1024 } });

// --- 5. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MAi Database Connected!');
        try {
            const adminExists = await User.findOne({ role: 'admin' });
            if (!adminExists && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
                const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
                await User.create({ username: process.env.ADMIN_USERNAME, password: hashed, role: 'admin' });
                console.log('Initial admin created from environment variables.');
            }
        } catch (e) {
            console.log('Admin auto-seed skipped:', e.message);
        }
    })
    .catch(err => console.log("Database connection error:", err));

// --- 6. AUTH ROUTES ---
app.post('/api/auth/register', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const normalizedRole = String(role || '').toLowerCase();
        if (!['admin', 'dealer'].includes(normalizedRole)) {
            return res.status(400).json({ error: 'Role must be admin or dealer.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, role: normalizedRole });
        await newUser.save();
        res.status(201).json({ message: "User Created" });
    } catch (error) { res.status(400).json({ error: "Username already exists." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign(
            { id: user._id, role: String(user.role || '').toLowerCase(), username: user.username }, 
            process.env.JWT_SECRET || 'fallback_secret_key', 
            { expiresIn: '8h' }
        );

        res.cookie('mai_token', token, {
            httpOnly: true, 
            secure: req.secure, 
            sameSite: 'lax', 
            maxAge: 8 * 60 * 60 * 1000 
        });

        res.json({ message: "Login successful", username: user.username, role: String(user.role || '').toLowerCase(), token });
    } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('mai_token');
    res.json({ message: "Logged out" });
});

// --- 7. CAR INVENTORY ROUTES ---
app.get('/api/cars/featured', async (req, res) => {
    try {
        const featuredCar = await Car.findOne({ isFeatured: true });
        res.json(featuredCar || null);
    } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/cars', requireAuth, async (req, res) => {
    try {
        let cars;
        if (String(req.user.role || '').toLowerCase() === 'admin') {
            cars = await Car.find().sort({ createdAt: -1 });
        } else {
            cars = await Car.find({ dealerId: req.user.username }).sort({ createdAt: -1 });
        }
        res.json(cars);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch cars" });
    }
});

app.post('/api/cars', requireAuth, requireAdmin, uploadPhotos.array('photos', 30), async (req, res) => {
    try {
        const { 
            makeModel, auctionPrice, transportPrice, amountPaid, vin, dealerId, 
            purchaseDate, auctionName, lotNumber, buyLocation, containerNumber, containerCode,
            recipientFirstName, recipientLastName, recipientId, recipientPhone 
        } = req.body;
        
        const finalDealerId = (dealerId || req.user.username || '').trim();
        
        const imagePaths = (req.files || []).map(file => ({ url: file.path, publicId: file.filename }));
        if (!makeModel || !vin || !finalDealerId) {
            return res.status(400).json({ error: 'Make/Model, VIN, and Dealer are required.' });
        }
        
        const newCar = new Car({ 
            makeModel, 
            auctionPrice: Number(auctionPrice) || 0, transportPrice: Number(transportPrice) || 0, amountPaid: Number(amountPaid) || 0, 
            vin, dealerId: finalDealerId, 
            purchaseDate, auctionName, lotNumber, buyLocation, containerNumber, containerCode,
            recipientFirstName, recipientLastName, recipientId, recipientPhone,
            images: imagePaths, status: 'Purchased', isFeatured: false 
        });
        
        await newCar.save();
        res.status(201).json(newCar);
    } catch (error) { 
        console.error("Error saving car:", error);
        res.status(400).json({ error: "Error saving car.", details: error.message }); 
    }
});

app.patch('/api/cars/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        
        const { 
            makeModel, auctionPrice, transportPrice, amountPaid, vin, dealerId, 
            purchaseDate, auctionName, lotNumber, buyLocation, containerNumber, containerCode,
            recipientFirstName, recipientLastName, recipientId, recipientPhone
        } = req.body;
        
        const finalDealerId = (dealerId || car.dealerId || req.user.username || '').trim();
        
        const updatedCar = await Car.findByIdAndUpdate(req.params.id, { 
            makeModel, 
            auctionPrice: Number(auctionPrice) || 0, transportPrice: Number(transportPrice) || 0, amountPaid: Number(amountPaid) || 0, 
            vin, dealerId: finalDealerId,
            purchaseDate, auctionName, lotNumber, buyLocation, containerNumber, containerCode,
            recipientFirstName, recipientLastName, recipientId, recipientPhone
        }, { new: true });
        res.json(updatedCar);
    } catch (error) { 
        console.error("Error updating car:", error);
        res.status(400).json({ error: "Failed to update car details." }); 
    }
});

app.delete('/api/cars/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });

        const destroyJobs = [];
        if (car.images && car.images.length > 0) {
            car.images.forEach(img => {
                if (img.publicId) destroyJobs.push(cloudinary.uploader.destroy(img.publicId, { resource_type: 'image' }).catch(() => {}));
            });
        }
        if (car.documents && car.documents.length > 0) {
            car.documents.forEach(doc => {
                if (doc.publicId) destroyJobs.push(cloudinary.uploader.destroy(doc.publicId, { resource_type: doc.resourceType || 'raw' }).catch(() => {}));
            });
        }
        await Promise.all(destroyJobs);

        await Car.findByIdAndDelete(req.params.id);
        res.json({ message: "Vehicle and all associated files deleted successfully." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete vehicle." });
    }
});

app.patch('/api/cars/:id/status', requireAuth, requireAdmin, async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        const { status } = req.body;
        await Car.findByIdAndUpdate(req.params.id, { status });
        res.json({ message: "Status updated successfully" });
    } catch (error) { res.status(400).json({ error: "Failed to update status." }); }
});

app.patch('/api/cars/:id/feature', requireAuth, requireAdmin, async (req, res) => {
    try {
        await Car.updateMany({}, { $set: { isFeatured: false } });
        await Car.findByIdAndUpdate(req.params.id, { isFeatured: true });
        res.json({ message: "Deal of the Day updated!" });
    } catch (error) { res.status(400).json({ error: "Failed to feature car." }); }
});

app.patch('/api/cars/:id/documents', requireAuth, requireAdmin, uploadDocs.array('docs', 5), async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        const newDocs = (req.files || []).map(f => ({
            originalName: f.originalname,
            url: f.path,
            publicId: f.filename,
            resourceType: f.mimetype && f.mimetype.startsWith('image/') ? 'image' : 'raw'
        }));
        const updatedCar = await Car.findByIdAndUpdate(req.params.id, { $push: { documents: { $each: newDocs } } }, { new: true });
        res.json(updatedCar);
    } catch (error) {
        console.error("Error uploading documents:", error);
        res.status(400).json({ error: "Failed to upload documents." });
    }
});

// Add more photos to an existing car (admin only)
app.patch('/api/cars/:id/photos', requireAuth, requireAdmin, uploadPhotos.array('photos', 30), async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        const newPhotos = (req.files || []).map(f => ({ url: f.path, publicId: f.filename }));
        if (newPhotos.length === 0) return res.status(400).json({ error: "No photos received." });
        const updatedCar = await Car.findByIdAndUpdate(req.params.id, { $push: { images: { $each: newPhotos } } }, { new: true });
        res.json(updatedCar);
    } catch (error) {
        console.error("Error uploading photos:", error);
        res.status(400).json({ error: "Failed to upload photos." });
    }
});

// Remove a single photo from a car (admin only)
app.patch('/api/cars/:id/photos/remove', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { publicId } = req.body;
        if (!publicId) return res.status(400).json({ error: "publicId is required." });
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {});
        const updatedCar = await Car.findByIdAndUpdate(req.params.id, { $pull: { images: { publicId } } }, { new: true });
        if (!updatedCar) return res.status(404).json({ error: "Car not found" });
        res.json(updatedCar);
    } catch (error) {
        res.status(400).json({ error: "Failed to remove photo." });
    }
});

// Remove a single document from a car (admin only)
app.patch('/api/cars/:id/documents/remove', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { publicId } = req.body;
        if (!publicId) return res.status(400).json({ error: "publicId is required." });
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        const doc = (car.documents || []).find(d => d.publicId === publicId);
        await cloudinary.uploader.destroy(publicId, { resource_type: doc?.resourceType || 'raw' }).catch(() => {});
        const updatedCar = await Car.findByIdAndUpdate(req.params.id, { $pull: { documents: { publicId } } }, { new: true });
        res.json(updatedCar);
    } catch (error) {
        res.status(400).json({ error: "Failed to remove document." });
    }
});

// --- 8. INVOICE ROUTES ---

// GET invoices: admin sees all, dealer sees only their own
app.get('/api/invoices', requireAuth, async (req, res) => {
    try {
        let invoices;
        if (String(req.user.role || '').toLowerCase() === 'admin') {
            invoices = await Invoice.find().sort({ createdAt: -1 });
        } else {
            invoices = await Invoice.find({ dealerId: req.user.username }).sort({ createdAt: -1 });
        }
        res.json(invoices);
    } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ error: "Failed to fetch invoices" });
    }
});

// CREATE invoice (admin only)
app.post('/api/invoices', requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            dealerId, recipientFirstName, recipientLastName, recipientId,
            makeModel, vin, description, totalAmount, amountPaid
        } = req.body;

        if (!dealerId) {
            return res.status(400).json({ error: 'Dealer is required.' });
        }

        // Auto-generate invoice number: INV-YYYYMM-XXXX
        const now = new Date();
        const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const count = await Invoice.countDocuments();
        const invoiceNumber = `INV-${ym}-${String(count + 1).padStart(4, '0')}`;

        const total = Number(totalAmount) || 0;
        const paid = Number(amountPaid) || 0;
        const status = paid >= total && total > 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid');

        const newInvoice = new Invoice({
            invoiceNumber,
            dealerId: String(dealerId).trim(),
            recipientFirstName, recipientLastName, recipientId,
            makeModel, vin, description,
            totalAmount: total, amountPaid: paid, status
        });

        await newInvoice.save();
        res.status(201).json(newInvoice);
    } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(400).json({ error: "Error creating invoice.", details: error.message });
    }
});

// DELETE invoice (admin only)
app.delete('/api/invoices/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const invoice = await Invoice.findByIdAndDelete(req.params.id);
        if (!invoice) return res.status(404).json({ error: "Invoice not found" });
        res.json({ message: "Invoice deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete invoice" });
    }
});

// DOWNLOAD invoice as PDF (admin = any, dealer = only their own)
app.get('/api/invoices/:id/pdf', requireAuth, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: "Invoice not found" });

        // Authorization: dealer can only download their own
        if (String(req.user.role || '').toLowerCase() !== 'admin' && invoice.dealerId !== req.user.username) {
            return res.status(403).json({ error: "Access Denied" });
        }

        // Brand colors
        const OBSIDIAN = '#0E0E12';
        const GOLD = '#C9A24A';
        const STAMP_RED = '#BE3B30';

        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
        doc.pipe(res);

        // Georgian font (for bank names / recipient ID label — base PDF fonts don't support Georgian)
        let georgianFontFailed = null;
        try {
            const regPath = path.join(__dirname, 'fonts', 'NotoSansGeorgian-Regular.ttf');
            const boldPath = path.join(__dirname, 'fonts', 'NotoSansGeorgian-Bold.ttf');
            if (!fs.existsSync(regPath)) throw new Error(`File not found at ${regPath}`);
            if (!fs.existsSync(boldPath)) throw new Error(`File not found at ${boldPath}`);
            doc.registerFont('Geo', regPath);
            doc.registerFont('GeoBold', boldPath);
        } catch (fontErr) {
            georgianFontFailed = fontErr.message;
            console.error('Georgian font failed to load, falling back to Helvetica:', fontErr.message);
            doc.registerFont('Geo', 'Helvetica');
            doc.registerFont('GeoBold', 'Helvetica-Bold');
        }

        const stampPath = path.join(__dirname, 'assets', 'stamp.png');
        const signaturePath = path.join(__dirname, 'assets', 'signature.png');

        const pageWidth = doc.page.width;
        const left = 50;
        const right = pageWidth - 50;

        // Header band
        doc.rect(0, 0, pageWidth, 110).fill(OBSIDIAN);
        doc.fillColor(GOLD).fontSize(26).text('MEGA CARS IMPORT', left, 35, { align: 'left' });
        doc.fillColor('#FFFFFF').fontSize(10).text('Car Import from USA to Georgia  •  Copart & IAAI', left, 68);
        doc.fillColor(GOLD).fontSize(9).text('megacar.ge  •  +995 557 936 618', left, 84);

        if (georgianFontFailed) {
            doc.fillColor('#FF4444').font('Helvetica-Bold').fontSize(7.5)
                .text(`FONT LOAD ERROR (send this to support): ${georgianFontFailed}`, left, 112, { width: pageWidth - 100 });
        }

        // Bank requisites (top-right of header band)
        const bankBoxW = 230;
        const bankX = right - bankBoxW;
        doc.fillColor(GOLD).font('GeoBold').fontSize(9)
            .text('საქართველოს ბანკი', bankX, 22, { width: bankBoxW, align: 'right' });
        doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8.5)
            .text('BAGAGE22   GE77BG0000000611187597', bankX, 34, { width: bankBoxW, align: 'right' });
        doc.fillColor(GOLD).font('GeoBold').fontSize(9)
            .text('თიბისი ბანკი', bankX, 54, { width: bankBoxW, align: 'right' });
        doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8.5)
            .text('TBCBGE22   GE20TB7351545067800004', bankX, 66, { width: bankBoxW, align: 'right' });
        doc.font('Helvetica');

        // Invoice title block
        doc.fillColor(OBSIDIAN).fontSize(22).text('INVOICE', left, 140);
        doc.fillColor('#555555').fontSize(10)
            .text(`Invoice #: ${invoice.invoiceNumber}`, left, 170)
            .text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-GB')}`, left, 185)
            .text(`Status: ${invoice.status}`, left, 200);

        // Bill To box
        doc.fillColor(OBSIDIAN).fontSize(12).text('BILL TO', right - 200, 140, { width: 200, align: 'right' });
        doc.font('Geo').fillColor('#333333').fontSize(11)
            .text(`${invoice.recipientFirstName || ''} ${invoice.recipientLastName || ''}`.trim() || '—', right - 200, 160, { width: 200, align: 'right' });
        doc.font('Helvetica').fillColor('#333333').fontSize(11)
            .text(`Dealer: ${invoice.dealerId}`, right - 200, 176, { width: 200, align: 'right' });
        if (invoice.recipientId) {
            doc.font('Geo').fillColor('#333333').fontSize(10)
                .text('პირადი ნომერი:', right - 200, 192, { width: 200, align: 'right' });
            doc.font('Helvetica').fillColor('#333333').fontSize(10)
                .text(invoice.recipientId, right - 200, 205, { width: 200, align: 'right' });
            doc.font('Helvetica');
        }

        // Divider
        doc.moveTo(left, 230).lineTo(right, 230).strokeColor(GOLD).lineWidth(2).stroke();

        // Vehicle info
        let y = 250;
        doc.fillColor(OBSIDIAN).fontSize(13).text('Vehicle Details', left, y);
        y += 22;
        doc.fillColor('#333333').fontSize(11)
            .text(`Make / Model:  ${invoice.makeModel || '—'}`, left, y);
        y += 18;
        doc.text(`VIN:  ${invoice.vin || '—'}`, left, y);
        y += 30;

        // Description
        if (invoice.description) {
            doc.fillColor(OBSIDIAN).fontSize(13).text('Description', left, y);
            y += 22;
            doc.fillColor('#333333').fontSize(11).text(invoice.description, left, y, { width: right - left });
            y += 50;
        }

        // Amount table
        const balance = (invoice.totalAmount || 0) - (invoice.amountPaid || 0);
        const tableTop = Math.max(y, 420);
        doc.rect(left, tableTop, right - left, 28).fill(OBSIDIAN);
        doc.fillColor(GOLD).fontSize(11)
            .text('DESCRIPTION', left + 12, tableTop + 9)
            .text('AMOUNT (USD)', right - 160, tableTop + 9, { width: 148, align: 'right' });

        const rows = [
            ['Total Amount', `$${(invoice.totalAmount || 0).toLocaleString()}`],
            ['Amount Paid', `$${(invoice.amountPaid || 0).toLocaleString()}`],
        ];
        let ry = tableTop + 28;
        rows.forEach(([label, val]) => {
            doc.fillColor('#333333').fontSize(11)
                .text(label, left + 12, ry + 9)
                .text(val, right - 160, ry + 9, { width: 148, align: 'right' });
            doc.moveTo(left, ry + 30).lineTo(right, ry + 30).strokeColor('#DDDDDD').lineWidth(1).stroke();
            ry += 30;
        });

        // Balance row (highlighted)
        doc.rect(left, ry, right - left, 34).fill(balance > 0 ? STAMP_RED : '#1E7E34');
        doc.fillColor('#FFFFFF').fontSize(13)
            .text(balance > 0 ? 'BALANCE DUE' : 'PAID IN FULL', left + 12, ry + 10)
            .text(`$${balance.toLocaleString()}`, right - 160, ry + 10, { width: 148, align: 'right' });
        ry += 34;

        // Stamp + signature (bottom-right, above footer)
        const sigBlockY = ry + 30;
        try { doc.opacity(0.9); doc.image(stampPath, right - 100, sigBlockY, { width: 90, height: 90 }); doc.opacity(1); } catch (e) {}
        try { doc.image(signaturePath, left, sigBlockY + 30, { width: 100 }); } catch (e) {}
        doc.moveTo(left, sigBlockY + 62).lineTo(left + 130, sigBlockY + 62).strokeColor('#DDDDDD').stroke();
        doc.font('GeoBold').fillColor(OBSIDIAN).fontSize(9).text('ლიკა ჯინჭარაძე', left, sigBlockY + 66, { width: 130 });
        doc.font('Geo').fillColor('#777777').fontSize(8).text('დირექტორი', left, sigBlockY + 78, { width: 130 });
        doc.font('Helvetica');

        // Footer
        doc.fillColor('#999999').fontSize(9)
            .text('Thank you for your business.  •  Mega Cars Import LLC  •  Poti, Batumi, Kobuleti, Georgia',
                left, doc.page.height - 70, { width: right - left, align: 'center' });

        doc.end();
    } catch (error) {
        console.error("PDF generation error:", error);
        res.status(500).json({ error: "Failed to generate PDF" });
    }
});

// --- 8b. CO-FINANCING ROUTES ---

// GET financings: admin sees all, dealer sees only their own
app.get('/api/financings', requireAuth, async (req, res) => {
    try {
        let financings;
        if (String(req.user.role || '').toLowerCase() === 'admin') {
            financings = await Financing.find().sort({ createdAt: -1 });
        } else {
            financings = await Financing.find({ dealerId: req.user.username }).sort({ createdAt: -1 });
        }
        res.json(financings);
    } catch (error) {
        console.error("Error fetching financings:", error);
        res.status(500).json({ error: "Failed to fetch financings" });
    }
});

// CREATE financing (admin only)
app.post('/api/financings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { dealerId, vin, carInfo, financedAmount, amountRepaid, fixedFee, feePaid, financedDate, notes } = req.body;
        if (!dealerId) return res.status(400).json({ error: 'Dealer is required.' });

        const financed = Number(financedAmount) || 0;
        const repaid = Number(amountRepaid) || 0;
        const fee = fixedFee !== undefined && fixedFee !== '' ? Number(fixedFee) : 200;
        const status = repaid >= financed && financed > 0 ? 'Paid Off' : 'Active';

        const newFinancing = new Financing({
            dealerId: String(dealerId).trim(),
            vin, carInfo,
            financedAmount: financed,
            amountRepaid: repaid,
            fixedFee: fee,
            feePaid: !!feePaid,
            financedDate,
            notes,
            status
        });

        await newFinancing.save();
        res.status(201).json(newFinancing);
    } catch (error) {
        console.error("Error creating financing:", error);
        res.status(400).json({ error: "Error creating financing.", details: error.message });
    }
});

// UPDATE financing (admin only) — e.g. record a repayment, mark fee paid
app.put('/api/financings/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { financedAmount, amountRepaid, fixedFee, feePaid, notes, status } = req.body;
        const financing = await Financing.findById(req.params.id);
        if (!financing) return res.status(404).json({ error: "Financing not found" });

        if (financedAmount !== undefined) financing.financedAmount = Number(financedAmount) || 0;
        if (amountRepaid !== undefined) financing.amountRepaid = Number(amountRepaid) || 0;
        if (fixedFee !== undefined) financing.fixedFee = Number(fixedFee) || 0;
        if (feePaid !== undefined) financing.feePaid = !!feePaid;
        if (notes !== undefined) financing.notes = notes;

        financing.status = status || (financing.amountRepaid >= financing.financedAmount && financing.financedAmount > 0 ? 'Paid Off' : 'Active');

        await financing.save();
        res.json(financing);
    } catch (error) {
        console.error("Error updating financing:", error);
        res.status(400).json({ error: "Error updating financing.", details: error.message });
    }
});

// DELETE financing (admin only)
app.delete('/api/financings/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const financing = await Financing.findByIdAndDelete(req.params.id);
        if (!financing) return res.status(404).json({ error: "Financing not found" });
        res.json({ message: "Financing deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete financing" });
    }
});

// --- 8c. PROFIT SHARE ROUTES ---

// GET profit shares: admin sees all, dealer sees only their own
app.get('/api/profit-shares', requireAuth, async (req, res) => {
    try {
        let shares;
        if (String(req.user.role || '').toLowerCase() === 'admin') {
            shares = await ProfitShare.find().sort({ createdAt: -1 });
        } else {
            shares = await ProfitShare.find({ dealerId: req.user.username }).sort({ createdAt: -1 });
        }
        res.json(shares);
    } catch (error) {
        console.error("Error fetching profit shares:", error);
        res.status(500).json({ error: "Failed to fetch profit shares" });
    }
});

// CREATE profit share (admin only)
app.post('/api/profit-shares', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { dealerId, vin, carInfo, totalProfit, companyPercent, dealerPercent, saleDate, notes } = req.body;
        if (!dealerId) return res.status(400).json({ error: 'Dealer is required.' });

        const profit = Number(totalProfit) || 0;
        let compPct = companyPercent !== undefined && companyPercent !== '' ? Number(companyPercent) : 50;
        let dealPct = dealerPercent !== undefined && dealerPercent !== '' ? Number(dealerPercent) : (100 - compPct);
        if (compPct + dealPct !== 100) dealPct = 100 - compPct; // keep split consistent

        const companyAmount = Math.round((profit * compPct / 100) * 100) / 100;
        const dealerAmount = Math.round((profit * dealPct / 100) * 100) / 100;

        const newShare = new ProfitShare({
            dealerId: String(dealerId).trim(),
            vin, carInfo,
            totalProfit: profit,
            companyPercent: compPct,
            dealerPercent: dealPct,
            companyAmount, dealerAmount,
            saleDate, notes,
            status: 'Pending'
        });

        await newShare.save();
        res.status(201).json(newShare);
    } catch (error) {
        console.error("Error creating profit share:", error);
        res.status(400).json({ error: "Error creating profit share.", details: error.message });
    }
});

// UPDATE profit share (admin only) — e.g. mark as paid
app.put('/api/profit-shares/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { status, notes } = req.body;
        const share = await ProfitShare.findById(req.params.id);
        if (!share) return res.status(404).json({ error: "Profit share not found" });

        if (status !== undefined) share.status = status;
        if (notes !== undefined) share.notes = notes;

        await share.save();
        res.json(share);
    } catch (error) {
        console.error("Error updating profit share:", error);
        res.status(400).json({ error: "Error updating profit share.", details: error.message });
    }
});

// DELETE profit share (admin only)
app.delete('/api/profit-shares/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const share = await ProfitShare.findByIdAndDelete(req.params.id);
        if (!share) return res.status(404).json({ error: "Profit share not found" });
        res.json({ message: "Profit share deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete profit share" });
    }
});

// --- 9. START SERVER ---
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each file must be 50 MB or smaller.' });
        if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'You can upload up to 30 photos at once.' });
        return res.status(400).json({ error: err.message });
    }
    if (err?.status === 413) return res.status(413).json({ error: 'Upload is too large for the server.' });
    return next(err);
});

app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
});
