let express = require('express');
let router = express.Router();

let middleware_controller = require('../controllers/MiddlewareController');
let home_controller = require('../controllers/HomeController');

router.get('/', middleware_controller.m_checkLogin, function (req, res, next) {
  return 'Not Call !!!';
});

router.get('/dehub', (req, res, next) => {
  res.json({ message: 'Welcome to Dehub Backend server' });
});

module.exports = router;
