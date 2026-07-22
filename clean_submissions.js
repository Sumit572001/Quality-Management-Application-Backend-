const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function cleanData() {
    try {
        console.log("Connecting to database: mongodb://127.0.0.1:27017/nyati_quality_db ...");
        await mongoose.connect('mongodb://127.0.0.1:27017/nyati_quality_db');
        console.log("✅ Connected successfully!");

        // 1. Delete all Submissions
        console.log("Deleting submissions...");
        const submissionCollection = mongoose.connection.db.collection('submissions');
        const deleteSubmissionsResult = await submissionCollection.deleteMany({});
        console.log(`✅ Deleted ${deleteSubmissionsResult.deletedCount} submissions.`);

        // 2. Clear Uploads folder
        const uploadsDir = path.join(__dirname, 'uploads');
        console.log(`Clearing upload files in: ${uploadsDir} ...`);
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            let deletedFilesCount = 0;
            for (const file of files) {
                const filePath = path.join(uploadsDir, file);
                // Make sure not to delete directories, only files
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                    deletedFilesCount++;
                }
            }
            console.log(`✅ Deleted ${deletedFilesCount} files from uploads folder.`);
        } else {
            console.log("Uploads folder does not exist. Skipping file deletion.");
        }

        console.log("\n🎉 Database cleanup complete! All submissions and uploaded images removed successfully.");
        console.log("Your checklists, checkpoints, buildings, floors, and categories are completely untouched.");
        
    } catch (err) {
        console.error("❌ An error occurred during cleanup:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

cleanData();
