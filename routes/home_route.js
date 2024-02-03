let express = require('express');
let router = express.Router();

let middleware_controller = require('../controllers/MiddlewareController');
let home_controller = require('../controllers/HomeController');

// /**
//  * @openapi
//  * /:
//  *   get:
//  *     summary:
//  *     tags: [Home]
//  *     description: Checks if user is logged in and redirects them to / if they are not [Not callable for now]
//  *     responses:
//  *       200:
//  *         description: Not Call !!!
//  */
router.get('/', middleware_controller.m_checkLogin, function (req, res, next) {
  return 'Not Call !!!';
});

/**
 * @openapi
 * /dehub:
 *   get:
 *     summary:
 *     tags: [Home]
 *     description: Tests if server is up
 *     responses:
 *       200:
 *         description: Welcome to Dehub Backend server
 */
router.get('/dehub', (req, res, next) => {
  res.json({ message: 'Welcome to Dehub Backend server' });
});

module.exports = router;
