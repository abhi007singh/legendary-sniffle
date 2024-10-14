const axios = require("axios");
const sharp = require("sharp");
const InputCSV = require("../models/InputCSV");
const { IMAGE_QUALITY_REDUCTION } = require("../constants");

async function reduceImageQuality(requestId) {
    try {
        const inputCSVs = await InputCSV.find({ requestId });
        for (const inputCSV of inputCSVs) {
            const imageUrls = inputCSV.inputImageUrls; // Now this is already an array of URLs

            // Process each image URL one by one
            for (const imageUrl of imageUrls) {
                try {
                    // Fetch and process the image
                    const outputData = await fetchImages(imageUrl);
                    let imgData = await sharp(outputData.image).jpeg({ IMAGE_QUALITY_REDUCTION }).toBuffer();
                    imgData = bufferToBlob(imgData);
                    let uploadUrl = await uploadImages({ url: outputData.url, image: imgData });
                    inputCSV.outputImageUrls.push(uploadUrl);

                    // Save the document after processing each image
                    await inputCSV.save();

                    console.log(`Image processed and saved for ${imageUrl}`);
                } catch (error) {
                    console.error(`Error processing image ${imageUrl}:`, error.message);
                }
            }
        }

        sendWebhookNotification(requestId);
    } catch (error) {
        console.error(error);
    }
}

async function fetchImages(url) {
    const image = await getImageBuffer(url);
    return { url: url, image: image };
}

async function getImageBuffer(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        console.error(error.message);
    }
}

async function uploadImages(imageData) {
    try {
        const fileData = imageData.url.split("/");
        const fileName = fileData[fileData.length - 1];

        // Create a new name for the output file
        const outputFileName = fileName.replace(/(\.[\w\d_-]+)$/i, '-output$1');

        let formData = new FormData();
        formData.append('image', imageData.image, outputFileName);

        // Upload the image to the local server
        await axios.post(
            `${process.env.IMAGE_SERVER_URL}/upload`,
            formData,
            {
                headers: { "Content-Type": "multipart/form-data" },
            }
        );
        // Return the new output URL, replacing "input" with "output"
        return `${process.env.IMAGE_URL}/images/input/${outputFileName}`;
    } catch (error) {
        console.error(error.message);
    }
}

function bufferToBlob(buffer, mimeType) {
    return new Blob([buffer], { type: mimeType });
}

module.exports = reduceImageQuality;

// Webhook function

function sendWebhookNotification(requestId) {
    const webhookUrl = "http://localhost:3100/webhook";

    axios.post(webhookUrl, { requestId, status: "completed" })
        .then(response => console.log(`Webhook sent: ${response.data}`))
        .catch(error => console.error("Error sending webhook:", error));
}