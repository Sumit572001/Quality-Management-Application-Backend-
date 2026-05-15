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
        const { category, subCategory, questionText } = req.body;
        const newItem = new ChecklistItem({ category, subCategory: subCategory || '', questionText });
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

app.get('/api/rework-reports', async (req, res) => {
    try {
        const userName = req.query.user;
        if (!userName) return res.status(400).json({ error: "User name missing" });
        const reworkReports = await Submission.find({
            submittedBy: userName,
            status: { $in: ['Returned', 'Rework Submitted'] }
        }).sort({ _id: -1 });
        res.json(reworkReports);
    } catch (err) {
        res.status(500).json({ error: "Rework fetch error: " + err.message });
    }
});

app.get('/api/history-reports', async (req, res) => {
    try {
        const userName = req.query.user;
        if (!userName) return res.status(400).json({ error: "User name missing" });
        const reports = await Submission.find({
            submittedBy: userName,
            status: { $in: ['Approved', 'Returned'] }
        }).sort({ _id: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: "History fetch error: " + err.message });
    }
});

app.get('/api/passed-checkpoints', async (req, res) => {
    try {
        const { block, floor, unitType, location, user } = req.query;
        if (!block || !floor) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // Find reports for this block/floor
        const query = { block, floor };
        const reports = await Submission.find(query);

        const normalize = (val) => (val || '').toString().trim().toLowerCase();
        const searchUnit = normalize(unitType);
        const searchLoc = normalize(location);
        const searchUser = normalize(user);

        const passedQuestions = new Set();
        const rejectedQuestions = new Set();
        const pendingQuestions = new Set();

        reports.forEach(report => {
            const reportUnit = normalize(report.unitType);
            const reportLoc = normalize(report.location);
            const reportUser = normalize(report.submittedBy);

            // Match location AND user
            if (reportUnit === searchUnit && reportLoc === searchLoc && reportUser === searchUser) {
                if (report.items && Array.isArray(report.items)) {
                    report.items.forEach(item => {
                        const questionText = (item.question || '').toString().trim();
                        if (!questionText) return;

                        const qeDec = (item.qeDecision || '').toString().toLowerCase();
                        const itemStatus = (item.status || '').toString().toLowerCase();

                        // Priority logic for sets: Pass > Pending > Reject
                        // 1. Check for Passed (QE decision is final)
                        if (qeDec === 'pass') {
                            passedQuestions.add(questionText);
                        }
                        // 2. Check for Pending (Submission exists but report is still under review)
                        else if (report.status === 'Pending' || report.status === 'In-Review' || report.status === 'Rework Submitted') {
                            pendingQuestions.add(questionText);
                        }
                        // 3. Check for Rejected (Only if QE rejected or report is Returned with rejected status)
                        else if (qeDec === 'fail' || qeDec === 'reject' || (itemStatus === 'rejected' && report.status === 'Returned')) {
                            rejectedQuestions.add(questionText);
                        }
                    });
                }
            }
        });

        // Ensure unique classification based on priority: Pass > Reject > Pending
        const finalPassed = Array.from(passedQuestions);
        const finalRejected = Array.from(rejectedQuestions).filter(q => !passedQuestions.has(q));
        const finalPending = Array.from(pendingQuestions).filter(q => !passedQuestions.has(q) && !rejectedQuestions.has(q));

        res.json({
            passedQuestions: finalPassed,
            rejectedQuestions: finalRejected,
            pendingQuestions: finalPending
        });
    } catch (err) {
        res.status(500).json({ error: "Checkpoints fetch error: " + err.message });
    }
});

app.get('/api/pending-reports', async (req, res) => {
    try {
        const userName = req.query.user;
        if (!userName) return res.status(400).json({ error: "User name missing" });
        const reports = await Submission.find({
            submittedBy: userName,
            status: 'Pending'
        }).sort({ _id: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: "Pending fetch error: " + err.message });
    }
});

