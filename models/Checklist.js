const mongoose = require('mongoose');

const checklistSchema = new mongoose.Schema({
    category: String,
    questionText: String
});

const submissionSchema = new mongoose.Schema({
    projectName: String,
    block: String,
    floor: String,
    unitType: String,
    location: String,
    submittedBy: String,
    // ✅ YAHAN ADD KIYA HAI: Jo QE approve karega uska naam yahan save hoga
    qeName: { type: String, default: '' },
    date: String,
    items: [{
        question: String,
        category: String,
        status: String,
        qeDecision: { type: String, default: '' },
        qeRemark: { type: String, default: '' },
        observation: { type: String, default: '' },
        contractor: { type: String, default: '' },
        targetDate: { type: String, default: '' },
        mediaUrls: [{ type: String }],
        seDecision: { type: String, enum: ['yes', 'no', 'na'], default: null }, // ✅ SE ka Yes/No/N/A selection
        reworkRemark: { type: String, default: '' },
        reworkMediaUrls: [{ type: String }]
    }],
    submittedAt: { type: String, default: '' },
    updatedAt: { type: String, default: '' },
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

const ChecklistItem = mongoose.model('ChecklistItem', checklistSchema);
const Submission = mongoose.model('Submission', submissionSchema);

module.exports = { ChecklistItem, Submission };