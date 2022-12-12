const { ethers } = require("ethers");
let express = require("express");
const fs = require("fs");
const path = require("path");
const { StreamController } = require("../controllers/StreamController");
let router = express.Router();

router.get("/nft_metadata/:id", async function (req, res, next) {
    return StreamController.getMetaData(req, res, next);
});

router.get("/images/:id", (req, res, next) => {
    StreamController.getImage(req, res, next);
});

module.exports = router;