app.get('/api/se-dashboard-stats', async (req, res) => {
    try {
        const { seName } = req.query;
        const today = new Date().toLocaleDateString('en-GB');
        const [allReports, reworkReports] = await Promise.all([
            Submission.find({ submittedBy: seName }).sort({ _id: -1 }),
            Submission.find({ submittedBy: seName, status: { $in: ['Returned', 'Rework Submitted'] } })
        ]);
        const todayTasks = allReports.filter(r => r.date === today).length;
        const reworkCount = reworkReports.length;
        let totalItems = 0;
        let passedItems = 0;
        allReports.forEach(r => {
            r.items.forEach(it => {
                if (it.qeDecision) {
                    totalItems++;
                    if (it.qeDecision === 'pass') passedItems++;
                }
            });
        });
        const compliance = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;
        res.json({
            todayTasks,
            reworkCount,
            compliance,
            recentActivity: allReports.slice(0, 5)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/se-report', async (req, res) => {
    try {
        const { user, from, to } = req.query;
        if (!user) return res.status(400).json({ error: "User missing" });
        const reports = await Submission.find({ submittedBy: user }).sort({ _id: -1 });
        const filtered = reports.filter(report => {
            if (!report.date) return false;
            const parts = report.date.split('/');
            if (parts.length !== 3) return false;
            const reportDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
            const fromDate = from ? new Date(from) : new Date('2000-01-01')
            const toDate = to ? new Date(to) : new Date()
            toDate.setHours(23, 59, 59)
            return reportDate >= fromDate && reportDate <= toDate
        });
        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: "Report fetch error: " + err.message });
    }
});

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
        const pending = await Submission.find({ status: { $regex: /^pending$/i } }).sort({ _id: -1 });
        res.json(pending);
    } catch (err) {
        res.status(500).json({ error: "Error: " + err.message });
    }
});

app.get('/api/qe/rework-approvals', async (req, res) => {
    try {
        const reworks = await Submission.find({ status: 'Rework Submitted' }).sort({ _id: -1 });
        res.json(reworks);
    } catch (err) {
        res.status(500).json({ error: "Error: " + err.message });
    }
});

app.get('/api/qe/returned-reports', async (req, res) => {
    try {
        const returned = await Submission.find({ status: 'Returned' }).sort({ _id: -1 });
        res.json(returned);
    } catch (err) {
        res.status(500).json({ error: "Error: " + err.message });
    }
});

