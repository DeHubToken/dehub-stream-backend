const swaggerJsdoc = require('swagger-jsdoc');
let { config } = require('../config');

const swaggerOptions = {
  swaggerDefinition: {
    info: {
      title: 'Dehub.io',
      version: '1.0.0',
      description: 'Documentation for Dehub.io',
    },
    servers: [
      {
        url: config.baseUrl,
        description: 'Server',
      },
    ],
  },
  apis: ['./routes/*.js', './server.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
// Globals
/**
 * @swagger
 * tags:
 *   - name: Home
 *     description: Home route endpoints
 */

/**
 * @swagger
 * tags:
 *   - name: Auth
 */

/**
 * @swagger
 * tags:
 *   - name: User
 *     description: User related endpoints
 */

/**
 * @swagger
 * tags:
 *   - name: Videos
 */

/**
 * @swagger
 * tags:
 *   - name: Images
 *     description: All image related endpoints
 */

/**
 * @swagger
 * tags:
 *   - name: Public
 *     description: Public data endpoints
 */

/**
 * @swagger
 * tags:
 *   - name: Misc
 *     description: Miscellanous endpoints
 */
/**
 * @swagger
 * parameters:
 *   addressQueryParam:
 *     in: query
 *     name: address
 *     required: true
 *     schema:
 *       type: string
 *     description: The address of the user
 *   sigQueryParam:
 *     in: query
 *     name: sig
 *     required: true
 *     schema:
 *       type: string
 *     description: Sign in signature
 *   timestampQueryParam:
 *     in: query
 *     name: timestamp
 *     required: true
 *     schema:
 *       type: string
 *     description: Sign in timestamp
 *   imageWidthQueryParam:
 *     in: query
 *     name: w
 *     schema:
 *       type: string
 *     description: Image width
 *     example: 400
 */
