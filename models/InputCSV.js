const mongoose = require("mongoose");

const inputCSVSchema = new mongoose.Schema({
    sNo: Number,
    requestId: String,
    productName: String,
    inputImageUrls: [String],
    outputImageUrls: [String],
    status: {
        type: String,
        default: "processing",
        enum: ["processing", "completed", "stalled", "failed"]
    },
}, {
    timestamps: true
});

const InputCSV = mongoose.model("InputCSV", inputCSVSchema);
module.exports = InputCSV;
