// Manual admin seeder (optional). The server also auto-creates an admin on first boot.
// Usage (local): set ADMIN_USERNAME and ADMIN_PASSWORD in your .env, then: npm run seed:admin
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./Models/User');
require('dotenv').config();

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB...");

        const username = process.env.ADMIN_USERNAME;
        const password = process.env.ADMIN_PASSWORD;
        if (!username || !password) {
            console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables first.");
            process.exit(1);
        }

        const existing = await User.findOne({ username });
        if (existing) { console.log("User already exists. Nothing to do."); process.exit(); }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, role: "admin" });
        console.log(`--- SUCCESS --- Admin created: ${username}`);
        process.exit();
    } catch (error) {
        console.error("Error seeding admin:", error);
        process.exit(1);
    }
})();
