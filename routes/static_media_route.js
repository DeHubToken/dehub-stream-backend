const { isAddress } = require("ethers/lib/utils");
let express = require("express");
const fs = require("fs");
const path = require("path");
let router = express.Router();
// cover images for address
router.get("/covers/:id", async (req, res, next) => {
    const addressWithExt = req.params?.id;
    if (!addressWithExt || addressWithExt.split('.')?.length < 1) return res.json({ error: true });
    const imageExt = addressWithExt.split('.').pop();
    const address = addressWithExt.substring(0, addressWithExt.length - imageExt.length - 1);
    if (!isAddress(address)) return res.json({ error: true });
    const coverImagePath = `${path.dirname(__dirname)}/assets/covers/${address.toLowerCase()}.${imageExt}`;
    return res.sendFile(coverImagePath)
});

// avatar images for address
router.get("/avatars/:id", async (req, res, next) => {
    const addressWithExt = req.params?.id;
    if (!addressWithExt || addressWithExt.split('.')?.length < 1) return res.json({ error: true });
    const imageExt = addressWithExt.split('.').pop();
    const address = addressWithExt.substring(0, addressWithExt.length - imageExt.length - 1);
    if (!isAddress(address)) return res.json({ error: true });
    const avatarImagePath = `${path.dirname(__dirname)}/assets/avatars/${address.toLowerCase()}.${imageExt}`;
    return res.sendFile(avatarImagePath);
});

module.exports = router;