app.get('/api/qe-dashboard-stats', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-GB');
        const [pending, reworks, all] = await Promise.all([
            Submission.find({ status: 'Pending' }),
            Submission.find({ status: 'Rework Submitted' }),
            Submission.find()
        ]);
        const criticalDefects = pending.filter(r => r.date === today && r.items?.some(i => i.qeDecision === 'fail')).length;
        const total = all.length || 1;
        const approved = all.filter(r => r.status === 'Approved').length;
        const pnd = all.filter(r => r.status === 'Pending' || r.status === 'Rework Submitted').length;
        const ret = all.filter(r => r.status === 'Returned').length;

        res.json({
            pendingApprovals: pending.length,
            criticalDefects,
            waitingRework: reworks.length,
            projectHealth: {
                approved: Math.round((approved / total) * 100),
                pending: Math.round((pnd / total) * 100),
                returned: Math.round((ret / total) * 100)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/final-approve-report', upload.array('media', 50), async (req, res) => {
    try {
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
                    const fileCount = qeItem.fileCount || 0;
                    const itemFiles = req.files.slice(fileIndex, fileIndex + fileCount);
                    fileIndex += fileCount;
                    if (itemFiles.length > 0) {
                        dbItem.mediaUrls = itemFiles.map(f => `/uploads/${f.filename}`);
                    }
                }
            }
        });
        report.qeName = qeName || 'Quality Engineer';
        report.updatedAt = new Date().toLocaleString('en-GB', { hour12: true });
        report.status = overallStatus;
        report.markModified('items');
        await report.save();
        res.json({ success: true, message: `Report ${overallStatus}!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error: " + err.message });
    }
});

app.post('/api/qe/rework-final-status', async (req, res) => {
    try {
        const { reportId, status } = req.body;
        const report = await Submission.findById(reportId);
        if (!report) return res.status(404).json({ success: false, message: "Report nahi mili!" });
        report.status = status === 'Approved' ? 'Approved' : 'Returned';

        // If Approved, we must also update the individual items' qeDecision to 'pass'
        // so that they appear as green/cleared in the SE checklist view.
        if (status === 'Approved' && report.items && Array.isArray(report.items)) {
            report.items.forEach(item => {
                const qeDec = (item.qeDecision || '').toString().toLowerCase();
                if (qeDec === 'fail' || qeDec === 'reject') {
                    item.qeDecision = 'pass';
                    item.status = 'Passed'; // Update status too for consistency
                }
            });
            report.markModified('items');
        }

        await report.save();
        res.json({ success: true, message: `Rework ${status}!` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

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
app.post('/api/buildings', async (req, res) => {
    try {
        if (!req.body.name) return res.status(400).json({ error: "Name is required" });
        await new Building({ name: req.body.name }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/buildings/:id', async (req, res) => {
    try {
        await Building.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: FLOOR APIs (UPDATED: Added Building Filter) =====
const floorSchema = new mongoose.Schema({
    name: String,
    buildingName: String // Added for dynamic link
});
const Floor = mongoose.model('Floor', floorSchema);

app.get('/api/floors', async (req, res) => {
    try {
        const { building } = req.query; // Check if building filter is passed
        let query = {};
        if (building) query.buildingName = building;
        const floors = await Floor.find(query).sort({ name: 1 });
        res.json(floors);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/floors', async (req, res) => {
    try {
        const { name, buildingName } = req.body; // Added buildingName while saving
        await new Floor({ name, buildingName }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/floors/:id', async (req, res) => {
    try {
        await Floor.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: UNIT/AREA APIs (UPDATED: Added Floor Filter) =====
const unitSchema = new mongoose.Schema({
    name: String,
    floorName: String, // Added for dynamic link
    buildingName: String // Added to prevent cross-building floor name conflicts
});
const Unit = mongoose.model('Unit', unitSchema);

app.get('/api/units', async (req, res) => {
    try {
        const { floor, building } = req.query;
        let query = {};
        if (floor) query.floorName = floor;
        // ✅ Building filter bhi add karo
        if (building && !floor) query.buildingName = building;
        const units = await Unit.find(query).sort({ name: 1 });
        res.json(units);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/units', async (req, res) => {
    try {
        const { name, floorName, buildingName } = req.body; // Added floorName and buildingName while saving
        await new Unit({ name, floorName, buildingName }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/units/:id', async (req, res) => {
    try {
        await Unit.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== HOD DASHBOARD APIs =====

// 1. GET /api/hod/rework-summary
app.get('/api/hod/rework-summary', async (req, res) => {
    try {
        const reworks = await Submission.find({
            status: { $in: ['Returned', 'Rework Submitted'] }
        });

        const totalReworks = reworks.length;
        const affectedProjects = new Set();
        let totalReworkItems = 0;
        const projectStatsMap = {};

        reworks.forEach(report => {
            const projectName = report.projectName || 'Unknown Project';
            affectedProjects.add(projectName);
            if (!projectStatsMap[projectName]) {
                projectStatsMap[projectName] = {
                    projectName: projectName,
                    reworkCount: 0,
                    siteName: report.siteName || ''
                };
            }

            if (report.items && Array.isArray(report.items)) {
                report.items.forEach(item => {
                    if (item.qeDecision === 'fail') {
                        totalReworkItems++;
                        projectStatsMap[projectName].reworkCount++;
                    }
                });
            }
        });

        const projectWise = Object.values(projectStatsMap).sort((a, b) => b.reworkCount - a.reworkCount);

        res.json({
            totalReworks,
            totalReworkItems,
            projectWise
        });
    } catch (err) {
        res.status(500).json({ error: "HOD Summary error: " + err.message });
    }
});

// 2. GET /api/hod/project-reworks?project=PROJECT_NAME
app.get('/api/hod/project-reworks', async (req, res) => {
    try {
        const { project } = req.query;
        if (!project) return res.status(400).json({ error: "Project name missing" });

        const reports = await Submission.find({
            projectName: project,
            'items.qeDecision': 'fail'
        });

        const categoryStatsMap = {};

        reports.forEach(report => {
            if (report.items && Array.isArray(report.items)) {
                report.items.forEach(item => {
                    if (item.qeDecision === 'fail') {
                        const category = item.category || 'General';
                        if (!categoryStatsMap[category]) {
                            categoryStatsMap[category] = {
                                category: category,
                                reworkCount: 0,
                                checkpoints: []
                            };
                        }

                        categoryStatsMap[category].reworkCount++;
                        categoryStatsMap[category].checkpoints.push({
                            question: item.question,
                            block: report.block,
                            floor: report.floor,
                            unitType: report.unitType,
                            location: report.location,
                            seName: report.submittedBy,
                            qeName: report.qeName,
                            date: report.date,
                            observation: item.observation,
                            qeRemark: item.qeRemark
                        });
                    }
                });
            }
        });

        const categoryWise = Object.values(categoryStatsMap).sort((a, b) => b.reworkCount - a.reworkCount);

        res.json({
            projectName: project,
            categoryWise
        });
    } catch (err) {
        res.status(500).json({ error: "Project rework details error: " + err.message });
    }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://192.168.12.65:${PORT}`);
});