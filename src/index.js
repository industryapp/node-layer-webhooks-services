
var LayerWebhooks = require('layer-webhooks');

/**
 * Layer Webhook Services constructor
 *
 * @class
 * @param  {Object} config Configuration values
 * @param  {String} config.token Layer Platform API token
 * @param  {String} config.appId Layer Application ID
 */
module.exports = function(config) {
    var webhooksClient = new LayerWebhooks(config);

    this.listen = require('./listen');
    this.receipts = require('./receipts').bind(null, config.redis);
    this.register = require('./register').bind(null, webhooksClient);
};
