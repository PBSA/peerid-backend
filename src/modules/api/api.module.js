const logger = require('log4js').getLogger('api.module.js');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const MethodNotAllowedError = require('../../errors/method-not-allowed.error');
const RestError = require('../../errors/rest.error');
/**
 * @swagger
 *
 * definitions:
 *  SuccessResponse:
 *    type: object
 *    properties:
 *      status:
 *        type: number
 *        default: 200
 *        example: 200
 *  SuccessEmptyResponse:
 *    allOf:
 *      - $ref: '#/definitions/SuccessResponse'
 *      - type: object
 *        properties:
 *          result:
 *            type: boolean
 *            example: true
 */
/**
 * A namespace.
 * @namespace api
 * @class ApiModule
 */
class ApiModule {

  /**
   *
   * @param {AppConfig} opts.config
   * @param {DbConnection} opts.dbConnection
   * @param {SmtpConnection} opts.smtpConnection
   * @param {AuthController} opts.authController
   * @param {ProfileController} opts.profileController
   * @param {UsersController} opts.usersController
   * @param {GoogleController} opts.googleController
   * @param {FacebookController} opts.facebookController
   * @param {DiscordController} opts.discordController
   * @param {AppController} opts.appController
   * @param {UserRepository} opts.userRepository
   */
  constructor(opts) {
    this.config = opts.config;
    this.dbConnection = opts.dbConnection;
    this.smtpConnection = opts.smtpConnection;
    this.app = null;
    this.server = null;

    this.authController = opts.authController;
    this.profileController = opts.profileController;
    this.usersController = opts.usersController;
    this.facebookController = opts.facebookController;
    this.discordController = opts.discordController;
    this.googleController = opts.googleController;
    this.appController = opts.appController

    this.userRepository = opts.userRepository;
  }

  /**
   * Start HTTP server listener
   * @return {Promise<void>}
   */
  initModule() {
    return new Promise((resolve) => {
      logger.trace('Start HTTP server initialization');

      this.app = express();
      this.app.use(bodyParser.urlencoded({extended: true}));
      this.app.use(bodyParser.json());

      if (this.config.cors) {
        const corsOptions = {
          origin: (origin, callback) => {
            callback(null, true);
          },
          credentials: true,
          methods: ['GET', 'PUT', 'POST', 'OPTIONS', 'DELETE', 'PATCH'],
          headers: ['x-user', 'X-Signature', 'accept', 'content-type']
        };

        this.app.use(cors(corsOptions));
        this.app.options('*', cors());
      }

      const SessionStore = new SequelizeStore({
        db: this.dbConnection.sequelize,
        modelKey: 'Sessions'
      });

      this.app.use(session({
        name: 'crypto.sid',
        secret: this.config.sessionSecret,
        cookie: {maxAge: 7 * 24 * 60 * 60 * 1000}, // 7 days
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store: SessionStore
      }));

      // SessionStore.sync();

      this.app.use(passport.initialize());
      this.app.use(passport.session());

      passport.serializeUser((user, done) => {
        done(null, user.id);
      });
      passport.deserializeUser((user, done) => {
        this.userRepository.findByPk(user).then((_user) => {
          done(null, _user);
        });
      });

      // Error Handler
      this.app.use(function(err, req, res, next) {
        console.error(err)
        if (!err.statusCode) err.statusCode = 500;
        let msg = err.message
        // Do not expose 500 error messages in production, to the client. 
        //TODO: Un-comment the below comment
        if (/*process.env.NODE_ENV === "production" && */err.statusCode === 500) {
          msg = "Internal Server Error"
        }
        res.status(err.statusCode).send(msg)
      });

      this.server = this.app.listen(this.config.port, () => {
        logger.info(`API APP REST listen ${this.config.port} Port`);
        this._initRestRoutes();
        resolve();
      });
    });
  }

  /**
   * Bind routers
   */
  _initRestRoutes() {
    [
      this.authController,
      this.profileController,
      this.usersController,
      this.facebookController,
      this.discordController,
      this.googleController,
      this.appController
    ].forEach((controller) => controller.getRoutes(this.app).forEach((route) => {
      this.addRestHandler(...route);
    }));

    this.addRestHandler('use', '*', () => {
      throw new MethodNotAllowedError();
    });
  }

  /** @typedef {('get','post','patch','use')} Method */

  /**
   * @param {Method} method
   * @param {String} route
   * @param args
   */
  addRestHandler(method, route, ...args) {
    const action = args.pop();
    this.app[method](route, async (req, res) => {
      try {
        await args.reduce(async (previousPromise, handler) => {
          await previousPromise;
          return handler()(req, res);
        }, Promise.resolve());

        const result = await action(req.user, req.pure, req, res);
        return res.status(200).json({
          result: result || null,
          status: 200
        });
      } catch (error) {
        let restError = error;

        if (!(error instanceof RestError)) {
          /* istanbul ignore next */
          logger.error(error);
          /* istanbul ignore next */
          restError = {
            status: 500,
            message: 'server side error'
          };
        }

        return res.status(restError.status).json({
          error: restError.details || restError.message,
          status: restError.status
        });
      }
    });
  }

  close() {
    this.server.close();
  }

}

module.exports = ApiModule;
