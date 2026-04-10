const mongoose = require('mongoose');

// User Schema define kar rahe hain
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['SE', 'QE', 'HOD', 'ADMIN'], required: true },
    fullName: String,
    siteName: String,
    block: String,
    floor: String
});

const User = mongoose.model('User', userSchema);

async function run() {
    try {
        console.log("1. Database se connect ho raha hai...");
        await mongoose.connect('mongodb://127.0.0.1:27017/nyati_quality_db');
        console.log("2. Connection OK!");

        console.log("3. Purane users saaf kar raha hoon...");
        await User.deleteMany({});

        console.log("4. Naye users daal raha hoon...");
        const testUsers = [
            { 
                username: "rahul_se", 
                password: "se123", 
                role: "SE", 
                fullName: "Rahul Sharma", 
                siteName: "Medical College Munger",
                block: "Block A",
                floor: "Ground Floor"
            },
            { 
                username: "amit_qe", 
                password: "qe123", 
                role: "QE", 
                fullName: "Amit Kumar", 
                siteName: "Nyati Unitree",
                block: "Block B",
                floor: "1st Floor"
            }
        ];

        await User.insertMany(testUsers);
        console.log("5. MUBARAK HO! Users create ho gaye hain.");

    } catch (err) {
        console.log("Lafda hua error check karo: ", err);
    } finally {
        mongoose.disconnect();
        console.log("6. Connection band.");
        process.exit();
    }
}

run();