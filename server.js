const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('./models/User'); 
const { ChecklistItem, Submission } = require('./models/Checklist');

const app = express();

// File Upload Setup
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

mongoose.connect('mongodb://127.0.0.1:27017/nyati_quality_db')
    .then(() => console.log("✅ MongoDB connect ho gaya!"))
    .catch(err => console.error("❌ Database fail:", err));

// --- AUTH ---
app.post('/api/register', async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({ message: "User Successfully Created!" });
    } catch (err) {
        res.status(400).json({ error: "Error: " + err.message });
    }
});


// Aapke backend file mein aisa kuch dikhega:
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (user) {
            res.json({ 
                success: true, 
                role: user.role, 
                fullName: user.fullName,
                siteName: user.siteName,
                block: user.block,
                floor: user.floor
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid ID or Password!" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CHECKLIST MANAGEMENT ---
app.post('/api/add-checklist-item', async (req, res) => {
    try {
        const { category, questionText } = req.body;
        const newItem = new ChecklistItem({ category, questionText });
        await newItem.save();
        res.json({ success: true, message: "Point saved!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/checklist-items', async (req, res) => {
    try {
        const items = await ChecklistItem.find().sort({ _id: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/delete-checklist-item/:id', async (req, res) => {
    try {
        await ChecklistItem.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- SE SIDE ---
app.post('/api/submit-report', async (req, res) => {
    try {
        const reportData = { ...req.body, status: 'Pending' };
        const newReport = new Submission(reportData);
        await newReport.save();
        res.json({ success: true, message: "Report Sent to QE!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error: " + err.message });
    }
});

// ✅ FIX: Rework API — 'Returned' AND 'Rework Submitted' dono fetch karo
app.get('/api/rework-reports', async (req, res) => {
    try {
        const userName = req.query.user;
        console.log("🔍 Rework fetch for user:", userName); // Yeh dekho terminal mein
        
        if (!userName) return res.status(400).json({ error: "User name missing" });
        
        const reworkReports = await Submission.find({ 
            submittedBy: userName,
            status: { $in: ['Returned', 'Rework Submitted'] }
        }).sort({ _id: -1 });
        
        console.log("📋 Reports found:", reworkReports.length); // Yeh bhi dekho
        console.log("📋 Statuses:", reworkReports.map(r => r.status)); // Status check karo
        
        res.json(reworkReports);
    } catch (err) {
        console.error("Rework Error:", err);
        res.status(500).json({ error: "Rework fetch error: " + err.message });
    }
});


// --- SE: History Reports ---
app.get('/api/history-reports', async (req, res) => {
    
    try {
        const userName = req.query.user;
        console.log("📚 History fetch for user:", userName);
        
        if (!userName) return res.status(400).json({ error: "User name missing" });
        
        const reports = await Submission.find({
            submittedBy: userName,
            status: { $in: ['Approved', 'Returned', 'Rework Submitted'] }
        }).sort({ _id: -1 });
        
        const filtered = reports.filter(r => 
            r.items.some(i => i.qeDecision === 'pass')
        );
        
        console.log("📚 History reports found:", filtered.length);
        res.json(filtered);
    } catch (err) {
        console.error("History Error:", err);
        res.status(500).json({ error: "History fetch error: " + err.message });
    }
});


// --- SE: Date Range Report ---
app.get('/api/se-report', async (req, res) => {
    try {
        const { user, from, to } = req.query;
        if (!user) return res.status(400).json({ error: "User missing" });

        // Saari reports fetch karo user ki
        const reports = await Submission.find({
            submittedBy: user
        }).sort({ _id: -1 });

        // Date filter karo
        const filtered = reports.filter(report => {
            if (!report.date) return false;
            // Date format: DD/MM/YYYY
            const parts = report.date.split('/');
            if (parts.length !== 3) return false;
            const reportDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
            const fromDate = from ? new Date(from) : new Date('2000-01-01')
            const toDate = to ? new Date(to) : new Date()
            toDate.setHours(23, 59, 59) // To date ka end of day
            return reportDate >= fromDate && reportDate <= toDate
        });

        res.json(filtered);
    } catch (err) {
        console.error("Report Error:", err);
        res.status(500).json({ error: "Report fetch error: " + err.message });
    }
});


// --- NEW: SE SUBMIT REWORK TO QE ---
app.post('/api/submit-rework', upload.array('media', 50), async (req, res) => {
    try {
        const { id, itemsData } = req.body;
        const report = await Submission.findById(id);
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        const parsedItems = JSON.parse(itemsData);
        let fileIndex = 0;

        parsedItems.forEach((reworkItem) => {
            if (report.items[reworkItem.index]) {
                const item = report.items[reworkItem.index];
                item.reworkRemark = reworkItem.reworkRemark || '';
                
                const fileCount = reworkItem.fileCount || 0;
                const itemFiles = req.files.slice(fileIndex, fileIndex + fileCount);
                fileIndex += fileCount;

                if (itemFiles.length > 0) {
                    item.reworkMediaUrls = itemFiles.map(f => `/uploads/${f.filename}`);
                }
            }
        });

        report.status = 'Rework Submitted';
        report.markModified('items');
        await report.save();
        res.json({ success: true, message: "Rework Sent to QE for Approval!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- QE SIDE ---
app.get('/api/all-reports', async (req, res) => {
    try {
        const pending = await Submission.find({ 
            status: { $regex: /^pending$/i } 
        }).sort({ _id: -1 });
        res.json(pending);
    } catch (err) {
        res.status(500).json({ error: "Error: " + err.message });
    }
});

// --- NEW: QE REWORK APPROVAL LIST ---
app.get('/api/qe/rework-approvals', async (req, res) => {
    try {
        const reworks = await Submission.find({ status: 'Rework Submitted' }).sort({ _id: -1 });
        res.json(reworks);
    } catch (err) {
        res.status(500).json({ error: "Error: " + err.message });
    }
});

app.post('/api/final-approve-report', upload.array('media', 50), async (req, res) => {
    try {
        // 1. req.body se qeName ko bhi extract karein
        const { id, itemsData, overallStatus, qeName } = req.body; 
        const report = await Submission.findById(id);
        
        if (!report) return res.status(404).json({ success: false, message: "Report nahi mili!" });

        const parsedItems = JSON.parse(itemsData);
        let fileIndex = 0;

        parsedItems.forEach((qeItem) => {
            if (report.items[qeItem.index]) {
                const dbItem = report.items[qeItem.index];
                dbItem.qeDecision = qeItem.qeDecision;
                dbItem.qeRemark = qeItem.qeRemarks || '';
                
                if (qeItem.qeDecision === 'fail') {
                    dbItem.observation = qeItem.observation || '';
                    dbItem.contractor = qeItem.contractor || '';
                    dbItem.targetDate = qeItem.targetDate || '';
                    
                    const fileCount = qeItem.fileCount || 0;
                    const itemFiles = req.files.slice(fileIndex, fileIndex + fileCount);
                    fileIndex += fileCount;
                    
                    if (itemFiles.length > 0) {
                        dbItem.mediaUrls = itemFiles.map(f => `/uploads/${f.filename}`);
                    }
                }
            }
        });

        // 2. Database mein QE ka naam save karne ke liye line add ki hai
        // Agar frontend se qeName nahi aayega toh default 'Quality Engineer' rahega
        report.qeName = qeName || 'Quality Engineer';

        // ✅ Date & Time update logic
        report.updatedAt = new Date().toLocaleString('en-GB', { hour12: true });

        report.status = overallStatus;
        report.markModified('items');
        await report.save();
        
        res.json({ success: true, message: `Report ${overallStatus}!` });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ success: false, message: "Error: " + err.message });
    }
});

// QE Decision Route (Check karo aapke pas aisa kuch hoga)
app.post('/api/qe-submit-decision', async (req, res) => {
    const { reportId, items } = req.body;

    // Logic: Agar ek bhi item 'fail' hai, toh poori report 'Returned' hogi
    const hasFail = items.some(item => item.qeDecision === 'fail');
    const finalStatus = hasFail ? 'Returned' : 'Approved';

    try {
        await Submission.findByIdAndUpdate(reportId, {
            items: items, // Updated items with fail/pass
            status: finalStatus // <--- YE SABSE ZAROORI HAI
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).send(err);
    }
});

// ✅ QE: Rework Final Status (Pass ya Reject Again)
app.post('/api/qe/rework-final-status', async (req, res) => {
    try {
        const { reportId, status } = req.body;
        const report = await Submission.findById(reportId);
        if (!report) return res.status(404).json({ success: false, message: "Report nahi mili!" });
        
        if (status === 'Approved') {
            report.status = 'Approved';
        } else {
            report.status = 'Returned'; // ✅ Wapas SE ko bhejo
        }
        
        await report.save();
        res.json({ success: true, message: `Rework ${status}!` });
    } catch (err) {
        console.error("Rework Status Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- HISTORY ---
app.get('/api/my-reports', async (req, res) => {
    try {
        const userName = req.query.user; 
        const reports = await Submission.find({ submittedBy: userName }).sort({ _id: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ success: false, message: "Error" });
    }
});

// ===== ADMIN: CATEGORY APIs =====
const categorySchema = new mongoose.Schema({ name: String });
const Category = mongoose.model('Category', categorySchema);

app.get('/api/categories', async (req, res) => {
    try { res.json(await Category.find().sort({ name: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/categories', async (req, res) => {
    try {
        await new Category({ name: req.body.name }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/categories/:id', async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: BUILDING APIs =====
const buildingSchema = new mongoose.Schema({ name: String });
const Building = mongoose.model('Building', buildingSchema);

app.get('/api/buildings', async (req, res) => {
    try { res.json(await Building.find().sort({ name: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
// Example for Buildings (Yahi logic Floor aur Unit mein bhi laga sakte hain)
app.post('/api/buildings', async (req, res) => {
    try {
        if (!req.body.name) return res.status(400).json({ error: "Name is required" }); // Check if name is empty
        await new Building({ name: req.body.name }).save();
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
app.delete('/api/buildings/:id', async (req, res) => {
    try {
        await Building.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: FLOOR APIs =====
const floorSchema = new mongoose.Schema({ name: String });
const Floor = mongoose.model('Floor', floorSchema);

app.get('/api/floors', async (req, res) => {
    try { res.json(await Floor.find().sort({ name: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/floors', async (req, res) => {
    try {
        await new Floor({ name: req.body.name }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/floors/:id', async (req, res) => {
    try {
        await Floor.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: UNIT/AREA APIs =====
const unitSchema = new mongoose.Schema({ name: String });
const Unit = mongoose.model('Unit', unitSchema);

app.get('/api/units', async (req, res) => {
    try { res.json(await Unit.find().sort({ name: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/units', async (req, res) => {
    try {
        await new Unit({ name: req.body.name }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/units/:id', async (req, res) => {
    try {
        await Unit.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://192.168.12.93:${PORT}`);
});