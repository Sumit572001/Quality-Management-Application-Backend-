const mongoose = require('mongoose');
const fs = require('fs');

const submissionSchema = new mongoose.Schema({
    projectName: String,
    block: String,
    floor: String,
    unitType: String,
    location: String,
    submittedBy: String,
    date: String,
    items: [{
        question: String,
        category: String,
        status: String,
        qeDecision: String,
        qeRemark: String,
        observation: String,
        mediaUrls: [String],
        reworkRemark: String,
        reworkMediaUrls: [String],
        history: [{
            round: Number,
            date: String,
            submittedAt: String,
            observation: String,
            qeRemark: String,
            mediaUrls: [String],
            reworkRemark: String,
            reworkMediaUrls: [String]
        }]
    }],
    status: String
});

const Submission = mongoose.model('Submission', submissionSchema);

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/nyati_quality_db');
        const submissions = await Submission.find().sort({ _id: -1 }).limit(10);
        let output = "";
        for (const sub of submissions) {
            output += `\n=== Submission ${sub._id} ===\n`;
            output += `Location: ${sub.block}-${sub.floor}-${sub.location} | Status: ${sub.status}\n`;
            sub.items.forEach((item, idx) => {
                if (item.qeDecision === 'fail' || item.qeDecision === 'reject' || item.history.length > 0) {
                    output += `  Item idx ${idx}: ${item.question}\n`;
                    output += `    reworkRemark: "${item.reworkRemark}"\n`;
                    output += `    reworkMediaUrls: ${JSON.stringify(item.reworkMediaUrls)}\n`;
                    output += `    history rounds count: ${item.history.length}\n`;
                    item.history.forEach(h => {
                        output += `      Round ${h.round} | qeObs: "${h.observation}" | qeRem: "${h.qeRemark}" | qeMedia: ${JSON.stringify(h.mediaUrls)} | seRem: "${h.reworkRemark}" | seMedia: ${JSON.stringify(h.reworkMediaUrls)}\n`;
                    });
                }
            });
        }
        fs.writeFileSync('db_output.txt', output);
        console.log("Successfully wrote db_output.txt!");
    } catch (err) {
        fs.writeFileSync('db_output.txt', "Error: " + err.message);
    } finally {
        await mongoose.disconnect();
    }
}

run();
