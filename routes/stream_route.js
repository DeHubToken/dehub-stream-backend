const { ethers } = require("ethers");
let express = require("express");
const fs = require("fs");
const path = require("path");
const { StreamController } = require("../controllers/StreamController");
let router = express.Router();

router.get("/video/:id", (req, res, next) => {
    StreamController.getStream(req, res, next);
});

module.exports = router;
