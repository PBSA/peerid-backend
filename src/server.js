const {listModules} = require('awilix');
const {getLogger} = require('log4js');
const config = require('config');
const Raven = require('raven');

const logger = getLogger('server');

if (config.raven.enabled) {
  logger.info('Configure raven');
  Raven.config(config.raven.url).install((e, d) => {
    logger.error('Raven error: ', d);
    // process.exit(1);
  });
} else {
  logger.warn('Raven is disabled');
}

const {container, initModule} = require('./awilix');

const currentModule = process.env.MODULE || 'api';

(async () => {
  const ravenHelper = container.resolve('ravenHelper');

  try {
    await ravenHelper.init();
    const connections = listModules(['src/connections/*.js']);
    await Promise.all(connections.map(async ({name}) => {
      try {
        await container.resolve(name.replace(/\.([a-z])/g, (a) => a[1].toUpperCase())).connect();
      } catch (error) {
        logger.error(`${name} connect error`);
        logger.error(error);
        // process.exit(1);
      }
    }));
    await initModule(`${currentModule}.module`);
  } catch (err) {
    logger.error('Start error');
    ravenHelper.error(err);
  } finally {
    logger.info(`${currentModule || 'server'} has been started`);
  }
})();

/**
 * @typedef {Object} AppConfig
 * @property {String} logLevel
 * @property {{host:String, port:String|Number, database:String, user:String, password:String}} db
 * @property {String} sessionSecret
 * @property {Boolean} cors
 * @property {Number} port
 * @property {String} google.clientId
 * @property {String} google.clientSecret
 * @property {String} facebook.clientId
 * @property {String} facebook.clientSecret
 * @property {{enabled: Boolean, url: String}} raven
 * @property {String} backendUrl
 * @property {String} frontendUrl
 * @property {Object} mailer
 * @property {String} mailer.sender
 * @property {Number} mailer.port
 * @property {Boolean} mailer.secure
 * @property {{user:String, pass:String}} mailer.auth
 * @property {String} mailer.sender
 * @property {String} peerplays.peerplaysFaucetURL
 * @property {String} peerplays.peerplaysWS
 * @property {String} peerplays.referrer
 * @property {String} peerplays.paymentAccountID
 * @property {String} peerplays.paymentAccountWIF
 */
