const { ethers } = require('ethers');
let express = require('express');
const ApiController = require('../controllers/ApiController');
let router = express.Router();

router.post('/register', function (req, res, next) {
    return ApiController.registerUserInfo(req, res, next);
});

router.post('/update', function (req, res, next) {
    return ApiController.registerUserInfo(req, res, next);
});

router.post('/user_info', function (req, res, next) {
    return ApiController.getUserInfo(req, res, next);
})

module.exports = router;
