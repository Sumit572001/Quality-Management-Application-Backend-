const mongoose = require('mongoose');

const checklistSchema = new mongoose.Schema({
    category: String,
    questionText: String
});

const submissionSchema = new mongoose.Schema({
    projectName: String,
    block: String,
    floor: String,
    location: String,
    submittedBy: String,
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
        // QE ki uploaded images yahan aayengi
        mediaUrls: [{ type: String }], 
        // SE ki rework images yahan aayengi
        reworkRemark: { type: String, default: '' },
        reworkMediaUrls: [{ type: String }]
    }],
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});
const ChecklistItem = mongoose.model('ChecklistItem', checklistSchema);
const Submission = mongoose.model('Submission', submissionSchema);

module.exports = { ChecklistItem, Submission };