let express = require('express');
let flash = require('connect-flash');
let path = require('path');
let session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');
let mongoose = require('mongoose');
let cors = require('cors');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let methodOverride = require('method-override');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');

let app = express();
let { config } = require('./config');
let home_route = require('./routes/home_route');
let api_route = require('./routes/api_route');
let stream_route = require('./routes/stream_route');
let nft_data_route = require('./routes/nft_metadata_route');
let static_media_route = require('./routes/static_media_route');
const docs_route = require('./routes/swagger_route');
const webSockets = require('./controllers/SocketsController');

const socketServer = http.createServer(app);
const io = socketIO(socketServer, {
  cors: {
    origin: '*',
  },
  reconnection: true,
  // reconnectionAttempts: 3,
});

app.set('view engine', 'ejs');

app.use(cookieParser());
app.use(cors());
app.use(
  session({
    secret: '1234567890',
    cookie: { secure: false },
    resave: true,
    saveUninitialized: true,
  }),
);
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 1000000 }));
app.use(bodyParser.json({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(flash());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-type,Accept');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.connect(
  'mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
  { useNewUrlParser: true, useUnifiedTopology: true },
  async function (err, db) {
    if (err) {
      console.log('[' + new Date().toLocaleString() + '] ' + 'Sorry, there is no mongo db server running.');
    } else {
      let attachDB = function (req, res, next) {
        req.db = db;
        next();
      };

      app.use('/', attachDB, home_route);

      app.use('/api', attachDB, api_route);

      app.use('/streams', attachDB, stream_route);

      app.use('/nfts', attachDB, nft_data_route);

      app.use('/statics', attachDB, static_media_route);

      app.use('/dehub-documentation', swaggerUi.serve, swaggerUi.setup(docs_route));

      // app.use(
      //   OpenApiValidator.middleware({
      //     apiSpec: docs_route,
      //     validateRequests: true,
      //     validateResponses: true,
      //   }),
      // );

      io.on('connection', socket => {
        webSockets(socket, io);
      });

      /**
       * @openapi
       * /404:
       *   get:
       *     summary: 404 response
       *     tags: [Misc]
       *     description: 404 response
       *     responses:
       *       404:
       *         description: Page not found
       */
      app.get('/404', function (req, res, next) {
        res.status(404).send('404 Error');
      });
      app.get('*', function (req, res, next) {
        res
          .status(405)
          .json({ message: `http method '${req.method}' for API endpoint (${req.originalUrl}) is not allowed` });
        // throw new Error(`http method '${req.method}' for API endpoint (${req.originalUrl}) is not allowed`)
      });

      1;
      app.use((err, req, res, next) => {
        console.log(err);
        res.status(err.status || 500);
        res.send('500 Error');
      });

      // app.listen(config.port, function () {
      //   console.log('[' + new Date().toLocaleString() + '] ' + 'Server listening ' + config.baseUrl);
      // });
      socketServer.listen(config.port, function () {
        console.log('[' + new Date().toLocaleString() + '] ' + 'Server listening ' + config.baseUrl);
      });
    }
  },
);
