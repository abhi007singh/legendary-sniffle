const router = require("express").Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid")
const { z } = require("zod");
const InputCSV = require("../models/InputCSV");
const reduceImageQuality = require("../services/imageProcessing.service");
const csvParser = require("csv-parser");
const fs = require("fs");
const path = require("path");

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

        for (out of output)
            if (out.status !== "completed")
                return res.json({ message: `Processing status`, data: output });

        const csvData = await InputCSV
            .find({ requestId: req.params.requestId })
            .select("-_id sNo productName inputImageUrls outputImageUrls")
            .lean();
        let csvString = "";
        let headers = Object.keys(csvData[0]);
        headers = headers.map(header => camelCaseToTitleCase(header)).join(",") + "\r\n";
        for (csv of csvData) {
            let line = "";
            Object.keys(csvData[0]).map(data => {
                line += Array.isArray(csv[data]) ? `"${csv[data]}"` : csv[data];
                line += ",";
            });
            line = line.slice(0, -1);
            csvString += line + "\r\n";
        }
        csvString = headers + csvString;

        const filePath = path.join(__dirname, 'output.csv');

        fs.writeFile(filePath, csvString, (err) => {
            if (err) {
                console.log(err.message);
                return res.status(500).send('Error writing CSV file');
            }

            res.setHeader('Content-Disposition', 'attachment; filename="output.csv"');
            res.setHeader('Content-Type', 'text/csv');

            res.sendFile(filePath, (err) => {
                if (err) {
                    return res.status(500).send('Error sending file');
                }

                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting file:', err);
                    }
                });
            });
        });
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

function camelCaseToTitleCase(camelCaseStr) {
    return camelCaseStr
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}