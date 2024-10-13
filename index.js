require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const path = require("path");
const router = require("./routes");
const mongoose = require("mongoose");
const InputCSV = require("./models/InputCSV");

// Set `strictQuery: false` to globally opt into filtering by properties that aren't in the schema
// Included because it removes preparatory warnings for Mongoose 7.
// See: https://mongoosejs.com/docs/migrating_to_6.html#strictquery-is-removed-and-replaced-by-strict
mongoose.set("strictQuery", false);

const mongoDB = process.env.MONGO_URL || "mongodb://127.0.0.1/my_database";

main().catch((err) => console.error(err));
async function main() {
    await mongoose.connect(mongoDB);
}

const PORT = process.env.PORT || 3000;
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3100;

const app = express();
const webhook = express();

app.use("/public", express.static(path.join(__dirname, 'public')));
app.use(express.json());
// app.use(cors());
app.use(helmet());
webhook.use(express.json());
// webhook.use(cors());
webhook.use(helmet());

app.use('/api/v1', router);

webhook.post('/webhook', async (req, res) => {
    const { requestId, status } = req.body;

    await InputCSV.updateMany({ requestId }, { status });

    res.status(200).send('Webhook received');
});

(async () => {
    app.listen(PORT, () => {
        console.log(`Server is up at localhost ${PORT}`);
    });
    webhook.listen(WEBHOOK_PORT, () => {
        console.log(`Webhook listener is up at localhost ${WEBHOOK_PORT}`);
    });
})();