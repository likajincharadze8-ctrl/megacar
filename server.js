const express = require('express'); 
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
require('dotenv').config();

const app = express(); 

const User = require('./Models/User');
const Car = require('./Models/Car');

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
            connectSrc: ["'self'", "https://formspree.io", "https://static.cloudflareinsights.com"],
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
    const token = req.cookies.mai_token;
    if (!token) return res.status(401).json({ error: "Access Denied: No Token Provided" });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
        req.user = verified; 
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid or Expired Token" });
    }
};

// ADMIN ONLY middleware
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

// --- 4. STORAGE CONFIGURATION ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadsDir); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({
    storage: storage,
    limits: { files: 30, fileSize: 50 * 1024 * 1024 }
});

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
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict', 
            maxAge: 8 * 60 * 60 * 1000 
        });

        res.json({ message: "Login successful", username: user.username, role: String(user.role || '').toLowerCase() });
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

// ADMIN ONLY: dealers can NOT add cars anymore
app.post('/api/cars', requireAuth, requireAdmin, upload.array('photos', 30), async (req, res) => {
    try {
        const { 
            makeModel, auctionPrice, transportPrice, amountPaid, vin, dealerId, 
            purchaseDate, auctionName, lotNumber, buyLocation, containerNumber, containerCode,
            recipientFirstName, recipientLastName, recipientId, recipientPhone 
        } = req.body;
        
        const finalDealerId = (dealerId || req.user.username || '').trim();
        
        const imagePaths = (req.files || []).map(file => file.filename);
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

// ADMIN ONLY: only admin can edit car details
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

// ADMIN ONLY: only admin can delete cars
app.delete('/api/cars/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });

        if (car.images && car.images.length > 0) {
            car.images.forEach(img => {
                const cleanName = path.basename(img); 
                const fullPath = path.join(__dirname, 'uploads', cleanName);
                if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); }
            });
        }

        if (car.documents && car.documents.length > 0) {
            car.documents.forEach(doc => {
                const cleanName = path.basename(doc.filename);
                const fullPath = path.join(__dirname, 'uploads', cleanName);
                if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); }
            });
        }

        await Car.findByIdAndDelete(req.params.id);
        res.json({ message: "Vehicle and all associated files deleted successfully." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete vehicle." });
    }
});

// ADMIN ONLY: only admin can change status
app.patch('/api/cars/:id/status', requireAuth, requireAdmin, async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        const { status } = req.body;
        await Car.findByIdAndUpdate(req.params.id, { status });
        res.json({ message: "Status updated successfully" });
    } catch (error) { res.status(400).json({ error: "Failed to update status." }); }
});

// ADMIN ONLY: feature a car
app.patch('/api/cars/:id/feature', requireAuth, requireAdmin, async (req, res) => {
    try {
        await Car.updateMany({}, { $set: { isFeatured: false } });
        await Car.findByIdAndUpdate(req.params.id, { isFeatured: true });
        res.json({ message: "Deal of the Day updated!" });
    } catch (error) { res.status(400).json({ error: "Failed to feature car." }); }
});

// ADMIN ONLY: upload documents
app.patch('/api/cars/:id/documents', requireAuth, requireAdmin, upload.array('docs', 5), async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        const newDocs = req.files.map(f => ({ originalName: f.originalname, filename: f.filename }));
        const updatedCar = await Car.findByIdAndUpdate(req.params.id, { $push: { documents: { $each: newDocs } } }, { new: true });
        res.json(updatedCar);
    } catch (error) { res.status(400).json({ error: "Failed to upload documents." }); }
});

// --- 8. START SERVER ---
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
