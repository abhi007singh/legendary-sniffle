const router = require("express").Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid")
const { z } = require("zod");
const InputCSV = require("../models/InputCSV");
const reduceImageQuality = require("../services/imageProcessing.service");
const csvParser = require("csv-parser");
const fs = require("fs");

const csvRowSchema = z.object({
    'S No': z.string().regex(/^\d+$/, 'S No must be a number (as a string)'), // Ensures 'S No' is a string that contains only digits
    'Product Name': z.string().min(1, 'Product Name cannot be empty'), // Ensures non-empty product name
    'Input Image Urls': z.string().transform((urls) => {
        const urlArray = urls.split(',').map(url => url.trim()); // Split and trim the URLs
        return urlArray; // Return the array of URLs
    }).refine((urlArray) => {
        return urlArray.every(url => z.string().url().safeParse(url).success); // Validate each URL
    }, 'All Input Image URLs must be valid URLs') // Custom error message if any URL is invalid
});

const upload = multer({
    dest: "upload/",
    fileFilter: function (_req, file, cb) {
        file.mimetype === 'text/csv' ? cb(null, true) : cb(null, false)
    }
});

router.post("/parse", upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(411).json({ message: "Error in file upload" });

    const requestId = uuidv4();

    let result = [];
    let csvArr = [];
    try {
        fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on("data", (csvRow) => {
                csvArr.push(csvRow);
            })
            .on("end", async function () {
                console.log('CSV file successfully processed:', csvArr);
                fs.unlinkSync(req.file.path);
                csvArr.forEach(csv => {
                    console.log(csv);
                    csv = csvRowSchema.parse(csv);
                    console.log(csv);
                    let obj = {
                        requestId: requestId,
                    };
                    Object.keys(csv).forEach(header => {
                        let key = camelize(header);
                        obj[key] = csv[header];
                    });
                    result.push(obj);
                });
                console.log(result);
                res.json({
                    message: "CSV data saved to DB",
                    data: { referenceId: requestId }
                });
                await InputCSV.create(result);
                reduceImageQuality(requestId);
            })
            .on('error', (error) => {
                console.error('Error processing CSV file:', error);
                res.status(500).json({ message: 'Error processing CSV file', error });
            });
    } catch (error) {
        console.error(error);
        return res.status(error.status ? error.status : 500).json({ message: error.message, data: error.data });
    }
});

router.get("/status/:requestId", async (req, res) => {
    try {
        const output = await InputCSV.find({ requestId: req.params.requestId })
            .select("_id productName status")
            .lean();
        if (!output || output === undefined) return res.status(404).json({ message: "No record in DB." });
        res.json({ message: `Processing status`, data: output });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

module.exports = router;

// Helper Functions

function camelize(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}